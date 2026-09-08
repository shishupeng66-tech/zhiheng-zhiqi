/**
 * Visual Calibration —— 9:16 竖版花字/文字模板视觉校准体系
 *
 * 校准单位：resourceId × usageRole × charBucket × variant
 * 不只是 resourceId，也不只是 resourceId × usageRole——字数变化显著改变视觉占用。
 *
 * 本轮只做 9:16 / flower_text / text_template / title / key_emphasis / dense_info_item。
 */

// ============================================================================
// 基础枚举
// ============================================================================

/** 画幅（本轮仅 9:16） */
export type CalibrationAspectRatio = '9:16';

/** 资源类型（本轮仅 flower_text / text_template） */
export type CalibrationResourceType = 'flower_text' | 'text_template';

/** 使用角色 */
export type UsageRole = 'title' | 'key_emphasis' | 'dense_info_item';

/** 布局变体（dense_info_item 区分 withTitle / withoutTitle） */
export type CalibrationVariant = 'default' | 'withTitle' | 'withoutTitle';

/** 校准状态 */
export type CalibrationStatus =
  | 'NOT_STARTED'
  | 'DRAFT_CREATED'
  | 'MEASURED'
  | 'AUTO_CALIBRATED'
  | 'HUMAN_APPROVED'
  | 'REJECTED'
  | 'MEASUREMENT_PENDING';

/** 拒绝原因 */
export type RejectionReason =
  | 'REJECTED_FOR_ROLE'
  | 'TOO_LARGE'
  | 'TOO_SMALL'
  | 'BAD_POSITION'
  | 'SUBTITLE_COLLISION'
  | 'UNSUITABLE_STYLE'
  | 'INJECTION_UNSUPPORTED'
  | 'OTHER';

/** 文字类别（预留扩展） */
export type TextClass = 'chinese_normal' | 'numeric' | 'latin' | 'mixed';

/** 字数分档 */
export type CharBucket = 2 | 4 | 6 | 8;

// ============================================================================
// 角色目标（9:16）
// ============================================================================

/** 单个角色的视觉目标区（坐标为剪映 transform 相对屏幕中心，范围约 -1~1） */
export interface RoleTarget {
  usageRole: UsageRole;
  variant: CalibrationVariant;
  aspectRatio: CalibrationAspectRatio;
  /** 目标中心 X（相对屏幕中心，0=居中） */
  targetCenterX: number;
  /** 目标中心 Y（相对屏幕中心，正=上方，负=下方） */
  targetCenterY: number;
  /** 目标宽度占屏宽比例范围 [min, max] */
  targetWidthRatioRange: [number, number];
  /** 目标高度占屏高比例范围 [min, max] */
  targetHeightRatioRange: [number, number];
  /** 描述 */
  description: string;
}

/** 字幕安全区（9:16） */
export interface SubtitleSafeZone {
  /** 字幕 transform_y 位置（当前 Worker 固定 -0.8） */
  subtitleTransformY: number;
  /** 字幕高度估算（占屏高比例） */
  subtitleHeightRatio: number;
  /** 碰撞阈值：任何文本 transform_y < 此值视为可能碰撞字幕 */
  collisionThresholdY: number;
  /** 顶部安全距离（transform_y 上限，避免碰顶边） */
  topSafeY: number;
}

// ============================================================================
// 校准记录
// ============================================================================

/** 安全范围（Agent 只允许在此范围内轻微修正） */
export interface SafeRange {
  minSafeScale: number;
  maxSafeScale: number;
  minSafeX: number;
  maxSafeX: number;
  minSafeY: number;
  maxSafeY: number;
}

