// Phase 4 真实闭环测试
// 模拟 "创建声音" 按钮的 exact 行为：
//   1. POST /api/auth/login → 拿 Set-Cookie
//   2. POST /api/workspaces/enterprise-media/voices/clone → multipart
//   3. 打印完整 request 摘要 + 响应
//
// 不修改任何 UI / 后端代码。
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:3000';
const LOGIN = { username: 'p3a_admin', password: 'Test1234!' }; // super_admin (just reset for Phase 4)
const SAMPLE_PATH = 'D:/知衡智企/tests/assets/test_voice.mp3';
const FORM = {
  displayName: 'Phase4RealCloseLoop_' + Date.now().toString().slice(-4),
  language: 'cn',
  referenceText: '你好，欢迎来到知衡智企。今天我们来聊聊企业 AI 工作平台。',
  demoText: '你好，这是我的声音试听。'
};

function log(label, obj) {
  console.log('==', label, '==');
  if (typeof obj === 'string') console.log(obj);
  else console.log(JSON.stringify(obj, null, 2));
}

async function step1_login() {
  const t0 = Date.now();
  const resp = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(LOGIN),
    redirect: 'manual'
  });
  log('1. LOGIN RESPONSE', {
    status: resp.status,
    elapsed_ms: Date.now() - t0,
    set_cookie: resp.headers.get('set-cookie'),
    body: await resp.text()
  });
  const cookie = resp.headers.get('set-cookie')?.split(';')[0] ?? '';
  return cookie;
}

async function step2_createClone(cookie) {
  const sampleBuf = fs.readFileSync(SAMPLE_PATH);

  // multipart 严格按 voice-clone-page.tsx 的客户端组装:
  //   sample (File), displayName, referenceText, language, demoText
  const fd = new FormData();
  fd.append(
    'sample',
    new Blob([sampleBuf], { type: 'audio/mpeg' }),
    'test_voice.mp3'
  );
  fd.append('displayName', FORM.displayName);
  fd.append('referenceText', FORM.referenceText);
  fd.append('language', FORM.language);
  fd.append('demoText', FORM.demoText);

  // 完整打印 request 摘要（注意:FormData body 太大,不打印）
  log('2. CREATE CLONE REQUEST', {
    method: 'POST',
    url: BASE + '/api/workspaces/enterprise-media/voices/clone',
    headers: { cookie: cookie ? '<set>' : '<none>' },
    body_summary: {
      sample: {
        file: 'test_voice.mp3',
        bytes: sampleBuf.length,
        mime: 'audio/mpeg'
      },
      fields: {
        displayName: FORM.displayName,
        referenceText: FORM.referenceText,
        language: FORM.language,
        demoText: FORM.demoText
      }
    }
  });

  const t0 = Date.now();
  const resp = await fetch(BASE + '/api/workspaces/enterprise-media/voices/clone', {
    method: 'POST',
    headers: { cookie },
    body: fd
  });
  const text = await resp.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  log('2. CREATE CLONE RESPONSE', {
    status: resp.status,
    elapsed_ms: Date.now() - t0,
    headers: Object.fromEntries(resp.headers.entries()),
    body
  });
  return { status: resp.status, body };
}

(async () => {
  try {
    const cookie = await step1_login();
    if (!cookie) {
      console.error('login failed: no Set-Cookie');
      process.exit(2);
    }
    const { status, body } = await step2_createClone(cookie);
    process.exit(status >= 400 ? 1 : 0);
  } catch (err) {
    console.error('UNCAUGHT', err);
    process.exit(2);
  }
})();
