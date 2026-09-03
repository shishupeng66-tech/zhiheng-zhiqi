/**
 * Unified Timeline V2 —— 在 V1 基础上新增剪映执行能力。
 *
 * 版本决策（Phase C 已确认）：
 * - UnifiedTimelineV1：schemaVersion = z.literal(1)，保持不变（见 types.ts）
 * - UnifiedTimelineV2：schemaVersion = z.literal(2)，本文件
 * - UnifiedTimelineSchema：按 schemaVersion 做 discriminated union（V1 | V2）
 * - 不再使用 "V1.1" 作为 schema 标识
 *
 * V2 相对 V1 的新增能力（供 JianYing Adapter / 剪映执行器使用）：
 * - videoTrack 每段增加 sourceAudioMuted（视频原声静音开关）
 * - transition 扩展：hard_cut | dissolve
 * - 新增 keywordTrack：独立关键词包装轨道（花字/动态字）
 * - 保留 bgmTrack / sfxTrack
 */
import { z } from 'zod';
import {
  AssetRefSchema,
  OutputProfileSchema,
  VoiceSegmentSchema,
  SubtitleSegmentSchema,
  TitleSegmentSchema,
  OverlaySegmentSchema,
  AnchorSchema,
  BgmSegmentSchema,
  SfxSegmentSchema,
  UnifiedTimelineV1Schema
} from './types';

// ============================================================================
// 基础约束（与 V1 保持一致）
// ============================================================================

/** 时间值：秒的小数 */
const TimeSeconds = z.number().min(0, '时间值不能为负数');
/** 非空字符串 ID */
const NonEmptyString = z.string().min(1, '不能为空');

// ============================================================================
// Video Track V2
// ============================================================================

/**
 * V2 转场类型：hard_cut | dissolve。
 * 未来扩展（slide/fade 等）需再升级 Schema Version。
 */
export const VideoTransitionV2Schema = z.enum(['hard_cut', 'dissolve']);
export type VideoTransitionV2 = z.infer<typeof VideoTransitionV2Schema>;

/**
 * V2 视频片段。
 *
 * 相对 V1 变化：
 * - transition：hard_cut | dissolve
 * - sourceAudioMuted：视频原声静音开关（默认 true）
 *   - true  → 剪映执行器将素材 volume 置 0（原声关闭）；zhiheng-renderer 天然满足（视频原声不进入合成）
 *   - false → 保留视频原声（仅支持该能力的执行器可用）
 */
export const VideoSegmentV2Schema = z.object({
  assetRef: AssetRefSchema,
  sourceStart: TimeSeconds,
  duration: z.number().positive('duration 必须大于 0'),
  transition: VideoTransitionV2Schema,
  sourceAudioMuted: z.boolean().default(true)
});
export type VideoSegmentV2 = z.infer<typeof VideoSegmentV2Schema>;

// ============================================================================
// Keyword Track —— 关键词包装轨道（V2 新增）
// ============================================================================

/**
 * 关键词包装条目（花字 / 动态关键词）。
 *
 * Timeline 只描述语义意图（keyword / styleId / animationId / anchor / 时间），
 * 具体视觉参数由 ResourceMap（styleId → 剪映花字 resource）与动画映射决定，
 * 不输出 x/y/字号/颜色等剪映底层参数。
 *
 * 设计目标：Agent 只输出语义模板名称（keyword + styleId），
 * JianYing Adapter / ResourceMap 负责转换为具体剪映花字 resource。
 */
