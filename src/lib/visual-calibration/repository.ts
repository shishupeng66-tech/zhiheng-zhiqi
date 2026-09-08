/**
 * Visual Calibration Repository —— 校准数据存储与查询
 *
 * 存储位置：resolveSystemAsset("resourceCalibrationRoot") / vertical-9x16/
 *   - matrix.json          校准矩阵
 *   - role-targets.json    角色目标
 *   - measurements.json    测量记录
 *   - approved-specs.json  人工验收通过的规格
 *   - evidence/            证据草稿/截图
 *   - previews/            预览
 *
 * API：
 *   getVerticalCalibration(resourceId, usageRole, charCount, variant?)
 *   listCalibrationMatrix()
 *   getHumanApprovedCalibration(...)
 *   interpolateCalibration(...)  —— nearest / linear
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveSystemAsset } from '@/lib/system-assets';
import type {
  CalibrationEntry,
  CalibrationMatrix,
  CalibrationVariant,
  CharBucket,
  RoleTarget,
  UsageRole
} from './types';
import { getRoleTarget } from './role-targets';

const VERTICAL_DIR = 'vertical-9x16';
const MATRIX_FILE = 'matrix.json';
const ROLE_TARGETS_FILE = 'role-targets.json';
const MEASUREMENTS_FILE = 'measurements.json';
const APPROVED_SPECS_FILE = 'approved-specs.json';

/** 获取校准根目录（resolveSystemAsset("resourceCalibrationRoot")） */
export async function getCalibrationRoot(): Promise<string> {
  const r = await resolveSystemAsset('resourceCalibrationRoot');
  return r.path;
}

/** 获取 vertical-9x16 目录 */
export async function getVerticalCalibrationDir(): Promise<string> {
  const root = await getCalibrationRoot();
  return path.join(root, VERTICAL_DIR);
}

/** 确保目录存在（仅显式调用时创建） */
export async function ensureCalibrationDirs(): Promise<void> {
  const dir = await getVerticalCalibrationDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'previews'), { recursive: true });
}

// ============================================================================
// Matrix 读写
// ============================================================================

/** 加载校准矩阵（不存在返回 null） */
export async function loadCalibrationMatrix(): Promise<CalibrationMatrix | null> {
  const dir = await getVerticalCalibrationDir();
  const p = path.join(dir, MATRIX_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as CalibrationMatrix;
  } catch {
    return null;
  }
}

/** 保存校准矩阵 */
export async function saveCalibrationMatrix(matrix: CalibrationMatrix): Promise<void> {
  const dir = await getVerticalCalibrationDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MATRIX_FILE), JSON.stringify(matrix, null, 2), 'utf8');
}

/** 列出全部校准单元 */
export async function listCalibrationMatrix(): Promise<CalibrationEntry[]> {
  const m = await loadCalibrationMatrix();
  return m?.entries ?? [];
}

// ============================================================================
// 查询
// ============================================================================

/** 字数 → 分档（2/4/6/8，向下取最近偶数） */
export function charCountToBucket(charCount: number): CharBucket {
  if (charCount <= 2) return 2;
  if (charCount <= 4) return 4;
  if (charCount <= 6) return 6;
  return 8;
}

/**
 * 获取精确匹配的校准单元（resourceId × usageRole × charBucket × variant）
 */
export async function getVerticalCalibration(
  resourceId: string,
  usageRole: UsageRole,
  charCount: number,
  variant: CalibrationVariant = 'default'
): Promise<CalibrationEntry | null> {
  const entries = await listCalibrationMatrix();
  const bucket = charCountToBucket(charCount);
  // dense_info_item 默认 variant 处理
  const effectiveVariant =
    usageRole === 'dense_info_item' && variant === 'default' ? 'withTitle' : variant;
  return (
    entries.find(
      (e) =>
        e.resourceId === resourceId &&
        e.usageRole === usageRole &&
        e.charBucket === bucket &&
        e.variant === effectiveVariant
    ) ?? null
  );
}

/**
 * 获取人工验收通过的校准规格。
 * 只有 status=HUMAN_APPROVED 才允许正式生产调用。
 */
