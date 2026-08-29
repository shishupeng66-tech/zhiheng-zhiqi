import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, '.env.local');
const outputDir = path.join(repoRoot, 'storage', 'avatar-service', 'outputs', 'omnihuman-test');
const imagePath = process.env.OMNIHUMAN_TEST_IMAGE_PATH || 'D:\\Temp\\codex-clipboard-b14d0e3c-3208-49d3-a21a-0c434b0498f4.png';
const prebuiltAudioPath =
  process.env.OMNIHUMAN_TEST_AUDIO_PATH ||
  path.join(outputDir, 'omnihuman-test-voice-9s.mp3');
const voiceServiceUrl = process.env.VOICE_SERVICE_URL || 'http://127.0.0.1:5015';

type Env = Record<string, string>;

function loadEnv(file: string): Env {
  if (!fs.existsSync(file)) return {};
  const env: Env = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string | Buffer) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function encodeQuery(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

function utcDateParts(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    longDate: iso,
    shortDate: iso.slice(0, 8)
  };
}

async function volcPost(action: string, version: string, body: Record<string, unknown>) {
  const env = { ...process.env, ...loadEnv(envPath) };
  const accessKey = env.VOLCENGINE_ACCESS_KEY_ID;
  const secretKey = env.VOLCENGINE_SECRET_ACCESS_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('VOLCENGINE_ACCESS_KEY_ID / VOLCENGINE_SECRET_ACCESS_KEY missing in .env.local');
  }

  const service = 'cv';
  const region = 'cn-north-1';
  const host = 'visual.volcengineapi.com';
  const method = 'POST';
  const uri = '/';
  const query = encodeQuery({ Action: action, Version: version });
  const payload = JSON.stringify(body);
  const payloadHash = sha256Hex(payload);
  const { longDate, shortDate } = utcDateParts();
  const contentType = 'application/json';
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${longDate}\n`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest = [
    method,
    uri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    longDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const kDate = hmac(secretKey, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  const authorization =
    `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}?${query}`, {
    method,
    headers: {
      'content-type': contentType,
      host,
      'x-date': longDate,
      'x-content-sha256': payloadHash,
      authorization
    },
    body: payload
  });
  const text = await response.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep raw text for diagnostics.
  }
  return { httpStatus: response.status, body: json };
}

async function generateVoice() {
  if (fs.existsSync(prebuiltAudioPath)) {
    const metadata = audioMetadata(prebuiltAudioPath);
    return {
      audio_path: prebuiltAudioPath,
      duration: metadata.duration ?? 0,
      format: 'mp3',
      text: '做饮料代工这些年，我越来越觉得，客户真正关心的，从来不只是价格，而是产品交给你以后，他到底能不能放心。',
      voiceId: process.env.OMNIHUMAN_TEST_VOICE || 'zh_male_guanggaojieshuo_uranus_bigtts'
    };
  }

  const primaryText =
    '做饮料代工这些年，我越来越觉得，客户真正关心的，从来不只是价格，而是产品交给你以后，他到底能不能放心。';
  const shortText =
    '做饮料代工这些年，我越来越觉得，客户真正关心的，不只是价格，而是到底能不能放心。';
  const voiceId = process.env.OMNIHUMAN_TEST_VOICE || 'zh_male_guanggaojieshuo_uranus_bigtts';

  async function call(text: string) {
    const response = await fetch(`${voiceServiceUrl}/v1/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        speed: 1.12,
        volume: 1,
        emotion: 'neutral',
        style: 'business'
      })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Voice Service HTTP ${response.status}: ${raw}`);
    return JSON.parse(raw) as { audio_path: string; duration: number; format: string };
  }

  const first = await call(primaryText);
  if (first.duration <= 10) return { ...first, text: primaryText, voiceId };
  const second = await call(shortText);
  return { ...second, text: shortText, voiceId };
}

async function uploadUguu(filePath: string) {
  const form = new FormData();
  const bytes = fs.readFileSync(filePath);
  const blob = new Blob([bytes]);
  form.append('files[]', blob, path.basename(filePath));
  const response = await fetch('https://uguu.se/upload.php', {
    method: 'POST',
    body: form
  });
  const json = (await response.json()) as {
    success?: boolean;
    files?: Array<{ url?: string; size?: number; filename?: string }>;
    error?: string;
  };
  const url = json.files?.[0]?.url;
  if (!response.ok || !json.success || !url) {
    throw new Error(`uguu upload failed HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return url.replace(/\\\//g, '/');
}

