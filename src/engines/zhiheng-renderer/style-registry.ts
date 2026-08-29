/**
 * Style Registry —— 视觉样式的唯一数据源。
 *
 * Timeline 只写 styleId（如 "subtitle.default"、"title.hook"），
 * 具体视觉参数（字体、字号、颜色、描边、位置、阴影等）由 Style Registry 决定。
 *
 * 设计原则：
 * - Timeline 不存储任何具体视觉参数，避免 Agent 输出像素级细节
 * - Style Registry 是 Renderer 内部模块，Agent 只知道 styleId 的语义含义
 * - 样式值的状态分为 confirmed / provisional / todo，provisional 值需要后续实测确认
 *
 * 样式值来源：
 * - 08_人工样片拆解（样片001-005）的语义观察
 * - 05_视频剪辑知识（如有）
 * - 当前 MPT 适配层的字幕参数（作为参考基线）
 *
 * 注意：人工样片拆解目前只提供语义描述（白色、黄色关键词、深色描边、底部位置），
 * 未提供精确像素值/字号/颜色码。因此以下具体数值均标记为 provisional，
 * 需要在 Phase 2 通过 ASS 实测和人工确认后调整为 confirmed。
 */

// ============================================================================
// ASS 样式定义
// ============================================================================

/**
 * ASS 样式定义。
 *
 * 字段对应 ASS [V4+ Styles] 格式中的 Style 行。
 * 颜色格式：&HAABBGGRR（AA=alpha，00=不透明 FF=透明；BB=蓝；GG=绿；RR=红）
 *
 * 设计分辨率基准：1080x1920 竖屏。
 * ASS 字号基于设计分辨率，Renderer 在生成 ASS 时按 outputProfile 缩放。
 */
export interface AssStyleDefinition {
  /** 字体名称，对应项目自带字体文件的字体名 */
  fontName: string;
  /** 字号（基于 1080x1920 设计分辨率） */
  fontSize: number;
  /** 主颜色（文字颜色），ASS 格式 &HAABBGGRR */
  primaryColor: string;
  /** 描边颜色，ASS 格式 */
  outlineColor: string;
  /** 背景颜色（borderStyle=3 时生效），ASS 格式 */
  backColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  /** 水平缩放百分比，100 = 原始 */
  scaleX: number;
  /** 垂直缩放百分比 */
  scaleY: number;
  /** 字间距（像素） */
  spacing: number;
  /** 旋转角度（度） */
  angle: number;
  /** 边框样式：1=描边+阴影，3=不透明背景框 */
  borderStyle: number;
  /** 描边宽度（像素） */
  outline: number;
  /** 阴影深度（像素） */
  shadow: number;
  /**
   * 对齐方式，ASS 数字小键盘布局：
   * 1=左下 2=中下 3=右下
   * 4=左中 5=正中 6=右中
   * 7=左上 8=中上 9=右上
   */
  alignment: number;
  /** 左边距（像素） */
  marginL: number;
  /** 右边距（像素） */
  marginR: number;
  /** 垂直边距（像素），对齐到下方时为距底部距离 */
  marginV: number;
}

// ============================================================================
// 样式定义包装
// ============================================================================

/** 样式值确认状态 */
export type StyleStatus = 'confirmed' | 'provisional' | 'todo';

export interface StyleDefinition {
  /** 样式 ID，Timeline 中引用此 ID */
  styleId: string;
  /** 人类可读的样式描述 */
  description: string;
  /**
   * 样式值确认状态：
   * - confirmed：已通过实测和人工确认，可直接使用
   * - provisional：基于语义观察的候选值，需要实测确认
   * - todo：尚未定义，需要后续补充
   */
  status: StyleStatus;
  /** 样式来源（如知识库路径、样片编号） */
  source?: string;
  /** ASS 样式参数 */
  ass: AssStyleDefinition;
  /** 备注：需要确认的事项、已知问题、调整建议 */
  notes?: string;
}

// ============================================================================
// 内置样式
// ============================================================================

/**
 * 项目自带字体名称（provisional，需要确认实际字体文件和字体名）。
 *
 * 当前 MPT 适配层使用 'STHeitiMedium.ttc'（macOS 系统字体），
 * 但 Windows 部署环境不可依赖系统字体。
 * Phase 2 需要确定项目自带的开源中文字体（如思源黑体 Source Han Sans），
 * 并将字体文件放入项目 assets/fonts/ 目录。
 */
const PROVISIONAL_FONT_BOLD = 'Source Han Sans SC Bold';
const PROVISIONAL_FONT_HEAVY = 'Source Han Sans SC Heavy';
const PROVISIONAL_FONT_MEDIUM = 'Source Han Sans SC Medium';

