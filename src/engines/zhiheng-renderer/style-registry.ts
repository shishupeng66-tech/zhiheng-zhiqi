/**
 * Style Registry —— 视觉样式的唯一数据源。
 *
 * Timeline 只写 styleId（如 "subtitle.default"、"title.hook"），
 * 具体视觉参数（字体、字号、颜色、描边、位置、阴影等）由 Style Registry 决定。
 *
 * V2 更新（2026-08-30）：基于样片001-005逐帧分析重构视觉包装。
 * 核心变更：
 * - 字幕描边：黑色 → 黄色（5/5样片都是黄色描边）
 * - 大标题：白字+蓝色描边（样片001风格）
 * - 信息卡：蓝色半透明底板（样片001/002风格）
 * - badge：标记为 deprecated（0/5样片有此元素）
 * - 新增 decoration.serial_number（样片005风格）
 *
 * 所有样式值仍为 provisional，需要人工看片后确认精确值。
 */

// ============================================================================
// ASS 样式定义
// ============================================================================

export interface AssStyleDefinition {
  fontName: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  backColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
}

export type StyleStatus = 'confirmed' | 'provisional' | 'todo';

export interface StyleDefinition {
  styleId: string;
  description: string;
  status: StyleStatus;
  source?: string;
  ass: AssStyleDefinition;
  notes?: string;
}

const PROVISIONAL_FONT_BOLD = 'Source Han Sans SC Bold';
const PROVISIONAL_FONT_HEAVY = 'Source Han Sans SC Heavy';
const PROVISIONAL_FONT_MEDIUM = 'Source Han Sans SC Medium';