function mediaMetadata(filePath: string) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', filePath], {
    encoding: 'utf8'
  });
  const output = `${result.stderr || ''}\n${result.stdout || ''}`;
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const resolutionMatch = output.match(/,\s*(\d{3,5})x(\d{3,5})[,\s]/);
  let duration: number | null = null;
  if (durationMatch) {
    duration =
      Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3]);
  }
  return {
    duration,
    width: resolutionMatch ? Number(resolutionMatch[1]) : null,
    height: resolutionMatch ? Number(resolutionMatch[2]) : null
  };
}

function audioMetadata(filePath: string) {
  return mediaMetadata(filePath);
}

function videoMetadata(filePath: string) {
  return mediaMetadata(filePath);
}

async function download(url: string, target: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
  return buffer.length;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(imagePath)) throw new Error(`test image not found: ${imagePath}`);

  const startedAt = Date.now();
  const voice = await generateVoice();
  const imageUrl = await uploadUguu(imagePath);
  const audioUrl = await uploadUguu(voice.audio_path);

  const reqKey = 'jimeng_realman_avatar_picture_omni_v15';
  const prompt =
    '人物面向镜头自然说话，神态稳重专业，动作幅度小，保持自然眨眼和轻微头部动作，镜头稳定，不做夸张肢体动作。';

  const submit = await volcPost('CVSubmitTask', '2022-08-31', {
    req_key: reqKey,
    image_url: imageUrl,
    audio_url: audioUrl,
    seed: -1,
    prompt,
    output_resolution: 1080,
    pe_fast_mode: false
  });

  const submitBody = submit.body as { code?: number; message?: string; data?: { task_id?: string } };
  const taskId = submitBody.data?.task_id;
  if (submit.httpStatus !== 200 || submitBody.code !== 10000 || !taskId) {
    throw new Error(`submit failed: ${JSON.stringify(submit.body)}`);
  }

  let lastQuery: unknown = null;
  let videoUrl = '';
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const query = await volcPost('CVGetResult', '2022-08-31', {
      req_key: reqKey,
      task_id: taskId
    });
    lastQuery = query.body;
    const body = query.body as {
      code?: number;
      message?: string;
      data?: { status?: string; video_url?: string };
    };
    const status = body.data?.status;
    console.log(`[omnihuman] poll ${attempt}: http=${query.httpStatus} code=${body.code} status=${status || 'none'}`);
    if (body.code !== 10000) {
      throw new Error(`query failed: ${JSON.stringify(query.body)}`);
    }
    if (status === 'done') {
      videoUrl = body.data?.video_url || '';
      break;
    }
    if (status === 'not_found' || status === 'expired') {
      throw new Error(`task ended with status=${status}`);
    }
  }

  if (!videoUrl) throw new Error(`task did not finish. last query=${JSON.stringify(lastQuery)}`);
  const videoPath = path.join(outputDir, `omnihuman-${taskId}.mp4`);
  const videoBytes = await download(videoUrl, videoPath);
  const metadata = videoMetadata(videoPath);

  const result = {
    success: true,
    submitAction: 'CVSubmitTask',
    queryAction: 'CVGetResult',
    version: '2022-08-31',
    reqKey,
    taskId,
    imagePath,
    audioPath: voice.audio_path,
    audioDuration: voice.duration,
    audioFormat: voice.format,
    voiceId: voice.voiceId,
    videoPath,
    videoBytes,
    videoMetadata: metadata,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    submit: submit.body,
    lastQuery
  };

  const resultPath = path.join(outputDir, `omnihuman-${taskId}-result.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ ...result, submit: undefined, lastQuery: undefined, resultPath }, null, 2));
}

main().catch((error) => {
  const failedPath = path.join(outputDir, `omnihuman-failed-${Date.now()}.json`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    failedPath,
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    ),
    'utf8'
  );
  console.error(error instanceof Error ? error.message : error);
  console.error(`diagnostics: ${failedPath}`);
  process.exit(1);
});
