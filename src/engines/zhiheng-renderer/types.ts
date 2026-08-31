/**
 * Unified Timeline V1 —— 知衡智企自动剪辑统一时间线。
 *
 * 本文件是 Unified Timeline V1 的唯一权威类型定义（source of truth）。
 * - zod schema：运行时验证 + JSON Schema 生成
 * - TypeScript 类型：通过 z.infer<> 从 zod schema 推导，不手动维护第二套
 *
 * 冻结规则（架构 V1 已确认，不得随意修改）：
 * - videoTrack：连续、无 gap、无 overlap、hard cut，timelineStart 由数组顺序+duration 派生
 * - AssetRef：只写 type+assetId，不写绝对路径/URL/sourceRef
 * - 时间：秒的小数，最多3位，不保存 end
 * - 样式：只写 styleId，具体视觉参数由 Style Registry 决定
 * - 预留字段：overlayTrack/bgmTrack/sfxTrack 可存在但 V0.1 不执行
 */

import { z } from 'zod';

// ============================================================================
// 基础约束
// ============================================================================

/** 时间值：秒的小数，运行时验证最多3位小数由 Validator 负责 */
const TimeSeconds = z.number().min(0, '时间值不能为负数');

/** 非空字符串 ID */
const NonEmptyString = z.string().min(1, '不能为空');

// ============================================================================
// AssetRef —— 统一素材引用
// ============================================================================

/**
 * 素材引用。
 *
 * 所有素材（视频、音频、图片）统一使用此格式。
 * Timeline 永远只认 assetId，物理路径/URL/缓存位置由 Asset Resolver 运行时解析。
 *
 * - library_asset：正式素材库中的素材，全局唯一，跨任务复用
 * - task_asset：任务级临时素材（上传的测试素材、临时生成的素材），与任务绑定
 */
export const AssetRefSchema = z.object({
  type: z.enum(['library_asset', 'task_asset']),
  assetId: NonEmptyString
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

// ============================================================================
// OutputProfile —— 输出配置
// ============================================================================

/**
 * 输出配置文件。
 *
 * fps 是输出技术规格，不是创意规则。
 * 默认 30fps，不默认 60fps。任务明确要求时可在 Timeline 中覆盖。
 */
export const OutputProfileSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  targetFps: z.number().positive(),
  videoCodec: z.string(),
  audioCodec: z.string(),
  pixelFormat: z.string(),
  colorTarget: z.enum(['bt709_sdr'])
});
export type OutputProfile = z.infer<typeof OutputProfileSchema>;

/** 默认输出配置：1080x1920 竖屏、30fps、H.264/AAC、BT.709 SDR */
export const DEFAULT_OUTPUT_PROFILE: OutputProfile = {
  width: 1080,
  height: 1920,
  targetFps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  pixelFormat: 'yuv420p',
  colorTarget: 'bt709_sdr'
};

// ============================================================================
// Video Track —— 视频轨道
// ============================================================================

/**
 * V0.1 转场类型：只有 hard_cut。
 * 未来扩展（fade/dissolve/slide 等）需升级 Schema Version。
 */
export const VideoTransitionV01 = z.literal('hard_cut');
export type VideoTransitionV01 = z.infer<typeof VideoTransitionV01>;

/**
 * 视频片段。
 *
 * 冻结规则：
 * - 不保存 timelineStart：V0.1 videoTrack 连续无 gap 无 overlap，
 *   timelineStart 由数组顺序 + 前置 segment duration 累计派生。
 * - 不保存 timelineEnd / sourceEnd：end = start + duration，避免三者不一致。
 * - transition V0.1 只能是 hard_cut。
 */
export const VideoSegmentSchema = z.object({
  assetRef: AssetRefSchema,
  sourceStart: TimeSeconds,
  duration: z.number().positive('duration 必须大于 0'),
  transition: VideoTransitionV01
});
export type VideoSegment = z.infer<typeof VideoSegmentSchema>;

// ============================================================================
// Voice Track —— 配音轨道
// ============================================================================

/**
 * 配音片段。
 *
 * Voice Service 是 Renderer 上游的独立资产生成服务。
 * voice asset 必须在 Renderer 启动前已生成完成。
 * Renderer 只拿已存在的 voice asset 进行合成，不调用 TTS。
 *
 * V0.1 voiceTrack 通常只有一个片段，覆盖整个视频时长。
 * 未来扩展（多人对话、多段配音）时可增加多个片段。
 */
export const VoiceSegmentSchema = z.object({
  assetRef: AssetRefSchema,
  start: TimeSeconds,
  duration: z.number().positive('duration 必须大于 0'),
  /** 音量，1.0 = 原始音量，0 = 静音，范围 0-2 */
  volume: z.number().min(0).max(2).default(1),
  /** 淡入时长（秒），可选 */
  fadeIn: z.number().min(0).optional(),
  /** 淡出时长（秒），可选 */
  fadeOut: z.number().min(0).optional()
});
export type VoiceSegment = z.infer<typeof VoiceSegmentSchema>;

