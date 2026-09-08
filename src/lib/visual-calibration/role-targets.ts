/**
 * 9:16 竖版角色视觉目标定义
 *
 * 坐标体系：剪映 transform_x / transform_y，相对屏幕中心，范围约 -1~1。
 * - transform_y 正 = 画面上方，负 = 画面下方
 * - 字幕当前固定 transform_y = -0.8（Worker pjd_bridge.py import_srt clip_settings）
 *
 * 目标来源：
 * - Golden Reference Draft: ZHIHENG-PRODUCT-E2E-V1-20260906-163955（用户已验收）
 * - 字幕位置：Worker 实际配置 transform_y=-0.8
 * - 9:16 标准画布 1080×1920
 *
 * 本轮不做 face-aware 动态避让，先建立通用安全位置。
 */
import type {
  CalibrationAspectRatio,
  RoleTarget,
  RoleTargetsFile,
  SubtitleSafeZone,
  UsageRole
} from './types';

export const CALIBRATION_CANVAS_9x16 = { width: 1080, height: 1920 };

/** 字幕安全区（基于 Worker 实际配置） */
export const SUBTITLE_SAFE_ZONE_9x16: SubtitleSafeZone = {
  // Worker pjd_bridge.py: import_srt clip_settings=transform_y=-0.8
  subtitleTransformY: -0.8,
  // 字幕字号 size=10.0（PJD TextStyle），估算占屏高约 6%
  subtitleHeightRatio: 0.06,
  // transform_y < -0.55 视为可能碰撞字幕区（留 0.25 缓冲）
  collisionThresholdY: -0.55,
  // 顶部安全：transform_y > 0.75 可能碰顶边
  topSafeY: 0.75
};

/**
 * 9:16 角色目标
 *
 * title：顶部标题/章节标题/开场标题。允许更大，必须在上方安全区。
 * key_emphasis：单条重点信息/关键词强调。中部/中下部，视觉存在感明显但不抢字幕。
 * dense_info_item：多条信息逐条出现。单项明显小于 title/key_emphasis。
 *   - withTitle：上方预留 title 区域，整体下移
 *   - withoutTitle：整体信息组允许上移
 */
export const ROLE_TARGETS_9x16: RoleTarget[] = [
  // ---- title ----
  {
    usageRole: 'title',
    variant: 'default',
    aspectRatio: '9:16',
    targetCenterX: 0,
    targetCenterY: 0.5,
    targetWidthRatioRange: [0.5, 0.8],
    targetHeightRatioRange: [0.07, 0.14],
    description: '顶部标题：居中，位于上方安全区（y=0.5），不碰顶边（<0.75），不压字幕'
  },
  // ---- key_emphasis ----
  {
    usageRole: 'key_emphasis',
    variant: 'default',
    aspectRatio: '9:16',
    targetCenterX: 0,
    targetCenterY: 0.05,
    targetWidthRatioRange: [0.4, 0.65],
    targetHeightRatioRange: [0.05, 0.11],
    description: '关键词强调：居中偏上（y=0.05），视觉存在感明显，不抢字幕（>-0.55）'
  },
  // ---- dense_info_item withTitle ----
  {
    usageRole: 'dense_info_item',
    variant: 'withTitle',
    aspectRatio: '9:16',
    targetCenterX: 0,
    targetCenterY: -0.05,
    targetWidthRatioRange: [0.3, 0.5],
    targetHeightRatioRange: [0.035, 0.07],
    description: '密集信息项（有标题）：居中，上方预留 title 区域（y=-0.05），单项小'
  },
  // ---- dense_info_item withoutTitle ----
  {
    usageRole: 'dense_info_item',
    variant: 'withoutTitle',
    aspectRatio: '9:16',
    targetCenterX: 0,
    targetCenterY: 0.15,
    targetWidthRatioRange: [0.3, 0.5],
    targetHeightRatioRange: [0.035, 0.07],
    description: '密集信息项（无标题）：整体上移（y=0.15），利用上方空间'
  }
];

/** 获取指定角色+变体的目标 */
export function getRoleTarget(
  usageRole: UsageRole,
  variant: 'default' | 'withTitle' | 'withoutTitle' = 'default',
  aspectRatio: CalibrationAspectRatio = '9:16'
): RoleTarget | undefined {
  return ROLE_TARGETS_9x16.find(
    (t) => t.usageRole === usageRole && t.variant === variant && t.aspectRatio === aspectRatio
  );
}

/** 生成 role-targets.json 文件内容 */
export function buildRoleTargetsFile(): RoleTargetsFile {
  return {
    version: '1.0.0',
    aspectRatio: '9:16',
    canvasWidth: CALIBRATION_CANVAS_9x16.width,
    canvasHeight: CALIBRATION_CANVAS_9x16.height,
    subtitleSafeZone: SUBTITLE_SAFE_ZONE_9x16,
    targets: ROLE_TARGETS_9x16,
    generatedAt: new Date().toISOString(),
    source:
      'Golden Reference Draft ZHIHENG-PRODUCT-E2E-V1-20260906-163955 + Worker subtitle transform_y=-0.8 + 9:16 standard safe zones'
  };
}