/**
 * 内置样式定义。
 *
 * 所有样式值目前均为 provisional，因为：
 * 1. 人工样片拆解只提供语义描述（白色、黄色关键词、深色描边），未提供精确数值
 * 2. 不同样片的字幕/标题样式可能有差异，需要汇总后确认统一值
 * 3. ASS 渲染效果需要在 1080x1920 实际视频上实测确认
 *
 * Phase 2 任务：用样片原始素材 +  provisional 样式生成测试视频，
 * 与人工样片成片对比，调整后标记为 confirmed。
 */
const BUILTIN_STYLES: StyleDefinition[] = [
  // --------------------------------------------------------------------------
  // subtitle.default —— 底部普通字幕
  // --------------------------------------------------------------------------
  {
    styleId: 'subtitle.default',
    description: '底部普通字幕，白色粗体，深色描边，无背景框',
    status: 'provisional',
    source: '08_人工样片拆解/01_样片001 + 02_样片002 共性观察（confirmed_observation）',
    ass: {
      fontName: PROVISIONAL_FONT_BOLD,
      fontSize: 48,
      primaryColor: '&H00FFFFFF', // 白色
      outlineColor: '&H00000000', // 黑色描边
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
      alignment: 2, // 底部居中
      marginL: 60,
      marginR: 60,
      marginV: 120 // 底部安全区上方
    },
    notes:
      '样片拆解确认：白色、粗体/半粗体、深色描边明显、底部位置、单行为主、无整行背景框、按短句分段出现。精确字号（当前48）、描边宽度（当前3）、边距（当前60/120）需在1080x1920实测后确认。字体需确认项目自带思源黑体的实际字体名。'
  },

  // --------------------------------------------------------------------------
  // subtitle.keyword —— 字幕内关键词高亮
  // --------------------------------------------------------------------------
  {
    styleId: 'subtitle.keyword',
    description: '字幕内关键词高亮，黄色，嵌入普通字幕行内局部覆盖',
    status: 'provisional',
    source: '08_人工样片拆解/01_样片001 + 02_样片002 关键词观察（confirmed_observation）',
    ass: {
      fontName: PROVISIONAL_FONT_BOLD,
      fontSize: 48,
      primaryColor: '&H0000FFFF', // 黄色（BB=00, GG=FF, RR=FF）
      outlineColor: '&H00000000', // 黑色描边
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
      marginV: 120
    },
    notes:
      '样片拆解确认：关键词黄色、描边明显、嵌入普通字幕内部（不独立成大花字）、强关键词约5-14次。此样式通常不单独作为 Dialogue Style 使用，而是由 ASS Generator 在字幕行内用内联标签 {\\c&H0000FFFF&}关键词{\\c} 局部覆盖颜色。字号是否需要略大于普通字幕（样片观察"部分关键词略大于普通字幕"）需实测确认。'
  },

  // --------------------------------------------------------------------------
  // title.hook —— 开头钩子大标题
  // --------------------------------------------------------------------------
  {
    styleId: 'title.hook',
    description: '开头钩子大标题，高饱和颜色，粗体描边，画面中部偏下',
    status: 'provisional',
    source: '08_人工样片拆解/01_样片001 + 02_样片002 大标题观察（confirmed_observation）',
    ass: {
      fontName: PROVISIONAL_FONT_HEAVY,
      fontSize: 72,
      primaryColor: '&H0000FFFF', // 黄色（样片观察：高饱和颜色，样片001为黄色系）
      outlineColor: '&H00000000', // 黑色描边
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
      outline: 5,
      shadow: 2,
      alignment: 5, // 正中（样片观察：中部偏下，可能需要调整 marginV 或自定义 pos）
      marginL: 60,
      marginR: 60,
      marginV: 400 // 中部偏下
    },
    notes:
      '样片拆解确认：开头大号标题、高饱和颜色、粗体、描边和阴影、位置在人物躯干附近或画面中部偏下、不遮挡核心人物面部。精确字号（当前72）、颜色（当前黄色，样片002观察到蓝色标题条，可能需要 title.hook.blue 变体）、位置（当前正中+marginV=400）需实测确认。ASS Layer 默认 2，显示在字幕之上。'
  },

  // --------------------------------------------------------------------------
  // title.subhook —— 副标题/补充说明
  // --------------------------------------------------------------------------
  {
    styleId: 'title.subhook',
    description: '副标题/补充说明，小于主标题，通常与主标题同时出现',
    status: 'provisional',
    source: 'derived：基于 title.hook 的层级推论，样片中未明确观察到独立副标题',
    ass: {
      fontName: PROVISIONAL_FONT_MEDIUM,
      fontSize: 42,
      primaryColor: '&H00FFFFFF', // 白色
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
      outline: 3,
      shadow: 1,
      alignment: 5,
      marginL: 60,
      marginR: 60,
      marginV: 320 // 在主标题上方
    },
    notes:
      'provisional：样片拆解中未明确观察到独立副标题层级，此样式为架构预留。如果后续样片确认不存在副标题，可将此样式标记为 deprecated 或合并到 title.emphasis。当前值基于与 title.hook 的层级关系推论（字号更小、白色、位置在主标题上方）。'
  },

  // --------------------------------------------------------------------------
  // title.emphasis —— B-roll 中段强调关键词
  // --------------------------------------------------------------------------
  {
    styleId: 'title.emphasis',
    description: 'B-roll 中段强调关键词，蓝白或黄白组合，画面中部，不遮挡核心设备',
    status: 'provisional',
    source: '08_人工样片拆解/01_样片001 + 02_样片002 中部强调字观察（confirmed_observation）',
    ass: {
      fontName: PROVISIONAL_FONT_BOLD,
      fontSize: 56,
      primaryColor: '&H00FF0000', // 蓝色（BB=FF, GG=00, RR=00）—— 样片002观察到蓝白组合
      outlineColor: '&H00FFFFFF', // 白色描边（蓝白组合）
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
      outline: 4,
      shadow: 2,
      alignment: 5, // 正中
      marginL: 60,
      marginR: 60,
      marginV: 0
    },
    notes:
      '样片拆解确认：B-roll 中段有设备/场景关键词，蓝白或黄白组合，放在画面中部偏下，不遮挡核心设备主体，视觉层级高于底部字幕。当前值为蓝色+白色描边（蓝白组合），但样片也观察到黄白组合，可能需要拆分为 title.emphasis.blue 和 title.emphasis.yellow 两个样式。精确字号（当前56）、描边宽度（当前4）、位置需实测确认。ASS Layer 默认 2。'
  }
];

