'use strict';
/**
 * 桌面 TTS 业务 API 桥（Node 实现，替代开发期 FastAPI voice-service 本地代理）。
 *
 * 端点契约与开发期一致（/v1/tts、/v1/voices、/health），调用豆包 seed-tts-2.0
 * 业务 API（WebSocket 二进制协议，与 services/voice-service/providers/doubao.py 逐字节一致）。
 * 关键输出：audio_path / duration / char_timestamps / timing{source:'TTS_NATIVE', words}
 * speech_segments 返回 null（开发期该字段来自 FFmpeg VAD；TTS_NATIVE 为主通道，不再依赖 FFmpeg）。
 *
 * 该服务为“业务 API 客户端”，不部署本地大型 TTS；凭据来自安全配置（safeStorage），
 * 不进入安装包。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const DEFAULT_WS_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';
const DEFAULT_RESOURCE_ID = 'seed-tts-2.0';
const DEFAULT_VOICE_ID = 'zh_male_guanggaojieshuo_uranus_bigtts';
const DEFAULT_SAMPLE_RATE = 24000;

// ============================================================================
// 协议帧（与 Python 侧 marshal/from_bytes 一致）
// ============================================================================
const MsgType = { FullClientRequest: 0b1, FullServerResponse: 0b1001, AudioOnlyServer: 0b1011, Error: 0b1111 };
const MsgTypeFlag = { NoSeq: 0, PositiveSeq: 0b1, LastNoSeq: 0b10, NegativeSeq: 0b11, WithEvent: 0b100 };
const EventType = {
  StartConnection: 1, ConnectionStarted: 50, ConnectionFailed: 51,
  StartSession: 100, FinishSession: 102, SessionStarted: 150,
  SessionFinished: 152, SessionFailed: 153, SessionCanceled: 151,
  TaskRequest: 200, TTSSentenceStart: 350, TTSSentenceEnd: 351,
  TTSResponse: 352, TTSSubtitle: 364
};

function marshal({ msgType, flag = MsgTypeFlag.WithEvent, event = 0, sessionId = '', errorCode = 0, payload = Buffer.alloc(0) }) {
  const header = Buffer.from([0x11, (msgType << 4) | flag, 0x10, 0]);
  const parts = [header];
  if (flag === MsgTypeFlag.WithEvent) {
    const ev = Buffer.alloc(4);
    ev.writeInt32BE(event, 0);
    parts.push(ev);
    if (![EventType.StartConnection, EventType.ConnectionStarted, EventType.ConnectionFailed].includes(event)) {
      const sid = Buffer.from(sessionId, 'utf-8');
      const len = Buffer.alloc(4);
      len.writeUInt32BE(sid.length, 0);
      parts.push(len, sid);
    }
  } else if (flag === MsgTypeFlag.PositiveSeq || flag === MsgTypeFlag.NegativeSeq) {
    const seq = Buffer.alloc(4);
    seq.writeInt32BE(0, 0);
    parts.push(seq);
  }
  if (msgType === MsgType.Error) {
    const ec = Buffer.alloc(4);
    ec.writeUInt32BE(errorCode, 0);
    parts.push(ec);
  }
  const plen = Buffer.alloc(4);
  plen.writeUInt32BE(payload.length, 0);
  parts.push(plen, payload);
  return Buffer.concat(parts);
}

function parseFrame(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 4) throw new Error('frame too short');
  const headerSize = (buf[0] & 0x0f) * 4;
  let offset = headerSize > 4 ? headerSize : 4;
  const msgType = buf[1] >> 4;
  const flag = buf[1] & 0x0f;
  let event = 0;
  let errorCode = 0;
  let sequence = 0;
  let sessionId = '';
  if (msgType === MsgType.Error) {
    errorCode = buf.readUInt32BE(offset);
    offset += 4;
  }
  if ([MsgType.FullClientRequest, MsgType.FullServerResponse, MsgType.AudioOnlyServer].includes(msgType) && [MsgTypeFlag.PositiveSeq, MsgTypeFlag.NegativeSeq].includes(flag)) {
    sequence = buf.readInt32BE(offset);
    offset += 4;
  }
  if (flag === MsgTypeFlag.WithEvent) {
    event = buf.readInt32BE(offset);
    offset += 4;
    if (![EventType.StartConnection, EventType.ConnectionStarted, EventType.ConnectionFailed].includes(event)) {
      const sidLen = buf.readUInt32BE(offset);
      offset += 4;
      sessionId = buf.subarray(offset, offset + sidLen).toString('utf-8');
      offset += sidLen;
    } else if ([EventType.ConnectionStarted, EventType.ConnectionFailed].includes(event)) {
      const cidLen = buf.readUInt32BE(offset);
      offset += 4;
      offset += cidLen;
    }
  }
  const payloadLen = buf.readUInt32BE(offset);
  offset += 4;
  const payload = buf.subarray(offset, offset + payloadLen);
  return { msgType, flag, event, sessionId, errorCode, sequence, payload };
}

// ============================================================================
// 豆包 TTS 合成
// ============================================================================
function speechRate(speed) {
  const clamped = Math.max(0.5, Math.min(2.0, speed));
  return Math.max(-50, Math.min(100, Math.round((clamped - 1.0) * 100)));
}
function loudnessRate(volume) {
  const clamped = Math.max(0.0, Math.min(2.0, volume));
  return Math.max(-50, Math.min(100, Math.round((clamped - 1.0) * 100)));
}

async function synthesize({ text, voiceId, speed, volume, endpoint, apiKey, resourceId, defaultVoice, userId }) {
  const providerVoiceId = resolveVoiceId(voiceId, defaultVoice);
  const sessionId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const audio = [];
    let charTimestamps = null;
    let subtitleWords = null;

    let ws;
    const cleanup = () => {
      try { ws && ws.close(); } catch { /* noop */ }
    };
    const fail = (err) => { cleanup(); reject(err); };

    const sendEvent = (event, payload, sid) => {
      const frame = marshal({
        msgType: MsgType.FullClientRequest,
        flag: MsgTypeFlag.WithEvent,
        event,
        sessionId: sid || '',
        payload: Buffer.from(JSON.stringify(payload), 'utf-8')
      });
      ws.send(frame);
    };

    try {
      ws = new WebSocket(endpoint || DEFAULT_WS_ENDPOINT, {
        headers: {
          'X-Api-Key': apiKey,
          'X-Api-Resource-Id': resourceId || DEFAULT_RESOURCE_ID
        },
        handshakeTimeout: 30000,
        maxPayload: 20 * 1024 * 1024
      });
    } catch (err) {
      fail(new Error(`ws connect failed: ${err.message}`));
      return;
    }

    ws.on('open', () => {
      sendEvent(EventType.StartConnection, {}, '');
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = parseFrame(data);
      } catch (err) {
        fail(new Error(`frame parse failed: ${err.message}`));
        return;
      }
      if (msg.msgType === MsgType.AudioOnlyServer && msg.payload.length) {
        audio.push(msg.payload);
        return;
      }
      switch (msg.event) {
        case EventType.ConnectionStarted: {
          const payload = {
            user: { uid: userId || 'zhiheng-zhiqi' },
            event: EventType.StartSession,
            req_params: {
              speaker: providerVoiceId,
              audio_params: {
                format: 'mp3',
                sample_rate: DEFAULT_SAMPLE_RATE,
                speech_rate: speechRate(speed),
                loudness_rate: loudnessRate(volume),
                enable_subtitle: true
              }
            }
          };
          sendEvent(EventType.StartSession, payload, sessionId);
          break;
        }
        case EventType.SessionStarted: {
          const taskPayload = {
            user: { uid: userId || 'zhiheng-zhiqi' },
            event: EventType.TaskRequest,
            req_params: { text }
          };
          sendEvent(EventType.TaskRequest, taskPayload, sessionId);
          sendEvent(EventType.FinishSession, {}, sessionId);
          break;
        }
        case EventType.TTSResponse: {
          const p = safeJson(msg.payload);
          if (p && typeof p === 'object') {
            const encoded = p.data || p.audio;
            if (typeof encoded === 'string' && encoded) {
              audio.push(Buffer.from(encoded, 'base64'));
            }
            const additions = p.additions || {};
            const ts = additions.speech_timestamp;
            if (Array.isArray(ts) && ts.length > 0 && charTimestamps === null) {
              const parsed = [];
              for (const item of ts) {
                if (item && typeof item === 'object') {
                  const st = item.start_time;
                  const et = item.end_time;
                  if (typeof st === 'number' && typeof et === 'number') parsed.push({ start: st, end: et });
                }
              }
              if (parsed.length) charTimestamps = parsed;
            }
          } else if (msg.payload.length) {
            audio.push(msg.payload);
          }
          break;
        }
        case EventType.TTSSubtitle: {
          const p = safeJson(msg.payload);
          if (p && typeof p === 'object' && Array.isArray(p.words)) {
            if (subtitleWords === null) subtitleWords = [];
            for (const item of p.words) {
              if (item && typeof item === 'object' && typeof item.word === 'string') {
                const st = item.startTime;
                const et = item.endTime;
                if (typeof st === 'number' && typeof et === 'number') {
                  subtitleWords.push({ text: item.word, startMs: Math.round(st * 1000), endMs: Math.round(et * 1000) });
                }
              }
            }
          }
          break;
        }
        case EventType.SessionFinished: {
          if (!audio.length) {
            fail(new Error('Doubao TTS returned no audio data.'));
            return;
          }
          const full = Buffer.concat(audio);
          let duration = 0;
          if (Array.isArray(subtitleWords) && subtitleWords.length) {
            duration = Math.round((subtitleWords[subtitleWords.length - 1].endMs / 1000) * 1000) / 1000;
          }
          resolve({ audio: full, charTimestamps, subtitleWords, duration, providerVoiceId });
          cleanup();
          break;
        }
        case EventType.ConnectionFailed:
        case EventType.SessionFailed:
        case EventType.SessionCanceled:
          fail(new Error(`doubao event ${msg.event}: ${payloadText(msg.payload)}`));
          break;
        default:
          if (msg.msgType === MsgType.Error) {
            fail(new Error(`doubao server error ${msg.errorCode}: ${payloadText(msg.payload)}`));
          }
      }
    });

    ws.on('error', (err) => fail(new Error(`doubao ws error: ${err.message}`)));
    ws.on('close', () => {
      /* SessionFinished 已结算；未结算时由调用方超时兜底 */
    });
  });
}