export async function getHumanApprovedCalibration(
  resourceId: string,
  usageRole: UsageRole,
  charCount: number,
  variant: CalibrationVariant = 'default'
): Promise<CalibrationEntry | null> {
  const entry = await getVerticalCalibration(resourceId, usageRole, charCount, variant);
  if (entry && entry.status === 'HUMAN_APPROVED') return entry;
  return null;
}

// ============================================================================
// 插值
// ============================================================================

export type InterpolationStrategy = 'nearest' | 'linear';

/**
 * 插值校准规格。
 * - nearest：取最接近的 charBucket
 * - linear：在相邻 bucket 之间线性插值 scale/position
 *
 * 如果视觉模板不是线性缩放，允许返回 nearest bucket。
 * 只有 HUMAN_APPROVED 的 entry 参与插值。
 */
export async function interpolateCalibration(
  resourceId: string,
  usageRole: UsageRole,
  charCount: number,
  variant: CalibrationVariant = 'default',
  strategy: InterpolationStrategy = 'nearest'
): Promise<CalibrationEntry | null> {
  const entries = await listCalibrationMatrix();
  const effectiveVariant =
    usageRole === 'dense_info_item' && variant === 'default' ? 'withTitle' : variant;

  const approved = entries.filter(
    (e) =>
      e.resourceId === resourceId &&
      e.usageRole === usageRole &&
      e.variant === effectiveVariant &&
      e.status === 'HUMAN_APPROVED'
  );

  if (approved.length === 0) return null;

  // 精确匹配
  const bucket = charCountToBucket(charCount);
  const exact = approved.find((e) => e.charBucket === bucket);
  if (exact) return exact;

  // nearest
  const sorted = [...approved].sort((a, b) => a.charBucket - b.charBucket);
  if (strategy === 'nearest' || sorted.length < 2) {
    let nearest = sorted[0];
    let minDist = Math.abs(nearest.charBucket - charCount);
    for (const e of sorted) {
      const d = Math.abs(e.charBucket - charCount);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    }
    return nearest;
  }

  // linear：找上下相邻 bucket
  const lower = sorted.filter((e) => e.charBucket <= bucket).pop();
  const upper = sorted.find((e) => e.charBucket > bucket);
  if (!lower || !upper) return lower ?? upper ?? sorted[0];

  const t = (bucket - lower.charBucket) / (upper.charBucket - lower.charBucket);
  const lerp = (a: number | undefined, b: number | undefined): number | undefined => {
    if (a === undefined || b === undefined) return a ?? b;
    return a + (b - a) * t;
  };

  return {
    ...lower,
    caseId: `${lower.caseId}_interp_${charCount}`,
    charCount,
    charBucket: bucket,
    recommendedScale: lerp(lower.recommendedScale, upper.recommendedScale),
    recommendedPositionX: lerp(lower.recommendedPositionX, upper.recommendedPositionX),
    recommendedPositionY: lerp(lower.recommendedPositionY, upper.recommendedPositionY),
    humanNote: `线性插值自 ${lower.charBucket}字 和 ${upper.charBucket}字`
  };
}

// ============================================================================
// 统计
// ============================================================================

/** 获取矩阵统计 */
export async function getCalibrationStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byRole: Record<string, number>;
  humanApproved: number;
  autoCalibrated: number;
  rejected: number;
  measurementPending: number;
} | null> {
  const m = await loadCalibrationMatrix();
  if (!m) return null;
  return {
    total: m.stats.total,
    byStatus: m.stats.byStatus,
    byRole: m.stats.byRole,
    humanApproved: m.stats.byStatus.HUMAN_APPROVED ?? 0,
    autoCalibrated: m.stats.byStatus.AUTO_CALIBRATED ?? 0,
    rejected: m.stats.byStatus.REJECTED ?? 0,
    measurementPending: m.stats.byStatus.MEASUREMENT_PENDING ?? 0
  };
}

/** 获取角色目标（便捷封装） */
export function getCalibrationRoleTarget(
  usageRole: UsageRole,
  variant: CalibrationVariant = 'default'
): RoleTarget | undefined {
  return getRoleTarget(usageRole, variant);
}
