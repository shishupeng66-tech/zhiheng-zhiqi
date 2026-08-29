import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

// 直接测试 extractKeywords 和 keywordMatchScore
// 由于这些函数是内部的，我们复制一份来测试

const NORMALIZATION_MAP: Record<string, string[]> = {
  '老板': ['创始人', '企业家', '郝总', '郏总', '老总'],
  '口播': ['真人出镜', '人物讲解', '面对镜头', '出镜'],
  '企业实力': ['工厂实力', '生产实力', '公司实力'],
  '开头': ['开场', '开篇', '引入', 'Hook'],
};

function extractKeywords(query: string): string[] {
  const rawTokens = query
    .toLowerCase()
    .split(/[\s，,。.！!？?、；;：:""'（）()【】\[\]《》\n\r\t]+/)
    .filter((t) => t.length >= 2);

  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    '自己', '这', '那', '什么', '怎么', '为什么', '可以', '能', '能够', '应该',
    '我们', '你们', '他们', '它们', '这个', '那个', '这些', '那些',
    '进行', '表现', '展示', '体现', '说明', '证明', '需要', '找', '搜索',
    '素材', '视频', '画面', '镜头', '片段', '场景',
    '适合', '用来', '作为', '比如', '例如', '以及',
    '过程', '当中', '时候', '以后', '之前', '现在',
    '真正', '其实', '就是', '不是', '不会', '不能',
    '第一步', '第二步', '第三步', '第一', '第二', '第三',
    '直接', '间接', '完全', '充分', '足够',
    '一些', '一点', '很多', '许多', '大量',
    '这样', '那样', '如何', '怎么', '怎样',
    '因为', '所以', '但是', '而且', '或者',
    '通过', '根据', '关于', '对于', '由于',
    '已经', '正在', '将要', '曾经', '一直',
    '非常', '特别', '十分', '相当', '比较',
    '可能', '大概', '也许', '或许', '应该',
    '必须', '一定', '必然', '绝对',
    '进来', '进去', '出来', '出去', '过来', '过去',
    '开始', '结束', '继续', '停止', '完成',
    '知道', '明白', '理解', '认识', '记得',
    '觉得', '认为', '以为', '感到', '发现',
    '告诉', '回答', '问', '说', '讲',
    '做', '干', '搞', '弄', '办',
    '给', '拿', '放', '带', '送',
    '来', '去', '到', '在', '从',
    '把', '被', '让', '使', '叫',
    '和', '跟', '与', '及', '或',
    '而', '但', '却', '然', '则',
    '之', '乎', '者', '也', '矣',
    '个', '只', '条', '件', '张',
    '种', '类', '样', '式', '型',
  ]);

  const keywords = rawTokens.filter((t) => !stopWords.has(t));
  return [...new Set(keywords)];
}

function keywordMatchScore(keywords: string[], targetTexts: string[]): { score: number; hits: string[] } {
  if (keywords.length === 0 || targetTexts.length === 0) return { score: 0, hits: [] };

  const hits: string[] = [];
  const targetLower = targetTexts.map((t) => t.toLowerCase());

  for (const kw of keywords) {
    let matched = targetLower.some((t) => t.includes(kw) || kw.includes(t));

    if (!matched) {
      const synonyms = NORMALIZATION_MAP[kw] || [];
      for (const syn of synonyms) {
        if (targetLower.some((t) => t.includes(syn) || syn.includes(t))) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      hits.push(kw);
    }
  }

  const score = hits.length / keywords.length;
  return { score, hits };
}

// 测试 VS-001
const query1 = '老板正面对镜头介绍企业实力，适合开头建立信任。';
const keywords1 = extractKeywords(query1);
console.log('=== VS-001 ===');
console.log('Query:', query1);
console.log('Keywords:', keywords1);

// 模拟郝总口播素材的字段
const haozongFields = [
  '开头段：郝总对镜头口播片段',
  '真人口播',
  '老板IP',
  '企业可信度',
  'Hook',
  '老板口播',
  '创始人IP',
];

const result1 = keywordMatchScore(keywords1, haozongFields);
console.log('Match with 郝总口播:', result1.score.toFixed(3));
console.log('Hits:', result1.hits);

// 测试 VS-006: 品控人员对产品做检测，突出质量控制
console.log('\n=== VS-006 ===');
const query2 = '品控人员对产品做检测，突出质量控制';
const keywords2 = extractKeywords(query2);
console.log('Query:', query2);
console.log('Keywords:', keywords2);

const pinkongFields = [
  '开头段：品控检测（片段）',
  '品控',
  '质检',
  '质量控制',
  '质量检测',
  '技术证明',
  '正文B-roll',
];

const result2 = keywordMatchScore(keywords2, pinkongFields);
console.log('Match with 品控:', result2.score.toFixed(3));
console.log('Hits:', result2.hits);

// 测试 VS-012: 每一批原料进入工厂前，都要经过规范验收
console.log('\n=== VS-012 ===');
const query3 = '每一批原料进入工厂前，都要经过规范验收';
const keywords3 = extractKeywords(query3);
console.log('Query:', query3);
console.log('Keywords:', keywords3);

const yanshouFields = [
  '完整片段：原材料验收（片段）',
  '原材料',
  '原料',
  '验收',
  '检验',
  '质量控制',
  '正文B-roll',
  '技术证明',
];

const result3 = keywordMatchScore(keywords3, yanshouFields);
console.log('Match with 原材料验收:', result3.score.toFixed(3));
console.log('Hits:', result3.hits);