function safeJson(buf) {
  try {
    return JSON.parse(buf.toString('utf-8'));
  } catch {
    return null;
  }
}
function payloadText(buf) {
  try {
    return JSON.stringify(JSON.parse(buf.toString('utf-8')));
  } catch {
    return buf.toString('utf-8').slice(0, 200);
  }
}

// ============================================================================
// MP3 时长兜底解析（纯 Node，不依赖 FFmpeg）
// ============================================================================
function mp3DurationSeconds(buf) {
  const bitrates = {
    '3,1': [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null],
    '3,2': [null, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, null],
    '3,3': [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null],
    '2,1': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
    '2,2': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
    '2,3': [null, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, null]
  };
  const sampleRates = { 3: [44100, 48000, 32000, null], 2: [22050, 24000, 16000, null], 0: [11025, 12000, 8000, null] };
  const samplesPerFrame = { '3,1': 1152, '3,2': 1152, '3,3': 384, '2,1': 576, '2,2': 1152, '2,3': 384, '0,1': 576, '0,2': 1152, '0,3': 384 };
  let position = 0;
  let duration = 0;
  let frames = 0;
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    position = 10 + tagSize;
  }
  while (position + 4 <= buf.length) {
    if (buf[position] !== 0xff || (buf[position + 1] & 0xe0) !== 0xe0) { position += 1; continue; }
    const header = buf.readUInt32BE(position);
    const version = (header >> 19) & 0b11;
    const layer = (header >> 17) & 0b11;
    const bitrateIndex = (header >> 12) & 0b1111;
    const sampleRateIndex = (header >> 10) & 0b11;
    const padding = (header >> 9) & 0b1;
    if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) { position += 1; continue; }
    const bitrate = (bitrates[`${version === 3 ? 3 : 2},${layer}`] || [])[bitrateIndex];
    const sampleRate = sampleRates[version][sampleRateIndex];
    if (!bitrate || !sampleRate) { position += 1; continue; }
    const samples = samplesPerFrame[`${version},${layer}`] || 1152;
    duration += samples / sampleRate;
    frames += 1;
    let frameLength;
    if (layer === 3) frameLength = (12 * bitrate * 1000 / sampleRate + padding) * 4;
    else if (layer === 1 && (version === 0 || version === 2)) frameLength = 72 * bitrate * 1000 / sampleRate + padding;
    else frameLength = 144 * bitrate * 1000 / sampleRate + padding;
    position += Math.max(frameLength, 1);
  }
  return frames ? Math.round(duration * 1000) / 1000 : 0;
}

