const fs = require('fs');
const py = fs.readFileSync('D:\\知衡智企\\services\\voice-service\\app\\volcengine_seed_tts_voices.py', 'utf8');
const lines = py.split('\n');
const voices = [];
const re = /^\s*\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[([^\]]*)\],\s*\[([^\]]*)\]\)/;
for (const line of lines) {
  const m = line.match(re);
  if (m) {
    const [, voiceType, name, gender, language, scene, tagsStr, dialectsStr] = m;
    const tags = (tagsStr.match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1));
    const dialects = (dialectsStr.match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1));
    voices.push({ voice_type: voiceType, name, gender, language, scene, tags, dialects });
  }
}
console.log('parsed voices:', voices.length);
const out = '// 自动生成自 services/voice-service/app/volcengine_seed_tts_voices.py（' + voices.length + ' 个音色）\n' +
  'module.exports = ' + JSON.stringify(voices, null, 2) + ';\n';
fs.writeFileSync('D:\\知衡智企\\desktop\\main\\voice-catalog.cjs', out, 'utf8');
console.log('written to desktop/main/voice-catalog.cjs');
