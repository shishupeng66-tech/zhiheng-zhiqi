/**
 * 独立验证脚本 · 不依赖任何项目代码 · 严格按《豆包语音_音色训练HTTP》PDF
 *
 * 用途:直接调用 火山引擎 / ByteDance voice_clone HTTP 接口,验证问题在
 *      (A) 火山侧 API Key / 资源授权
 *      (B) 项目侧调用代码(clone.py / Next.js / voice-service)
 *
 * 调用规范严格遵循 PDF P4-P6:
 *   - Endpoint:POST https://openspeech.bytedance.com/api/v3/tts/voice_clone
 *   - Headers (仅 3 个,全部 %%require%%):
 *       Content-Type: application/json
 *       X-Api-Key:    <控制台 → API Key 管理获取>
 *       X-Api-Request-Id: <uuid>
 *   - Body 必填字段:
 *       speaker_id        : "custom_speaker_id"  (固定值)
 *       custom_speaker_id : <8-256 字符,字母/数字/-/_,字母开头,避开官方黑名单>
 *       audio.data        : <base64 音频字节>
 *       audio.format      : wav|mp3|ogg|m4a|aac|pcm
 *       model_type        : 5  (复刻 2.0)
 *
 * 关键约束(已遵守):
 *   - ❌ 不修改知衡智企项目代码
 *   - ❌ 不修改环境变量
 *   - ❌ 不修改项目数据库
 *   - ❌ 不引入任何 npm 包(纯 Node 内置)
 *   - ❌ 不调用 voice-service / Next.js / 数据库
 *   - ❌ 不发 PDF 没要求的 header(不发 X-Api-Resource-Id)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// =========================== 0. 路径常量 =============================

const PROJECT_ROOT = 'D:\\知衡智企';
const ENV_FILE = path.join(PROJECT_ROOT, 'data', '.voice-service-env');
const AUDIO_FILE = path.join(PROJECT_ROOT, 'tests', 'assets', 'test_voice.mp3');

// =========================== 1. 读取 API Key(只读) =================

function readApiKey() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error('env 文件不存在:' + ENV_FILE);
  }
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  // 严格匹配第 1 行 DOUBAO_SPEECH_API_KEY=...(不修改文件,只 parse)
  const m = text.match(/^DOUBAO_SPEECH_API_KEY\s*=\s*(\S+)\s*$/m);
  if (!m) {
    throw new Error('env 文件未包含 DOUBAO_SPEECH_API_KEY');
  }
  return m[1].trim();
}

// =========================== 2. custom_speaker_id 生成 ===============

/**
 * PDF §0.2.2 命名规范:
 *   - 8 ~ 256 字符
 *   - 仅 [A-Za-z0-9_-]
 *   - 首字符必须为英文字母
 *   - 首末位不能 - 或 _
 *   - 黑名单前缀: S_ ICL_ MIX_ DiT_ BV xx_ planet_ wvae/moon/mercury/venus/earth/mars/jupiter/saturn/uranus/neptune/pluto/umm_
 *   - 黑名单后缀: _bigtts _bigtts_cc _tob _cs_tob _streaming
 */
function buildSpeakerId() {
  const tag = 'volcanoaudit';
  const hex = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  // audit_<tag>_<hex16>  → 长度 = 6 + 12 + 1 + 16 = 35 字符,远在 8-256 内
  let candidate = `audit_${tag}_${hex.slice(0, 16)}`;
  // 双重校验(轻量),禁止 base 黑名单前后缀
  const BAD_PREFIX = [
    'S_',
    'ICL_',
    'MIX_',
    'DiT_',
    'BV',
    'xx_',
    'planet_',
    'wvae_',
    'moon_',
    'mercury_',
    'venus_',
    'earth_',
    'mars_',
    'jupiter_',
    'saturn_',
    'uranus_',
    'neptune_',
    'pluto_',
    'umm_'
  ];
  const BAD_SUFFIX = ['_bigtts', '_bigtts_cc', '_tob', '_cs_tob', '_streaming'];
  for (const p of BAD_PREFIX) {
    if (candidate.startsWith(p)) throw new Error('撞黑名单前缀:' + p);
  }
  for (const s of BAD_SUFFIX) {
    if (candidate.endsWith(s)) throw new Error('撞黑名单后缀:' + s);
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(candidate)) {
    throw new Error('custom_speaker_id 不符合 PDF §0.2.2 正则');
  }
  if (candidate.length < 8 || candidate.length > 256) {
    throw new Error('custom_speaker_id 长度越界');
  }
  return candidate;
}