export const KeywordSegmentSchema = z.object({
  /** 关键词条目 ID */
  id: NonEmptyString,
  /** 关键词文本（花字内容） */
  keyword: NonEmptyString,
  /** 开始时间（秒） */
  start: TimeSeconds,
  /** 持续时长（秒） */
  duration: z.number().positive('duration 必须大于 0'),
  /** 样式 ID，对应 ResourceMap 中已验证花字，如 "huazi.blue_outline" */
  styleId: NonEmptyString,
  /** 文字动画标识（可选），对应 ResourceMap 中已验证动画，如 "typewriter_i" */
  animationId: z.string().optional(),
  /** 屏幕锚点（可选），不指定时由 ResourceMap/styleId 决定默认位置 */
  anchor: AnchorSchema.optional(),
  /** 显示层级，数值越大越靠上（预留） */
  layer: z.number().int().min(0).default(3)
});
export type KeywordSegment = z.infer<typeof KeywordSegmentSchema>;

// ============================================================================
// Unified Timeline V2 —— 根对象
// ============================================================================

/**
 * Unified Timeline V2 根对象。
 *
 * 视频总时长 = videoTrack 所有 segment duration 之和（与 V1 相同派生规则）。
 */
export const UnifiedTimelineV2Schema = z.object({
  /** Schema 版本号，固定为 2 */
  schemaVersion: z.literal(2),
  /** Timeline 唯一标识 */
  timelineId: NonEmptyString,
  /** 关联的任务 ID */
  taskId: NonEmptyString,
  /** 输出配置 */
  outputProfile: OutputProfileSchema,
  /** 视频轨道：连续、无 gap、无 overlap。timelineStart 由数组顺序派生。 */
  videoTrack: z.array(VideoSegmentV2Schema).min(1, 'videoTrack 不能为空'),
  /** 配音轨道 */
  voiceTrack: z.array(VoiceSegmentSchema).default([]),
  /** 字幕轨道：不允许 overlap */
  subtitleTrack: z.array(SubtitleSegmentSchema).default([]),
  /** 标题轨道：允许 overlap，通过 layer 区分层级 */
  titleTrack: z.array(TitleSegmentSchema).default([]),
  /** 包装/图像叠加轨道 */
  overlayTrack: z.array(OverlaySegmentSchema).optional(),
  /** 背景音乐轨道 */
  bgmTrack: z.array(BgmSegmentSchema).optional(),
  /** 音效轨道 */
  sfxTrack: z.array(SfxSegmentSchema).optional(),
  /** 关键词包装轨道（花字/动态字，V2 新增） */
  keywordTrack: z.array(KeywordSegmentSchema).optional()
});
export type UnifiedTimelineV2 = z.infer<typeof UnifiedTimelineV2Schema>;

// ============================================================================
// Unified Timeline —— discriminated union
// ============================================================================

/**
 * 按 schemaVersion 做 discriminated union。
 * V1 / V2 各自的字段独立校验，互不混用。
 */
export const UnifiedTimelineSchema = z.discriminatedUnion('schemaVersion', [
  UnifiedTimelineV1Schema,
  UnifiedTimelineV2Schema
]);
export type UnifiedTimeline = z.infer<typeof UnifiedTimelineSchema>;

export { UnifiedTimelineV1Schema } from './types';
export type { UnifiedTimelineV1 } from './types';

// ============================================================================
// 工具函数（V2 版）
// ============================================================================

/** 计算 V2 视频总时长（videoTrack 所有 segment duration 之和） */
export function calculateVideoTotalDurationV2(timeline: UnifiedTimelineV2): number {
  return timeline.videoTrack.reduce((sum, seg) => sum + seg.duration, 0);
}

/** 派生 V2 videoTrack 每个 segment 的 timelineStart（连续无 gap） */
export function deriveVideoTimelineStartsV2(timeline: UnifiedTimelineV2): Array<{
  index: number;
  timelineStart: number;
  timelineEnd: number;
}> {
  const result: Array<{ index: number; timelineStart: number; timelineEnd: number }> = [];
  let cursor = 0;
  for (let i = 0; i < timeline.videoTrack.length; i++) {
    const seg = timeline.videoTrack[i];
    result.push({ index: i, timelineStart: cursor, timelineEnd: cursor + seg.duration });
    cursor += seg.duration;
  }
  return result;
}
