/**
 * JianYing Adapter —— 能力声明与 Timeline capability validation。
 *
 * 本 Adapter 面向剪映执行器（PJD → 剪映草稿），支持 UnifiedTimelineV2 全部能力：
 * - sourceAudioMuted（视频原声静音 → PJD volume=0）
 * - transition: hard_cut | dissolve（→ PJD TransitionType）
 * - keywordTrack（→ PJD 花字 TextSegment + effect）
 * - bgmTrack / sfxTrack（→ PJD AudioSegment）
 *
 * capability validation 在真正生成 Job 前执行，
 * 对 Timeline 中使用但 Adapter 不支持的语义能力返回 UNSUPPORTED_CAPABILITY，
 * 禁止静默忽略。
 */
import type { UnifiedTimelineV2 } from '../zhiheng-renderer/v2-types';
import { ErrorCode, type ContractError } from './errors';

/** Adapter 支持的能力声明 */
export interface AdapterCapabilities {
  /** 支持的转场列表 */
  transitions: string[];
  /** 视频原声静音 */
  videoSourceAudioMute: boolean;
  /** 保留视频原声 */
  videoSourceAudioKeep: boolean;
  /** 独立关键词包装轨道 */
  keywordTrack: boolean;
  /** BGM 轨道 */
  bgmTrack: boolean;
  /** SFX 轨道 */
  sfxTrack: boolean;
  /** 字幕轨道 */
  subtitleTrack: boolean;
  /** 标题轨道 */
  titleTrack: boolean;
}

/** JianYing Adapter 的固定能力声明（面向剪映 11.3 已验证） */
export const JIANYING_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  transitions: ['hard_cut', 'dissolve'],
  videoSourceAudioMute: true,
  videoSourceAudioKeep: true,
  keywordTrack: true,
  bgmTrack: true,
  sfxTrack: true,
  subtitleTrack: true,
  titleTrack: true
};

/**
 * 校验 Timeline 是否在 Adapter 能力范围内。
 * 返回错误列表；空数组 = 全部能力受支持。
 */
export function validateTimelineCapabilities(
  timeline: UnifiedTimelineV2,
  caps: AdapterCapabilities = JIANYING_ADAPTER_CAPABILITIES
): ContractError[] {
  const errors: ContractError[] = [];

  for (let i = 0; i < timeline.videoTrack.length; i++) {
    const seg = timeline.videoTrack[i];
    if (!caps.transitions.includes(seg.transition)) {
      errors.push({
        code: ErrorCode.UNSUPPORTED_CAPABILITY,
        message: `videoTrack[${i}].transition="${seg.transition}" 不受支持（支持：${caps.transitions.join(', ')}）`
      });
    }
    if (seg.sourceAudioMuted === true && !caps.videoSourceAudioMute) {
      errors.push({
        code: ErrorCode.UNSUPPORTED_CAPABILITY,
        message: `videoTrack[${i}].sourceAudioMuted=true 不受支持`
      });
    }
    if (seg.sourceAudioMuted === false && !caps.videoSourceAudioKeep) {
      errors.push({
        code: ErrorCode.UNSUPPORTED_CAPABILITY,
        message: `videoTrack[${i}].sourceAudioMuted=false 不受支持`
      });
    }
  }

  if (timeline.keywordTrack && timeline.keywordTrack.length > 0 && !caps.keywordTrack) {
    errors.push({
      code: ErrorCode.UNSUPPORTED_CAPABILITY,
      message: 'keywordTrack 不受支持（不得静默丢弃关键词包装）'
    });
  }
  if (timeline.bgmTrack && timeline.bgmTrack.length > 0 && !caps.bgmTrack) {
    errors.push({ code: ErrorCode.UNSUPPORTED_CAPABILITY, message: 'bgmTrack 不受支持' });
  }
  if (timeline.sfxTrack && timeline.sfxTrack.length > 0 && !caps.sfxTrack) {
    errors.push({ code: ErrorCode.UNSUPPORTED_CAPABILITY, message: 'sfxTrack 不受支持' });
  }

  return errors;
}