// ============================================================================
// Style Registry 类
// ============================================================================

/**
 * Style Registry —— 样式注册表。
 *
 * 职责：
 * - 管理所有 styleId → StyleDefinition 的映射
 * - 提供查询接口（get / has / getAll / getStyleIds）
 * - 支持自定义样式覆盖（企业级定制时传入 customStyles）
 *
 * 不负责：
 * - 不生成 ASS 文件（由 ASS Generator 负责，Phase 2）
 * - 不决定使用哪个样式（由 Agent 在 Timeline 中指定 styleId）
 * - 不做运行时样式计算
 */
export class StyleRegistry {
  private styles: Map<string, StyleDefinition>;

  /**
   * @param customStyles 自定义样式，覆盖内置同名样式。
   *                      用于企业级定制（不同客户的品牌色、字体等）。
   */
  constructor(customStyles?: StyleDefinition[]) {
    this.styles = new Map<string, StyleDefinition>();

    // 注册内置样式
    for (const style of BUILTIN_STYLES) {
      this.styles.set(style.styleId, style);
    }

    // 注册自定义样式（覆盖内置同名样式）
    if (customStyles) {
      for (const style of customStyles) {
        this.styles.set(style.styleId, style);
      }
    }
  }

  /** 查询样式定义，不存在返回 undefined */
  get(styleId: string): StyleDefinition | undefined {
    return this.styles.get(styleId);
  }

  /** 检查样式是否存在 */
  has(styleId: string): boolean {
    return this.styles.has(styleId);
  }

  /** 获取所有样式定义 */
  getAll(): StyleDefinition[] {
    return Array.from(this.styles.values());
  }

  /** 获取所有 styleId 列表 */
  getStyleIds(): string[] {
    return Array.from(this.styles.keys());
  }

  /**
   * 获取所有 provisional 状态的样式（用于 Phase 2 实测确认清单）。
   */
  getProvisionalStyles(): StyleDefinition[] {
    return this.getAll().filter((s) => s.status === 'provisional');
  }

  /**
   * 获取所有 confirmed 状态的样式。
   */
  getConfirmedStyles(): StyleDefinition[] {
    return this.getAll().filter((s) => s.status === 'confirmed');
  }
}

// ============================================================================
// 导出内置样式（供测试和文档引用）
// ============================================================================

/** 内置样式列表（只读引用） */
export const BUILTIN_STYLE_IDS = BUILTIN_STYLES.map((s) => s.styleId);