// ============================================================================
// Subtitle Track —— 字幕轨道
// ============================================================================

/**
 * 字幕关键词高亮。
 *
 * 只描述语义范围（关键词文本 + 可选字符位置），
 * 不输出字体、颜色、x/y 等视觉参数。
 * 具体高亮样式由 Style Registry 的 subtitle.keyword 决定，
 * ASS Generator 渲染时用内联颜色标签 {\c&H...&} 实现局部高亮。
 */
export const SubtitleHighlightSchema = z.object({
  /** 关键词文本，用于在字幕 text 中定位 */
  keyword: NonEmptyString,
  /** 关键词在 text 中的起始字符位置（可选，用于消除歧义） */
  startChar: z.number().int().min(0).optional(),
  /** 关键词在 text 中的结束字符位置（可选） */
  endChar: z.number().int().min(0).optional()
});
export type SubtitleHighlight = z.infer<typeof SubtitleHighlightSchema>;

/**
 * 字幕条目。
 *
 * 字幕轨道不允许 overlap（同一时间不能有两条字幕）。
 * 字幕之间可以有 gap（无字幕间隔）。
 *
 * 文字最终统一走 ASS，不使用 drawtext。
 */
export const SubtitleSegmentSchema = z.object({
  id: NonEmptyString,
  start: TimeSeconds,
  duration: z.number().positive('duration 必须大于 0'),
  text: NonEmptyString,
  /** 样式 ID，对应 Style Registry 中的定义，如 "subtitle.default" */
  styleId: NonEmptyString,
  /** 关键词高亮列表，只描述语义范围 */
  highlights: z.array(SubtitleHighlightSchema).default([])
});
export type SubtitleSegment = z.infer<typeof SubtitleSegmentSchema>;

// ============================================================================
// Title Track —— 标题轨道
// ============================================================================

/**
 * 标题条目。
 *
 * 标题轨道允许 overlap（钩子标题和副标题可同时显示），
 * 通过 layer 字段区分显示层级（ASS Layer 机制）。
 *
 * 文字最终统一走 ASS，与字幕共用同一个 ASS 文件和 ASS Generator。
 * 只有 PNG/Logo 等图像内容才走 overlay（V0.2）。
 */
export const TitleSegmentSchema = z.object({
  id: NonEmptyString,
  start: TimeSeconds,
  duration: z.number().positive('duration 必须大于 0'),
  text: NonEmptyString,
  /** 样式 ID，如 "title.hook" / "title.subhook" / "title.emphasis" */
  styleId: NonEmptyString,
  /** ASS Layer 层级，数值越大显示越靠上。字幕默认 Layer 0，标题默认 Layer 2 */
  layer: z.number().int().min(0).default(2)
});
export type TitleSegment = z.infer<typeof TitleSegmentSchema>;

// ============================================================================
// Overlay Track —— 包装/图像叠加轨道（Phase 2C V0.1 实现）
// ============================================================================

/**
 * Anchor 锚点。V0.1 只支持固定语义锚点，不允许 Timeline 写自由 x/y。
 * Renderer 根据 outputProfile + safe area + style + element size 计算最终像素坐标。
 */
export const AnchorSchema = z.enum([
  'top_left',
  'top_center',
  'top_right',
  'center_left',
  'center',
  'center_right',
  'bottom_left',
  'bottom_center',
  'bottom_right'
]);
export type Anchor = z.infer<typeof AnchorSchema>;

/**
 * 包装元素类型。
 *
 * - image / logo：需要 assetRef 指向 PNG/图片素材，Renderer 负责 scale/anchor/overlay
 * - badge / title_panel / info_card：由 Renderer 根据 styleId 生成 graphic（色块/底板/卡片），
 *   文字仍走 ASS（通过 titleTrack 或独立文字层），不需要 assetRef
 */
export const OverlayTypeSchema = z.enum([
  'image',
  'logo',
  'sticker',
  'badge',
  'title_panel',
  'info_card'
]);
export type OverlayType = z.infer<typeof OverlayTypeSchema>;

/**
 * 包装/图像叠加条目。
 *
 * Timeline 只描述语义意图（type/styleId/anchor/start/duration/text），
 * 禁止输出 x/y/width/fontSize/opacity/FFmpeg filter 等具体像素参数。
 *
 * 不同 type 的字段要求：
 * - image / logo：必须有 assetRef
 * - badge：必须有 text（角标文字），可选 assetRef
 * - title_panel：可选 text（面板标题），通常配合 titleTrack 文字使用
 * - info_card：必须有 title，可选 subtitle
 */