/** 视觉测量结果（实际 bbox，不是 scale 数值） */
export interface VisualMeasurement {
  /** 测量时使用的 scale（剪映 clip scale，当前 Worker 固定 1.0） */
  measuredScale: number;
  /** 测量时 positionX */
  measuredPositionX: number;
  /** 测量时 positionY */
  measuredPositionY: number;
  /** 实际视觉宽度占屏宽比例（含文字+描边+阴影+装饰+模板外围效果） */
  measuredWidthRatio: number;
  /** 实际视觉高度占屏高比例 */
  measuredHeightRatio: number;
  /** 视觉中心 X（相对屏幕中心） */
  visualCenterX: number;
  /** 视觉中心 Y（相对屏幕中心） */
  visualCenterY: number;
  /** bbox 来源：screenshot_diff / manual / estimated / pending */
  bboxSource: 'screenshot_diff' | 'manual' | 'estimated' | 'pending';
  /** 是否溢出安全区 */
  overflowSafeZone: boolean;
  /** 是否与字幕碰撞 */
  subtitleCollision: boolean;
  /** 证据草稿名 */
  evidenceDraft?: string;
  /** 证据截图路径 */
  evidenceScreenshot?: string;
}

/** 单个校准单元（resourceId × usageRole × charBucket × variant） */
export interface CalibrationEntry {
  /** 唯一 case ID */
  caseId: string;
  resourceId: string;
  resourceType: CalibrationResourceType;
  /** 资源显示名 */
  resourceName: string;
  aspectRatio: CalibrationAspectRatio;
  usageRole: UsageRole;
  /** 实际字数 */
  charCount: number;
  /** 字数分档 */
  charBucket: CharBucket;
  /** 测试文案 */
  testText: string;
  textClass: TextClass;
  variant: CalibrationVariant;
  /** 校准状态 */
  status: CalibrationStatus;
  /** 拒绝原因（status=REJECTED 时） */
  rejectionReason?: RejectionReason;
  /** 推荐 scale（剪映 clip scale；当前 Worker 固定 1.0，字段预留） */
  recommendedScale?: number;
  /** 推荐 positionX */
  recommendedPositionX?: number;
  /** 推荐 positionY */
  recommendedPositionY?: number;
  /** 实际视觉测量 */
  measurement?: VisualMeasurement;
  /** 安全范围 */
  safeRange?: SafeRange;
  /** 校准过程记录（原始 scale/bbox → 调整过程 → 最终） */
  calibrationLog?: string[];
  /** 人工验收备注 */
  humanNote?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ============================================================================
// 校准矩阵
// ============================================================================

/** 校准矩阵（按 resourceId → usageRole → charBucket → variant 索引） */
export interface CalibrationMatrix {
  version: string;
  aspectRatio: CalibrationAspectRatio;
  generatedAt: string;
  /** P0 资源列表 */
  p0Resources: Array<{
    resourceId: string;
    resourceType: CalibrationResourceType;
    resourceName: string;
    selectionReason: string;
  }>;
  /** 所有校准单元 */
  entries: CalibrationEntry[];
  /** 统计 */
  stats: {
    total: number;
    byStatus: Record<CalibrationStatus, number>;
    byRole: Record<UsageRole, number>;
  };
}

// ============================================================================
// 角色目标文件结构
// ============================================================================

export interface RoleTargetsFile {
  version: string;
  aspectRatio: CalibrationAspectRatio;
  canvasWidth: number;
  canvasHeight: number;
  subtitleSafeZone: SubtitleSafeZone;
  targets: RoleTarget[];
  generatedAt: string;
  source: string;
}

// ============================================================================
// 验收清单
// ============================================================================

export interface CalibrationReviewItem {
  caseId: string;
  resourceId: string;
  resourceName: string;
  resourceType: CalibrationResourceType;
  usageRole: UsageRole;
  charCount: number;
  charBucket: CharBucket;
  variant: CalibrationVariant;
  testText: string;
  /** 在草稿中的时间段（秒） */
  draftTimeRange: [number, number];
  expectedTarget: RoleTarget;
  currentStatus: CalibrationStatus;
  /** 验收指引 */
  reviewHint: string;
}

export interface CalibrationReviewFile {
  version: string;
  draftName: string;
  draftPath: string;
  generatedAt: string;
  items: CalibrationReviewItem[];
  instructions: string[];
}