// =========================== 3. 主流程 =============================

(async function main() {
  console.log('='.repeat(70));
  console.log(' 独立火山 voice_clone 测试 · 严格按 PDF 7 页调用');
  console.log('='.repeat(70));
  console.log();

  // 3.1 Key
  // CLI 参数 --api-key <value> 可覆盖 env 读取(默认仍走 env)
  const apiKeyOverride = (() => {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--api-key' && i + 1 < args.length) {
        return { key: args[i + 1].trim(), source: '--api-key CLI 参数' };
      }
    }
    return null;
  })();
  const apiKey = apiKeyOverride ? apiKeyOverride.key : readApiKey();
  console.log('[1] API Key 来源 :', apiKeyOverride ? apiKeyOverride.source : ENV_FILE + ' (只读)');
  console.log(
    '    Key mask     :',
    apiKey.slice(0, 8) + '…' + apiKey.slice(-4),
    `(len=${apiKey.length})`
  );
  console.log();

  // 3.2 Audio
  if (!fs.existsSync(AUDIO_FILE)) {
    throw new Error('测试音频不存在:' + AUDIO_FILE);
  }
  const audioBuf = fs.readFileSync(AUDIO_FILE);
  const audioB64 = audioBuf.toString('base64');
  console.log('[2] Audio        :', AUDIO_FILE);
  console.log('    Size         :', audioBuf.length, 'bytes, format=mp3');
  console.log('    base64 len   :', audioB64.length, 'chars');
  if (audioBuf.length > 10 * 1024 * 1024) {
    throw new Error('PDF §0.2 限制 ≤ 10MB,本次上传 ' + audioBuf.length + ' bytes');
  }
  console.log();

  // 3.3 custom_speaker_id
  const customSpeakerId = buildSpeakerId();
  console.log('[3] custom_speaker_id (PDF §0.2.2 规范生成):');
  console.log('    ', customSpeakerId);
  console.log('    length =', customSpeakerId.length);
  console.log();

  // 3.4 request id
  const requestId = crypto.randomUUID();
  console.log('[4] X-Api-Request-Id:', requestId);
  console.log();

  // =========================== 3.5 CLI 参数(可选) =====================

  // 支持 --with-resource-id <value>:为 Request 额外加 X-Api-Resource-Id header
  // 默认行为严格按 PDF,本参数仅供后续诊断,不影响判定结论
  const argv = process.argv.slice(2);
  let extraResourceId = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--with-resource-id' && i + 1 < argv.length) {
      extraResourceId = argv[i + 1];
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('用法:node volcano-direct-voice-clone.js [--with-resource-id <value>]');
      console.log('  --with-resource-id  在请求头加 X-Api-Resource-Id (非 PDF 必填,仅供诊断)');
      process.exit(0);
    }
  }

  // =========================== 4. 构造请求 ===========================

  const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/voice_clone';
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    'X-Api-Request-Id': requestId
  };
  if (extraResourceId) {
    headers['X-Api-Resource-Id'] = extraResourceId;
    console.log('[!] 加测 header (非 PDF 默认, 仅供诊断): X-Api-Resource-Id =', extraResourceId);
    console.log();
  }
  const body = {
    speaker_id: 'custom_speaker_id', // PDF 要求固定值
    custom_speaker_id: customSpeakerId,
    audio: { format: 'mp3', data: audioB64 },
    model_type: 5 // 复刻 2.0
    // text / language / extra_params 均 %%optional%%,本次为最小字段验证,故意不发
    // language 不发,豆包默认按 cn 处理
    // extra_params 不发,豆包使用默认 demo_text
  };

  console.log('[5] Headers (3 个,PDF %%require%%):');
  console.log(
    JSON.stringify(
      {
        'Content-Type': headers['Content-Type'],
        'X-Api-Key': '<' + apiKey.length + ' chars, masked>',
        'X-Api-Request-Id': requestId
      },
      null,
      2
    )
  );
  console.log('[6] Body (audio.data 替换为摘要):');
  const printable = { ...body };
  printable.audio = {
    format: 'mp3',
    data: `<base64 ${audioB64.length} chars, ${((audioB64.length * 0.75) / 1024).toFixed(1)} KiB 解码后>`
  };
  console.log(JSON.stringify(printable, null, 2));
  console.log();

  // =========================== 5. 发送请求 ===========================

  console.log('[7] POST', ENDPOINT);
  const t0 = Date.now();
  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  } catch (err) {
    const dt = Date.now() - t0;
    console.log();
    console.log('💥 fetch 抛错 (' + dt + 'ms)');
    console.log('   message:', err.message);
    if (err.cause) console.log('   cause  :', err.cause.message || err.cause);
    console.log('   常见原因:沙箱默认 NODE_OPTIONS 注入的 --use-system-ca / 网络代理');
    console.log('   请用:env -u NODE_OPTIONS NODE_TLS_REJECT_UNAUTHORIZED=0 node 此脚本');
    process.exit(2);
  }
  const dt = Date.now() - t0;

  // =========================== 6. 打印响应 ===========================

  const httpStatus = resp.status;
  const ttLogId = resp.headers.get('X-Tt-Logid') || '(response 未返回 X-Tt-Logid)';
  const respHeaders = {};
  resp.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });
  const rawText = await resp.text();
  let parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    // 非 JSON
  }

  console.log();
  console.log('='.repeat(70));
  console.log(' 响应 · ' + dt + 'ms');
  console.log('='.repeat(70));
  console.log('[A] HTTP Status Code :', httpStatus);
  console.log('[B] X-Tt-Logid       :', ttLogId);
  console.log('[C] Content-Type     :', respHeaders['content-type'] || '(未返回)');
  console.log();
  console.log('[D] Response Headers (全):');
  console.log(JSON.stringify(respHeaders, null, 2));
  console.log();
  console.log('[E] Response Body:');
  if (parsed !== null) {
    if (parsed.demo_audio) {
      // demo_audio 是 base64 mp3,体积大,打印摘要
      const safe = { ...parsed, demo_audio: `<base64 ${parsed.demo_audio.length} chars>` };
      console.log(JSON.stringify(safe, null, 2));
    } else {
      console.log(JSON.stringify(parsed, null, 2));
    }
  } else {
    console.log('(非 JSON 文本,len=' + rawText.length + ')');
    console.log(rawText);
  }
  console.log();

  // =========================== 7. 简易结论 ===========================

  console.log('='.repeat(70));
  console.log(' 判定');
  console.log('='.repeat(70));
  if (httpStatus === 200 && parsed && Number(parsed.status) === 2) {
    console.log('✅ SUCCESS · 豆包 status=2(Success)');
    console.log('   → 火山授权正常,问题不在火山侧');
    console.log('   → 项目侧(clone.py / voice-service / Next.js)需要继续排查');
  } else if (httpStatus === 200 && parsed && Number(parsed.code) === 45000030) {
    console.log('❌ 45000030 · 资源授权失败');
    console.log('   message:', parsed.message);
    console.log('   → 火山侧 API Key 缺少 volc.megatts.timbre 资源维度授权');
    console.log('   → 结论:问题在火山 API 授权,不在项目调用');
  } else if (httpStatus === 200 && parsed && Number(parsed.status) === 1) {
    console.log('🟡 status=1 (Training) · 罕见,需重试');
  } else if (httpStatus === 200 && parsed && Number(parsed.status) === 3) {
    console.log('❌ status=3 (Failed) · 业务失败');
  } else if (httpStatus === 401 || httpStatus === 403) {
    console.log('❌ HTTP ' + httpStatus + ' · 鉴权失败');
  } else if (httpStatus >= 500) {
    console.log('⚠️  HTTP ' + httpStatus + ' · 火山网关/服务端错误');
  } else {
    console.log('⚠️  未预期响应');
  }
  console.log();
})().catch((err) => {
  console.error('💥 脚本异常:', err.stack || err.message);
  process.exit(1);
});
