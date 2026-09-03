/**
 * Unified Timeline V1 → V2 迁移（纯函数）。
 *
 * 迁移默认值依据 V1 当前真实执行行为确定（Phase C 已核实）：
 * - V1 zhiheng-renderer 的 compose 只取视频流 [input:v]，视频素材原声【不进入】最终合成
 *   → V2 的 sourceAudioMuted 默认 = true（与原行为一致）
 * - V1 transition 只有 hard_cut（z.literal('hard_cut')）→ V2 transition = 'hard_cut'
 * - V1 无 keywordTrack → V2 keywordTrack = []
 */
import type { UnifiedTimelineV1 } from './types';
import type { UnifiedTimelineV2 } from './v2-types';

/**
 * 迁移 V1 Timeline 到 V2。
 * 纯函数：不修改输入对象，返回新对象。
 */
export function migrateTimelineV1ToV2(v1: UnifiedTimelineV1): UnifiedTimelineV2 {
  // 浅拷贝 V1 的轨道数组（V2 结构与 V1 相同的字段直接沿用）
  const v2: UnifiedTimelineV2 = {
    schemaVersion: 2,
    timelineId: v1.timelineId,
    taskId: v1.taskId,
    outputProfile: { ...v1.outputProfile },
    videoTrack: v1.videoTrack.map((seg) => ({
      assetRef: { ...seg.assetRef },
      sourceStart: seg.sourceStart,
      duration: seg.duration,
      transition: 'hard_cut' as const,
      sourceAudioMuted: true // V1 真实执行行为：视频原声不进入合成（等同静音）
    })),
    voiceTrack: v1.voiceTrack.map((s) => ({ ...s, assetRef: { ...s.assetRef } })),
    subtitleTrack: v1.subtitleTrack.map((s) => ({
      ...s,
      highlights: s.highlights ? s.highlights.map((h) => ({ ...h })) : []
    })),
    titleTrack: v1.titleTrack.map((s) => ({ ...s })),
    overlayTrack: v1.overlayTrack
      ? v1.overlayTrack.map((s) => ({ ...s, assetRef: s.assetRef ? { ...s.assetRef } : undefined }))
      : undefined,
    bgmTrack: v1.bgmTrack
      ? v1.bgmTrack.map((s) => ({ ...s, assetRef: { ...s.assetRef } }))
      : undefined,
    sfxTrack: v1.sfxTrack
      ? v1.sfxTrack.map((s) => ({ ...s, assetRef: { ...s.assetRef } }))
      : undefined,
    keywordTrack: [] // V1 无关键词轨道
  };
  return v2;
}

/**
 * 判断 Timeline 是否为 V2（按 schemaVersion 分支，不做猜测）。
 */
export function isUnifiedTimelineV2(input: unknown): input is UnifiedTimelineV2 {
  if (typeof input !== 'object' || input === null) return false;
  return (input as { schemaVersion?: unknown }).schemaVersion === 2;
}

/**
 * 将 V2 Timeline 规范化为 V1 等价形态（供只支持 V1 语义的执行器使用）。
 *
 * 前提：调用方必须先完成 capability validation，
 * 保证本 V2 timeline 只使用了 V1 执行器已支持的能力
 * （transition 仅 hard_cut、keywordTrack 为空、sourceAudioMuted 语义可满足）。
 *
 * 本函数不校验，只做结构规范化（丢弃 V2 专属字段）。
 */
export function normalizeV2ToV1(v2: UnifiedTimelineV2): UnifiedTimelineV1 {
  return {
    schemaVersion: 1,
    timelineId: v2.timelineId,
    taskId: v2.taskId,
    outputProfile: { ...v2.outputProfile },
    videoTrack: v2.videoTrack.map((seg) => ({
      assetRef: { ...seg.assetRef },
      sourceStart: seg.sourceStart,
      duration: seg.duration,
      transition: seg.transition === 'dissolve' ? ('hard_cut' as const) : ('hard_cut' as const)
    })),
    voiceTrack: v2.voiceTrack.map((s) => ({ ...s, assetRef: { ...s.assetRef } })),
    subtitleTrack: v2.subtitleTrack.map((s) => ({
      ...s,
      highlights: s.highlights ? s.highlights.map((h) => ({ ...h })) : []
    })),
    titleTrack: v2.titleTrack.map((s) => ({ ...s })),
    overlayTrack: v2.overlayTrack
      ? v2.overlayTrack.map((s) => ({ ...s, assetRef: s.assetRef ? { ...s.assetRef } : undefined }))
      : undefined,
    bgmTrack: v2.bgmTrack
      ? v2.bgmTrack.map((s) => ({ ...s, assetRef: { ...s.assetRef } }))
      : undefined,
    sfxTrack: v2.sfxTrack
      ? v2.sfxTrack.map((s) => ({ ...s, assetRef: { ...s.assetRef } }))
      : undefined
  };
}
