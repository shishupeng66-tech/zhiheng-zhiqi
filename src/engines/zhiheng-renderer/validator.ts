/**
 * Timeline Validator —— Unified Timeline V1 的 schema + semantic 验证器。
 *
 * 本验证器只负责 Timeline 本身的结构和语义验证，不关心具体 Renderer 的能力。
 * 具体 Renderer 的 validate() 应先调用本验证器，然后再做能力校验（UNSUPPORTED_CAPABILITY）。
 *
 * 验证范围：
 * - Schema 结构有效性（类型、必填字段、枚举值）—— 由 zod schema 处理
 * - 时间精度（最多3位小数）
 * - subtitleTrack 不允许 overlap
 * - titleTrack 允许 overlap（不验证）
 * - 所有 subtitle/title/voice 不得超过 video 总 duration
 * - styleId 必须存在于 Style Registry
 * - 预留字段（overlay/bgm/sfx）存在时给出警告
 *
 * 不验证（留给后续阶段）：
 * - 素材文件真实存在性 → runtime Asset Resolver
 * - FFmpeg 环境可用性 → Environment Preflight
 * - Renderer 能力匹配 → 具体 Renderer 的 validate()
 * - voice asset 文件存在性 → runtime 检查
 */

import { ZodError } from 'zod';
import type { ValidationResult, ValidationError } from '../renderer-interface';
import {
  UnifiedTimelineV1Schema,
  calculateVideoTotalDuration,
  type UnifiedTimelineV1
} from './types';
import { StyleRegistry } from './style-registry';

// ============================================================================
// 错误码（与 renderer-interface.ts 中的 ValidationErrorCode 保持一致）
// ============================================================================

const ERROR_CODE = {
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  TIME_PRECISION_EXCEEDED: 'TIME_PRECISION_EXCEEDED',
  SUBTITLE_OVERLAP: 'SUBTITLE_OVERLAP',
  EXCEEDS_TOTAL_DURATION: 'EXCEEDS_TOTAL_DURATION',
  STYLE_NOT_FOUND: 'STYLE_NOT_FOUND',
  ASSET_REF_INVALID: 'ASSET_REF_INVALID'
} as const;

// ============================================================================
// TimelineValidator 类
// ============================================================================

export class TimelineValidator {
  private styleRegistry: StyleRegistry;

  /**
   * @param styleRegistry 样式注册表。如果不传，使用默认内置样式。
   */
  constructor(styleRegistry?: StyleRegistry) {
    this.styleRegistry = styleRegistry ?? new StyleRegistry();
  }

