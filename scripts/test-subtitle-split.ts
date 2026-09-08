// 基础底部字幕拆分算法测试（与 agent-auto-edit.ts 内实现一致）
function countChars(text: string) { return text.replace(/\s/g, '').length; }
function semanticBreakIndex(text: string) {
  const max = Math.min(12, text.length);
  const particlesAfter = new Set(['的','了','吧','吗','呢','啊','呀','么','着','过','上','下','中','里','后','时']);
  for (let i = 5; i <= max - 1; i++) if (particlesAfter.has(text[i - 1])) return i;
  const wordStarts = ['然后','所以','但是','如果','因为','以及','同时','还要','就是','直接','可以','需要','都会','这样','那些','这些','一个','这种','最低','最多','至少','最','都','也','就','才','要','会','能','可','但','而','并','还','又','再','在','把','将','从','向','为','对','和','与','及','等'];
  for (let i = 5; i <= max - 1; i++) for (const w of wordStarts) if (text.slice(i, i + w.length) === w) return i;
  return Math.min(8, max);
}
function semanticSplitLong(text: string) {
  const out = []; let rest = text;
  while (countChars(rest) > 12) { const cut = semanticBreakIndex(rest); out.push(rest.slice(0, cut)); rest = rest.slice(cut); }
  if (rest) out.push(rest);
  return out;
}
function segmentSubtitleText(raw: string) {
  const text = raw.trim(); if (!text) return [];
  const parts = text.split(/([，。；：、？！])/);
  const chunks = []; let buf = '';
  for (const p of parts) { if (/[，。；：、？！]/.test(p)) { if (buf.trim()) chunks.push(buf.trim()); buf=''; } else buf += p; }
  if (buf.trim()) chunks.push(buf.trim());
  const out = [];
  for (const c of chunks) { if (countChars(c) <= 12) out.push(c); else out.push(...semanticSplitLong(c)); }
  return out.filter(Boolean);
}

console.log('=== Test A: 多逗号句 ===');
const a = '如果你想做一款饮料，但连配方方向、包装形式、渠道定位都还没想清楚，就直接问工厂最低多少钱一瓶，这一步很容易踩坑。';
const ra = segmentSubtitleText(a);
ra.forEach((s, i) => console.log(`  ${i + 1}. [${s}] (${countChars(s)}字)`));
console.log('  A 判定:', ra.length > 1 && ra.every(s => countChars(s) <= 12) ? 'PASS' : 'FAIL');

console.log('=== Test B: 超12字无逗号语义拆分 ===');
const b = '就直接问工厂最低多少钱一瓶';
const rb = segmentSubtitleText(b);
rb.forEach((s, i) => console.log(`  ${i + 1}. [${s}] (${countChars(s)}字)`));
console.log('  B 判定:', rb.length >= 2 && rb.every(s => countChars(s) <= 12) && rb[0] === '就直接问工厂' ? 'PASS' : 'FAIL');

console.log('=== 额外: 其他长句 ===');
for (const s of ['它会受到配方复杂度、原料成本、包装形式、起订量、生产工艺、打样次数和质检要求影响',
  '所以真正靠谱的做法不是先追最低价，而是先把产品方向确认清楚，再让工厂根据方案评估成本']) {
  console.log('  ->', segmentSubtitleText(s).map(x => `[${x}]`).join(' '));
}
