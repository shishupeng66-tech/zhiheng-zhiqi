// 开发机 e2e 用 mock TTS server：模拟桌面 tts-server /v1/tts 响应结构
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.MOCK_TTS_PORT || 15015);
const OUT = path.join(__dirname, '..', 'logs', 'mock-tts-output');
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/tts') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { text, voice_id } = JSON.parse(body || '{}');
      const chars = Array.from(String(text || ''));
      const perChar = 0.32; // 秒/字（模拟 1.3x 语速）
      const duration = Math.max(0.8, chars.length * perChar);
      const audioPath = path.join(OUT, `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mp3`);
      fs.writeFileSync(audioPath, Buffer.from('ID3mock'));
      const words = [];
      let t = 0;
      for (const ch of chars) {
        words.push({ char: ch, startMs: Math.round(t * 1000), endMs: Math.round((t + perChar) * 1000) });
        t += perChar;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          audio_path: audioPath,
          duration: Math.round(duration * 1000) / 1000,
          char_timestamps: words,
          speech_segments: null,
          timing: { source: 'TTS_NATIVE', words, voice_id },
          provider_voice_id: voice_id
        })
      );
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/v1/voices') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ voices: [{ voice_id: 'mock-voice', name: 'Mock 音色' }] }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock-tts listening on ${PORT}`);
});