  /**
   * 验证 Timeline 对象。
   *
   * @param input 待验证的 Timeline 对象（unknown，内部做类型收窄）
   * @returns ValidationResult
   */
  validate(input: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // ------------------------------------------------------------------------
    // 1. Schema 验证（zod）
    // ------------------------------------------------------------------------
    let timeline: UnifiedTimelineV1;
    try {
      timeline = UnifiedTimelineV1Schema.parse(input);
    } catch (err) {
      if (err instanceof ZodError) {
        for (const issue of err.issues) {
          errors.push({
            field: issue.path.length > 0 ? issue.path.join('.') : 'root',
            message: issue.message,
            code: ERROR_CODE.SCHEMA_INVALID
          });
        }
      } else {
        errors.push({
          field: 'root',
          message: 'Timeline 解析失败：未知错误',
          code: ERROR_CODE.SCHEMA_INVALID
        });
      }
      // Schema 验证失败，无法继续语义验证
      return { valid: false, errors, warnings };
    }

    // ------------------------------------------------------------------------
    // 2. 时间精度验证（最多3位小数）
    // ------------------------------------------------------------------------
    this.validateTimePrecision(timeline, errors);

    // ------------------------------------------------------------------------
    // 3. videoTrack 语义验证
    //    V0.1 videoTrack 连续无 gap 无 overlap，由数组顺序保证。
    //    zod 已保证非空、sourceStart>=0、duration>0、transition=hard_cut。
    //    此处不需要额外验证。
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // 4. subtitleTrack 不允许 overlap
    // ------------------------------------------------------------------------
    this.validateNoOverlap(
      timeline.subtitleTrack,
      'subtitleTrack',
      ERROR_CODE.SUBTITLE_OVERLAP,
      errors
    );

    // ------------------------------------------------------------------------
    // 5. titleTrack 允许 overlap（不验证）
    //    通过 layer 字段区分显示层级，ASS Layer 机制天然支持。
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // 6. 所有 subtitle/title/voice 不得超过 video 总 duration
    // ------------------------------------------------------------------------
    const totalDuration = calculateVideoTotalDuration(timeline);
    this.validateWithinTotalDuration(timeline, totalDuration, errors);

    // ------------------------------------------------------------------------
    // 7. styleId 必须存在于 Style Registry
    // ------------------------------------------------------------------------
    this.validateStyleIds(timeline, errors);

    // ------------------------------------------------------------------------
    // 8. assetRef 格式验证（zod 已保证 type 和 assetId 非空）
    //    真实文件存在性不在此验证，留给 runtime Asset Resolver。
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // 9. 预留字段警告
    // ------------------------------------------------------------------------
    if (timeline.overlayTrack && timeline.overlayTrack.length > 0) {
      warnings.push(
        `overlayTrack 已定义 ${timeline.overlayTrack.length} 条，但 V0.1 Renderer 不执行，将被忽略`
      );
    }
    if (timeline.bgmTrack && timeline.bgmTrack.length > 0) {
      warnings.push(
        `bgmTrack 已定义 ${timeline.bgmTrack.length} 条，但 V0.1 Renderer 不执行，将被忽略`
      );
    }
    if (timeline.sfxTrack && timeline.sfxTrack.length > 0) {
      warnings.push(
        `sfxTrack 已定义 ${timeline.sfxTrack.length} 条，但 V0.1 Renderer 不执行，将被忽略`
      );
    }

    // ------------------------------------------------------------------------
    // 10. 视频总时长合理性警告
    // ------------------------------------------------------------------------
    if (totalDuration < 1) {
      warnings.push(`视频总时长 ${totalDuration.toFixed(3)}s 过短，可能不符合短视频最低时长要求`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // ==========================================================================
  // 私有验证方法
  // ==========================================================================

  /**
   * 验证所有时间值最多3位小数。
   * 超过3位小数会导致帧边界对齐误差。
   */
  private validateTimePrecision(timeline: UnifiedTimelineV1, errors: ValidationError[]): void {
    const check = (value: number, field: string): void => {
      const rounded = Math.round(value * 1000) / 1000;
      if (Math.abs(value - rounded) > 1e-9) {
        errors.push({
          field,
          message: `时间值 ${value} 超过3位小数精度，请四舍五入到毫秒级`,
          code: ERROR_CODE.TIME_PRECISION_EXCEEDED
        });
      }
    };

    for (let i = 0; i < timeline.videoTrack.length; i++) {
      const seg = timeline.videoTrack[i];
      check(seg.sourceStart, `videoTrack[${i}].sourceStart`);
      check(seg.duration, `videoTrack[${i}].duration`);
    }
    for (let i = 0; i < timeline.voiceTrack.length; i++) {
      const seg = timeline.voiceTrack[i];
      check(seg.start, `voiceTrack[${i}].start`);
      check(seg.duration, `voiceTrack[${i}].duration`);
    }
    for (let i = 0; i < timeline.subtitleTrack.length; i++) {
      const seg = timeline.subtitleTrack[i];
      check(seg.start, `subtitleTrack[${i}].start`);
      check(seg.duration, `subtitleTrack[${i}].duration`);
    }
    for (let i = 0; i < timeline.titleTrack.length; i++) {
      const seg = timeline.titleTrack[i];
      check(seg.start, `titleTrack[${i}].start`);
      check(seg.duration, `titleTrack[${i}].duration`);
    }
  }

  /**
   * 验证轨道内条目不允许 overlap。
   * 用于 subtitleTrack（同一时间不能有两条字幕）。
   */
  private validateNoOverlap(
    segments: Array<{ id: string; start: number; duration: number }>,
    trackName: string,
    errorCode: string,
    errors: ValidationError[]
  ): void {
    if (segments.length <= 1) return;

    // 按 start 排序（不修改原数组）
    const sorted = [...segments].sort((a, b) => a.start - b.start);

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevEnd = prev.start + prev.duration;
      // 允许紧密衔接（curr.start === prevEnd），不允许 overlap（curr.start < prevEnd）
      if (curr.start < prevEnd - 1e-9) {
        errors.push({
          field: `${trackName}[${curr.id}]`,
          message: `${trackName} 条目时间重叠："${curr.id}" (start=${curr.start}) 与 "${prev.id}" (end=${prevEnd.toFixed(3)}) 重叠 ${(prevEnd - curr.start).toFixed(3)}s`,
          code: errorCode
        });
      }
    }
  }

  /**
   * 验证所有轨道的结束时间不超过视频总时长。
   * 视频总时长 = videoTrack 所有 segment duration 之和。
   */
  private validateWithinTotalDuration(
    timeline: UnifiedTimelineV1,
    totalDuration: number,
    errors: ValidationError[]
  ): void {
    const check = (seg: { start: number; duration: number }, field: string): void => {
      const end = seg.start + seg.duration;
      // 允许 1ms 容差（浮点精度）
      if (end > totalDuration + 0.001) {
        errors.push({
          field,
          message: `${field} 结束时间 ${end.toFixed(3)}s 超过视频总时长 ${totalDuration.toFixed(3)}s（超出 ${(end - totalDuration).toFixed(3)}s）`,
          code: ERROR_CODE.EXCEEDS_TOTAL_DURATION
        });
      }
    };

    for (let i = 0; i < timeline.voiceTrack.length; i++) {
      check(timeline.voiceTrack[i], `voiceTrack[${i}]`);
    }
    for (let i = 0; i < timeline.subtitleTrack.length; i++) {
      check(timeline.subtitleTrack[i], `subtitleTrack[${i}]`);
    }
    for (let i = 0; i < timeline.titleTrack.length; i++) {
      check(timeline.titleTrack[i], `titleTrack[${i}]`);
    }
  }

  /**
   * 验证所有 styleId 存在于 Style Registry。
   * Timeline 只写 styleId，具体样式由 Style Registry 决定。
   */
  private validateStyleIds(timeline: UnifiedTimelineV1, errors: ValidationError[]): void {
    for (let i = 0; i < timeline.subtitleTrack.length; i++) {
      const styleId = timeline.subtitleTrack[i].styleId;
      if (!this.styleRegistry.has(styleId)) {
        errors.push({
          field: `subtitleTrack[${i}].styleId`,
          message: `styleId "${styleId}" 不存在于 Style Registry。可用样式：${this.styleRegistry.getStyleIds().join(', ')}`,
          code: ERROR_CODE.STYLE_NOT_FOUND
        });
      }
    }
    for (let i = 0; i < timeline.titleTrack.length; i++) {
      const styleId = timeline.titleTrack[i].styleId;
      if (!this.styleRegistry.has(styleId)) {
        errors.push({
          field: `titleTrack[${i}].styleId`,
          message: `styleId "${styleId}" 不存在于 Style Registry。可用样式：${this.styleRegistry.getStyleIds().join(', ')}`,
          code: ERROR_CODE.STYLE_NOT_FOUND
        });
      }
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 便捷函数：使用默认 Style Registry 验证 Timeline。
 * 适合快速检查和测试。
 */
export function validateTimeline(input: unknown): ValidationResult {
  const validator = new TimelineValidator();
  return validator.validate(input);
}