const BUILTIN_STYLES: StyleDefinition[] = [
  // subtitle.default —— 底部普通字幕（V2.1：白字+黑色描边，更清晰）
  {
    styleId: 'subtitle.default',
    description: '底部普通字幕，白色粗体，黑色描边，清晰可读（V2.1：用户反馈黄描边看不清）',
    status: 'provisional',
    source: 'V2.1：用户反馈白字黄描边在亮画面上看不清，改为白字黑描边',
    ass: {
      fontName: PROVISIONAL_FONT_BOLD,
      fontSize: 54,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 0,
      angle: 0,
      borderStyle: 1,
      outline: 3,
      shadow: 1,
      alignment: 2,
      marginL: 60,
      marginR: 60,
      marginV: 130
    },
    notes: 'V2.1：白字+黑色描边（3px），在各种画面上都清晰可读。关键词用黄色+放大15%突出。'
  },

  // subtitle.keyword —— 关键词高亮（V2.1：黄色填充+放大15%，重点突出）
  {
    styleId: 'subtitle.keyword',
    description: '字幕内关键词高亮，黄色填充，放大15%，重点突出（V2.1）',
    status: 'provisional',
    source: 'V2.1：用户建议关键词放大一点，颜色有区别，重点突出',
    ass: {
      fontName: PROVISIONAL_FONT_BOLD,
      fontSize: 62,
      primaryColor: '&H0000D7FF',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 0,
      angle: 0,
      borderStyle: 1,
      outline: 2,
      shadow: 0,
      alignment: 2,
      marginL: 60,
      marginR: 60,
      marginV: 130
    },
    notes:
      'V2.1：关键词黄色填充+黑色细描边，字号62（比普通字幕54大15%）。ASS Generator行内用{\\fs62\\c&H0000D7FF&}关键词{\\r}局部覆盖。'
  },

  // title.hook —— 钩子大标题（V2.1：增大字号，位置靠上，支持入场动画）
  {
    styleId: 'title.hook',
    description: '开头钩子大标题，白色+蓝色粗描边，画面靠上位置，支持淡入动画（V2.1：增大+动画）',
    status: 'provisional',
    source: 'V2.1：用户反馈标题太小，要求增大+入场动画+位置靠上或中间',
    ass: {
      fontName: PROVISIONAL_FONT_HEAVY,
      fontSize: 110,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00EB6125',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 2,
      angle: 0,
      borderStyle: 1,
      outline: 8,
      shadow: 2,
      alignment: 8,
      marginL: 60,
      marginR: 60,
      marginV: 350
    },
    notes:
      'V2.1：字号110（原96），位置靠上（alignment=8中上，marginV=350），描边8px。入场动画由ASS Generator添加{\\fad(300,0)}淡入300ms。'
  },

  // title.hook_radial —— 大标题变体（V2新增：白字+黄色放射背景，样片004风格）
  {
    styleId: 'title.hook_radial',
    description: '大标题变体：白色+黄色放射状背景，重点强调词（V2：样片004风格）',
    status: 'provisional',
    source: 'V2新增：样片004"差异化/精准定位"观察',
    ass: {
      fontName: PROVISIONAL_FONT_HEAVY,
      fontSize: 88,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 3,
      angle: 0,
      borderStyle: 1,
      outline: 0,
      shadow: 3,
      alignment: 5,
      marginL: 60,
      marginR: 60,
      marginV: 650
    },
    notes: 'V2新增：样片004风格。放射背景由Graphic Generator生成，ASS只负责文字。'
  },

  // title.subhook —— 副标题（V2：白字+黄色细描边+下划线）
  {
    styleId: 'title.subhook',
    description: '副标题，白色+黄色细描边+下划线，大标题下方（V2：样片001风格）',
    status: 'provisional',
    source: 'V2重构：样片001副标题观察',
    ass: {
      fontName: PROVISIONAL_FONT_MEDIUM,
      fontSize: 44,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H0000FFFF',
      backColor: '&H00000000',
      bold: false,
      italic: false,
      underline: true,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 0,
      angle: 0,
      borderStyle: 1,
      outline: 2,
      shadow: 1,
      alignment: 5,
      marginL: 60,
      marginR: 60,
      marginV: 480
    },
    notes: 'V2：样片001副标题白字+黄描边+下划线。字号44。'
  },

  // title.emphasis —— 中段强调（V2：改为信息卡风格文字，白字无描边）
  {
    styleId: 'title.emphasis',
    description: 'B-roll中段强调文字，白色无描边，配合蓝色半透明底板（V2：信息卡风格）',
    status: 'provisional',
    source: 'V2重构：样片001/002信息卡文字观察',
    ass: {
      fontName: PROVISIONAL_FONT_BOLD,
      fontSize: 64,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 1,
      angle: 0,
      borderStyle: 1,
      outline: 0,
      shadow: 0,
      alignment: 4,
      marginL: 72,
      marginR: 60,
      marginV: 700
    },
    notes: 'V2.1：marginL=72（底板x=48+padding24），和信息卡底板左对齐。三行文字垂直居中。'
  },

  // title.badge —— 角标（V2：DEPRECATED，0/5样片有此元素）
  {
    styleId: 'title.badge',
    description: '【DEPRECATED V2】角标文字。0/5样片使用，不建议继续使用。',
    status: 'provisional',
    source: 'V2重构：样片001-005逐帧分析，0/5样片使用badge',
    ass: {
      fontName: PROVISIONAL_FONT_BOLD,
      fontSize: 28,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 1,
      angle: 0,
      borderStyle: 1,
      outline: 1,
      shadow: 0,
      alignment: 9,
      marginL: 60,
      marginR: 60,
      marginV: 72
    },
    notes: 'V2标记DEPRECATED：0/5样片使用高饱和黄色badge。保留仅为向后兼容，新视频不应使用。'
  },

  // title.card_title —— 信息卡标题（V2：白色粗体无描边）
  {
    styleId: 'title.card_title',
    description: '信息卡标题，白色粗体无描边，配合蓝色半透明底板（V2）',
    status: 'provisional',
    source: 'V2重构：样片001/002信息卡观察',
    ass: {
      fontName: PROVISIONAL_FONT_HEAVY,
      fontSize: 56,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 1,
      angle: 0,
      borderStyle: 1,
      outline: 0,
      shadow: 0,
      alignment: 4,
      marginL: 140,
      marginR: 60,
      marginV: 1500
    },
    notes: 'V2：信息卡标题白色粗体无描边，配合蓝色半透明底板。'
  },

  // title.card_subtitle —— 信息卡副标题（V2：浅白色）
  {
    styleId: 'title.card_subtitle',
    description: '信息卡副标题，浅白色，配合蓝色半透明底板（V2）',
    status: 'provisional',
    source: 'V2重构：样片001/002信息卡副标题观察',
    ass: {
      fontName: PROVISIONAL_FONT_MEDIUM,
      fontSize: 36,
      primaryColor: '&H00E0E0E0',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: false,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 0,
      angle: 0,
      borderStyle: 1,
      outline: 0,
      shadow: 0,
      alignment: 4,
      marginL: 140,
      marginR: 60,
      marginV: 1560
    },
    notes: 'V2：信息卡副标题浅白色，位于标题下方。'
  },

  // decoration.serial_number —— 黄色序号（V2新增：样片005风格）
  {
    styleId: 'decoration.serial_number',
    description: '黄色大号序号数字，左下角，序号段落或倒计时（V2：样片005风格）',
    status: 'provisional',
    source: 'V2新增：样片005左下角黄色数字"9"观察',
    ass: {
      fontName: PROVISIONAL_FONT_HEAVY,
      fontSize: 80,
      primaryColor: '&H0000FFFF',
      outlineColor: '&H00000000',
      backColor: '&H00000000',
      bold: true,
      italic: false,
      underline: false,
      strikeOut: false,
      scaleX: 100,
      scaleY: 100,
      spacing: 0,
      angle: 0,
      borderStyle: 1,
      outline: 0,
      shadow: 2,
      alignment: 1,
      marginL: 80,
      marginR: 60,
      marginV: 200
    },
    notes: 'V2新增：样片005左下角黄色大号数字。用于序号段落或倒计时。'
  }
];

export class StyleRegistry {
  private styles: Map<string, StyleDefinition>;

  constructor(customStyles?: StyleDefinition[]) {
    this.styles = new Map<string, StyleDefinition>();
    for (const style of BUILTIN_STYLES) {
      this.styles.set(style.styleId, style);
    }
    if (customStyles) {
      for (const style of customStyles) {
        this.styles.set(style.styleId, style);
      }
    }
  }

  get(styleId: string): StyleDefinition | undefined {
    return this.styles.get(styleId);
  }

  has(styleId: string): boolean {
    return this.styles.has(styleId);
  }

  getAll(): StyleDefinition[] {
    return Array.from(this.styles.values());
  }

  getStyleIds(): string[] {
    return Array.from(this.styles.keys());
  }

  getProvisionalStyles(): StyleDefinition[] {
    return this.getAll().filter((s) => s.status === 'provisional');
  }

  getConfirmedStyles(): StyleDefinition[] {
    return this.getAll().filter((s) => s.status === 'confirmed');
  }
}

export const BUILTIN_STYLE_IDS = BUILTIN_STYLES.map((s) => s.styleId);