export const OverlaySegmentSchema = z.object({
  id: NonEmptyString,
  /** 包装元素类型 */
  type: OverlayTypeSchema,
  /** 图片素材引用（image/logo 类型必需；badge/title_panel/info_card 可选） */
  assetRef: AssetRefSchema.optional(),
  /** 样式 ID，对应 Style Registry，如 "badge.oem" / "panel.default" / "card.info" */
  styleId: NonEmptyString,
  /** 锚点位置，V0.1 只支持固定语义锚点 */
  anchor: AnchorSchema,
  /** 开始时间（秒） */
  start: TimeSeconds,
  /** 持续时长（秒） */
  duration: z.number().positive('duration 必须大于 0'),
  /** 角标/面板文字（badge 必需，title_panel/info_card 可选） */
  text: z.string().optional(),
  /** 信息卡副标题（仅 info_card 使用） */
  subtitle: z.string().optional(),
  /** 透明度 0-1，可选。不指定时由 styleId 决定。 */
  opacity: z.number().min(0).max(1).optional()
});
export type OverlaySegment = z.infer<typeof OverlaySegmentSchema>;

/** 背景音乐条目，V0.2 实现 */
export const BgmSegmentSchema = z.object({
  id: NonEmptyString,
  assetRef: AssetRefSchema,
  start: TimeSeconds,
  duration: z.number().positive(),
  volume: z.number().min(0).max(2).default(0.3),
  loop: z.boolean().default(false)
});
export type BgmSegment = z.infer<typeof BgmSegmentSchema>;

/** 音效条目，V0.3 实现 */
export const SfxSegmentSchema = z.object({
  id: NonEmptyString,
  assetRef: AssetRefSchema,
  start: TimeSeconds,
  duration: z.number().positive(),
  volume: z.number().min(0).max(2).default(1)
});
export type SfxSegment = z.infer<typeof SfxSegmentSchema>;

// ============================================================================
// Unified Timeline V1 —— 根对象
// ============================================================================

/**
 * Unified Timeline V1 根对象。
 *
 * 这是 Agent / LLM 与执行层之间的结构化契约。
 * Agent 输出此对象，Renderer 消费此对象。
 *
 * 视频总时长 = videoTrack 所有 segment duration 之和。
 * 所有其他 Track（voice/subtitle/title）的时间范围不得超过视频总时长。
 */
export const UnifiedTimelineV1Schema = z.object({
  /** Schema 版本号，固定为 1。未来不兼容变更需升级版本。 */
  schemaVersion: z.literal(1),
  /** Timeline 唯一标识 */
  timelineId: NonEmptyString,
  /** 关联的任务 ID */
  taskId: NonEmptyString,
  /** 输出配置 */
  outputProfile: OutputProfileSchema,
  /** 视频轨道：连续、无 gap、无 overlap、hard cut。timelineStart 由数组顺序派生。 */
  videoTrack: z.array(VideoSegmentSchema).min(1, 'videoTrack 不能为空'),
  /** 配音轨道：引用已生成完成的 voice asset。V0.1 通常一个片段。 */
  voiceTrack: z.array(VoiceSegmentSchema).default([]),
  /** 字幕轨道：不允许 overlap。 */
  subtitleTrack: z.array(SubtitleSegmentSchema).default([]),
  /** 标题轨道：允许 overlap，通过 layer 区分层级。 */
  titleTrack: z.array(TitleSegmentSchema).default([]),
  /** 包装/图像叠加轨道：PNG/Logo/角标/标题底板/信息卡。Phase 2C V0.1 实现。可选。 */
  overlayTrack: z.array(OverlaySegmentSchema).optional(),
  /** 预留：背景音乐轨道，V0.1 不执行 */
  bgmTrack: z.array(BgmSegmentSchema).optional(),
  /** 预留：音效轨道，V0.1 不执行 */
  sfxTrack: z.array(SfxSegmentSchema).optional()
});

export type UnifiedTimelineV1 = z.infer<typeof UnifiedTimelineV1Schema>;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 计算视频总时长。
 * 唯一权威来源：videoTrack 所有 segment duration 之和。
 */
export function calculateVideoTotalDuration(timeline: UnifiedTimelineV1): number {
  return timeline.videoTrack.reduce((sum, seg) => sum + seg.duration, 0);
}

/**
 * 派生 videoTrack 每个 segment 的 timelineStart。
 * V0.1 videoTrack 连续无 gap，timelineStart = 前置 segment duration 累计。
 *
 * 注意：此函数不修改原 Timeline，只返回派生结果供 Renderer 内部使用。
 * Timeline 本身不存储 timelineStart。
 */
export function deriveVideoTimelineStarts(timeline: UnifiedTimelineV1): Array<{
  index: number;
  timelineStart: number;
  timelineEnd: number;
}> {
  const result: Array<{ index: number; timelineStart: number; timelineEnd: number }> = [];
  let cursor = 0;
  for (let i = 0; i < timeline.videoTrack.length; i++) {
    const seg = timeline.videoTrack[i];
    result.push({
      index: i,
      timelineStart: cursor,
      timelineEnd: cursor + seg.duration
    });
    cursor += seg.duration;
  }
  return result;
}