// ============================================================================
// HTTP 服务
// ============================================================================
// ============================================================================
// 音色目录（194 个，来自火山引擎 seed-tts-2.0 官方完整音色清单）
// voice_type 即豆包真实 speaker ID，直通 V3 WebSocket 合成，无需映射。
// ============================================================================
const RAW_VOICE_CATALOG = require('./voice-catalog.cjs');
const VOICE_CATALOG = RAW_VOICE_CATALOG.map((v, i) => ({
  voice_type: v.voice_type,
  name: v.name,
  gender: v.gender,
  language: v.language,
  scene: v.scene,
  tags: v.tags || [],
  dialects: v.dialects || [],
  description: `${v.name}（${v.scene}）`,
  sort_order: i
}));

/** 音色 ID 解析：auto/default 走默认音色，其余直通（voice_type 已是真实豆包 ID） */
function resolveVoiceId(voiceId, defaultVoice) {
  if (!voiceId || voiceId === 'auto' || voiceId === 'default') {
    return defaultVoice || DEFAULT_VOICE_ID;
  }
  return voiceId;
}

/**
 * 读取 TTS 配置：safeStorage 优先，回退到 .voice-service-env 桥接文件。
 * 桥接文件由「模型与接口」设置页保存时写入（data/.voice-service-env）。
 * 这样朋友电脑上用户在设置页填写 API Key 后，桌面 TTS 桥也能读取。
 */
