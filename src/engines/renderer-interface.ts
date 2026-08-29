/**
 * Renderer 公共接口 —— 所有 Renderer 实现必须遵守的契约。
 *
 * 本文件是 RendererInterface 的唯一权威定义。
 * MoneyPrinterRenderer（legacy）和 ZhihengRenderer（new）都必须 implements 此接口。
 *
 * 设计原则：
 * - 接口不依赖任何具体 Renderer 实现
 * - validate/render 的 timeline 参数用 unknown，具体实现内部做类型收窄
 * - 能力声明（getCapabilities）是接口的强制组成部分，禁止静默降级
 */

// ============================================================================
// 能力声明
// ============================================================================

/**
 * Renderer 能力声明。
 *
 * 每个 Renderer 必须如实声明自己支持哪些 Timeline 功能。
 * validate() 必须根据能力声明检查 Timeline，不支持则返回 UNSUPPORTED_CAPABILITY。
 *
 * 能力字段与 UnifiedTimelineV1 的 Track / 功能一一对应。
 */
export interface RendererCapabilities {
  /** 源素材裁剪（sourceStart + duration） */
  sourceTrim: boolean;
  /** 多段视频拼接 */
  multiSegmentConcat: boolean;
  /** 缩放/裁剪到目标分辨率 */
  scaleCrop: boolean;
  /** HDR/HLG → SDR tone mapping */
  hdrToneMap: boolean;
  /** ASS 字幕烧录 */
  assSubtitles: boolean;
  /** 字幕内关键词局部高亮 */
  keywordHighlight: boolean;
  /** 独立标题轨道（titleTrack） */
  titleTrack: boolean;
  /** 图像叠加（PNG/Logo 等，V0.2） */
  overlayTrack: boolean;
  /** 背景音乐（V0.2） */
  bgmTrack: boolean;
  /** 音效（V0.3） */
  sfxTrack: boolean;
  /** 配音混音（voiceTrack） */
  voiceMix: boolean;
  /** 输出配置文件（outputProfile：分辨率/fps/编码/色彩目标） */
  outputProfile: boolean;
  /** 支持的转场类型列表，V0.1 只有 ["hard_cut"] */
  transitions: string[];
}

// ============================================================================
// 验证结果
// ============================================================================

/** 验证错误码 */
export const ValidationErrorCode = {
  /** Timeline 使用了 Renderer 不支持的能力 */
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
  /** Schema 结构无效（类型错误、缺少必填字段等） */
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  /** 时间值超过3位小数精度 */
  TIME_PRECISION_EXCEEDED: 'TIME_PRECISION_EXCEEDED',
  /** 字幕条目时间重叠 */
  SUBTITLE_OVERLAP: 'SUBTITLE_OVERLAP',
  /** 轨道结束时间超过视频总时长 */
  EXCEEDS_TOTAL_DURATION: 'EXCEEDS_TOTAL_DURATION',
  /** styleId 不存在于 Style Registry */
  STYLE_NOT_FOUND: 'STYLE_NOT_FOUND',
  /** assetId 格式无效（非空检查等，真实文件存在性由 runtime Asset Resolver 负责） */
  ASSET_REF_INVALID: 'ASSET_REF_INVALID'
} as const;

export type ValidationErrorCode = (typeof ValidationErrorCode)[keyof typeof ValidationErrorCode];

export interface ValidationError {
  /** 出错字段路径，如 "videoTrack[2].sourceStart"、"subtitleTrack[0].styleId" */
  field: string;
  /** 人类可读的错误描述 */
  message: string;
  /** 机器可读的错误码，见 ValidationErrorCode */
  code: string;
}

export interface ValidationResult {
  /** 是否通过验证。有任何 error 即为 false。 */
  valid: boolean;
  /** 致命错误列表，非空则 valid=false */
  errors: ValidationError[];
  /** 警告列表，不阻止执行，但应记录到 render log */
  warnings: string[];
}

// ============================================================================
// 渲染结果
// ============================================================================

export interface RenderError {
  /** 出错阶段，如 "preprocess" / "compose" / "ffmpeg" / "asset_resolve" */
  stage: string;
  /** 人类可读的错误描述 */
  message: string;
  /** 如果是 FFmpeg 错误，记录失败的命令 */
  command?: string;
  /** FFmpeg 的 stderr 输出（截断后） */
  stderr?: string;
}

export interface RenderResult {
  /** 是否渲染成功 */
  success: boolean;
  /** 最终视频文件路径（成功时必填） */
  outputPath?: string;
  /** 渲染日志文件路径 */
  logPath?: string;
  /** 总渲染耗时（毫秒） */
  durationMs: number;
  /** 渲染过程中的错误列表 */
  errors: RenderError[];
  /** 渲染过程中的警告列表 */
  warnings: string[];
  /** 实际使用的 Renderer 名称（用于 A/B 测试追踪） */
  rendererName: string;
  /** 实际使用的 Renderer 版本号 */
  rendererVersion: string;
}

// ============================================================================
// 统一接口
// ============================================================================

/**
 * Renderer 统一接口。
 *
 * 所有视频渲染器（包括 legacy MPT 包装和新知衡 Renderer）必须实现此接口。
 * 任务层只依赖此接口，不关心底层实现。
 *
 * 调用顺序：
 * 1. getCapabilities() — 了解 Renderer 支持哪些功能
 * 2. validate(timeline) — 校验 Timeline 是否可被本 Renderer 执行
 * 3. render(timeline) — 执行渲染
 *
 * 禁止：
 * - 禁止在 render() 中静默跳过不支持的功能
 * - 禁止 validate() 通过但 render() 因能力不足而失败
 * - 禁止 Renderer 内部调用 TTS（Voice Service 是上游独立服务）
 */
export interface RendererInterface {
  /** Renderer 名称，如 "moneyprinter" / "zhiheng" */
  getName(): string;

  /** Renderer 语义化版本号，如 "legacy" / "0.1.0" */
  getVersion(): string;

  /**
   * 能力声明。
   * 返回本 Renderer 支持的所有 Timeline 功能。
   * validate() 必须基于此声明做能力校验。
   */
  getCapabilities(): RendererCapabilities;

  /**
   * 校验 Timeline 是否可被本 Renderer 执行。
   *
   * 校验内容至少包括：
   * - Schema 结构有效性
   * - 能力声明匹配（Timeline 使用的功能必须在 capabilities 范围内）
   * - 语义规则（时间精度、轨道重叠、总时长、styleId 存在性等）
   *
   * 不校验：
   * - 素材文件真实存在性（由 runtime Asset Resolver 负责）
   * - FFmpeg 环境可用性（由 Environment Preflight 负责）
   *
   * @param timeline 待校验的 Timeline 对象（unknown，实现内部做类型收窄）
   * @returns ValidationResult
   */
  validate(timeline: unknown): ValidationResult;

  /**
   * 执行渲染，输出最终视频。
   *
   * 实现应在 render() 内部首先调用 validate()，
   * 如果校验失败，直接返回失败结果，不开始渲染。
   *
   * @param timeline 待渲染的 Timeline 对象
   * @returns Promise<RenderResult>
   */
  render(timeline: unknown): Promise<RenderResult>;
}