function readTtsConfig(secretStore) {
  // 优先读用户最新配置的桥接文件（UI「模型与接口」保存 voice 配置时由 tts-bridge 投影生成，
  // 内容是 DB 明文的实时快照；safeStorage 可能残留早期 --import-dev-secrets 导入的旧测试凭据）。
  try {
    const dbPath = process.env.DATABASE_PATH || path.join(require('os').homedir(), 'AppData', 'Local', 'ZhihengZhiqi', 'data', 'zhiheng_local.db');
    const bridgeFile = path.join(path.dirname(dbPath), '.voice-service-env');
    if (fs.existsSync(bridgeFile)) {
      const content = fs.readFileSync(bridgeFile, 'utf8');
      const env = {};
      for (const line of content.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      if (env.DOUBAO_SPEECH_API_KEY) {
        return {
          apiKey: env.DOUBAO_SPEECH_API_KEY,
          resourceId: env.DOUBAO_SPEECH_RESOURCE_ID || DEFAULT_RESOURCE_ID,
          wsEndpoint: env.DOUBAO_SPEECH_WS_ENDPOINT || '',
          defaultVoice: env.DOUBAO_SPEECH_DEFAULT_VOICE || '',
          userId: env.DOUBAO_SPEECH_USER_ID || ''
        };
      }
    }
  } catch { /* ignore */ }
  // 回退：safeStorage（桌面设置页保存 / 旧导入凭据）
  const fromSafe = {
    apiKey: secretStore.get('doubaoSpeechApiKey') || '',
    resourceId: secretStore.get('doubaoSpeechResourceId') || '',
    wsEndpoint: secretStore.get('doubaoSpeechWsEndpoint') || '',
    defaultVoice: secretStore.get('doubaoSpeechDefaultVoice') || '',
    userId: secretStore.get('doubaoSpeechUserId') || ''
  };
  return fromSafe;
}

function createTtsServer({ secretStore, outputDir, logger }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const sendJson = (code, obj) => {
      const body = JSON.stringify(obj);
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
      res.end(body);
    };

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(200, { ok: true, provider: 'doubao-desktop', tts: 'desktop-node-bridge' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/voices') {
      sendJson(200, {
        voices: VOICE_CATALOG.map((v) => ({
          id: v.voice_type,
          name: v.name,
          gender: v.gender,
          language: v.language,
          description: v.description,
          previewUrl: v.preview_url
        }))
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/voices/all') {
      const voices = VOICE_CATALOG.map((v) => ({
        voice_type: v.voice_type,
        name: v.name,
        gender: v.gender,
        language: v.language,
        dialects: v.dialects || [],
        scene: v.scene,
        tags: v.tags || [],
        description: v.description,
        resource_id: DEFAULT_RESOURCE_ID,
        voice_kind: 'preset',
        provider: 'doubao',
        preview_url: '',
        sort_order: v.sort_order
      }));
      sendJson(200, {
        resource: DEFAULT_RESOURCE_ID,
        total: voices.length,
        fetched: voices.length,
        deduped: voices.length,
        page: 1,
        page_size: 50,
        has_more: false,
        count: voices.length,
        voices
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/tts') {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 5 * 1024 * 1024) req.destroy(); });
      req.on('end', async () => {
        try {
          const body = JSON.parse(raw || '{}');
          const text = String(body.text ?? '').trim();
          if (!text) return sendJson(400, { detail: 'text is required' });
          const speed = Math.max(0.5, Math.min(2.0, Number(body.speed) || 1.0));
          const volume = Math.max(0.0, Math.min(2.0, Number(body.volume) ?? 1.0));
          const cfg = readTtsConfig(secretStore);
          if (!cfg.apiKey) {
            return sendJson(500, { detail: 'DOUBAO_SPEECH_API_KEY 未配置。请在知衡智企「系统管理 → 模型与接口 → 语音服务」中填写并保存。' });
          }
          fs.mkdirSync(outputDir, { recursive: true });
          const result = await synthesize({
            text,
            voiceId: String(body.voice_id ?? 'auto'),
            speed,
            volume,
            endpoint: cfg.wsEndpoint,
            apiKey: cfg.apiKey,
            resourceId: cfg.resourceId,
            defaultVoice: cfg.defaultVoice,
            userId: cfg.userId
          });
          const requestId = crypto.randomUUID();
          const audioPath = path.join(outputDir, `doubao-${requestId}.mp3`);
          fs.writeFileSync(audioPath, result.audio);
          let duration = result.duration;
          if (duration <= 0) {
            duration = mp3DurationSeconds(result.audio);
            if (duration <= 0 && result.audio.length) duration = Math.round((result.audio.length / 16000) * 1000) / 1000;
          }
          sendJson(200, {
            audio_path: audioPath,
            duration,
            format: 'mp3',
            mime_type: 'audio/mpeg',
            provider: 'doubao',
            provider_voice_id: result.providerVoiceId,
            char_timestamps: result.charTimestamps,
            speech_segments: null,
            timing: result.subtitleWords && result.subtitleWords.length
              ? { source: 'TTS_NATIVE', words: result.subtitleWords }
              : null
          });
        } catch (err) {
          logger.app(`[tts-server] /v1/tts error: ${err.message}`);
          sendJson(500, { detail: `Doubao TTS failed: ${err.message}` });
        }
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/tts/preview') {
      (async () => {
        try {
          const voiceType = url.searchParams.get('voice_type') || '';
          const text = (url.searchParams.get('text') || '').slice(0, 200).trim();
          const speed = Math.max(0.5, Math.min(2.0, Number(url.searchParams.get('speed')) || 1.0));
          const volume = Math.max(0.0, Math.min(2.0, Number(url.searchParams.get('volume')) ?? 1.0));
          if (!text) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ detail: 'text is required' }));
            return;
          }
          const cfg = readTtsConfig(secretStore);
          if (!cfg.apiKey) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ detail: 'DOUBAO_SPEECH_API_KEY 未配置' }));
            return;
          }
          fs.mkdirSync(outputDir, { recursive: true });
          const result = await synthesize({
            text,
            voiceId: voiceType,
            speed,
            volume,
            endpoint: cfg.wsEndpoint,
            apiKey: cfg.apiKey,
            resourceId: cfg.resourceId,
            defaultVoice: cfg.defaultVoice,
            userId: cfg.userId
          });
          res.writeHead(200, {
            'content-type': 'audio/mpeg',
            'content-length': result.audio.length,
            'cache-control': 'public, max-age=3600'
          });
          res.end(result.audio);
        } catch (err) {
          logger.app(`[tts-server] /v1/tts/preview error: ${err.message}`);
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ detail: `Preview failed: ${err.message}` }));
        }
      })();
      return;
    }
    sendJson(404, { detail: 'not found' });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

module.exports = { createTtsServer, mp3DurationSeconds };
