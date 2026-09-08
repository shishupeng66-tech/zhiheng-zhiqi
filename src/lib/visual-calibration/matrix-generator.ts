/**
 * Calibration Matrix Generator —— P0 资源选择 + 校准矩阵生成
 *
 * P0 资源（第一轮，共8个）：
 * - 5 个 text_template（已真实测试/企业适用）
 * - 3 个 flower_text（简洁、不幼稚、识别度高、背景适应性好）
 *
 * 每个资源 × 3 role（title/key_emphasis/dense_info_item）× 字数分档（2/4/6/8）
 * dense_info_item 额外区分 withTitle / withoutTitle
 *
 * 所有 cell 初始状态 NOT_STARTED，生成草稿后变为 DRAFT_CREATED / MEASUREMENT_PENDING。
 * 没有人审前 HUMAN_APPROVED 保持 0。
 */
import type {
  CalibrationAspectRatio,
  CalibrationEntry,
  CalibrationMatrix,
  CalibrationResourceType,
  CalibrationStatus,
  CalibrationVariant,
  CharBucket,
  TextClass,
  UsageRole
} from './types';

// ============================================================================
// 标准测试文案（严格校验中文字符数）
// ============================================================================

export const STANDARD_TEST_TEXTS: Record<CharBucket, string> = {
  2: '实力',
  4: '成本评估',
  6: '生产制造实力',
  8: '产品方案成本评估'
};

/** 校验中文字符数 */
export function countChineseChars(text: string): number {
  return [...text].filter((c) => /[\u4e00-\u9fff]/.test(c)).length;
}

// ============================================================================
// P0 资源定义
// ============================================================================

export interface P0Resource {
  resourceId: string;
  resourceType: CalibrationResourceType;
  resourceName: string;
  selectionReason: string;
}

/**
 * P0 文字模板（5个）
 *
 * 选择依据：
 * - 优先从用户明确列出的"已真实测试5个"中选择
 * - 燃爆：高能量标题，适合 title/key_emphasis
 * - 强烈推荐-美食：已在 Registry，验证过渲染
 * - 片尾信息14：信息型，适合 dense_info_item
 * - 新闻-实时动态：规整排版，适合 title/dense
 * - 科技数码-流畅度拉满：科技感，适合企业/工厂
 */
export const P0_TEXT_TEMPLATES: P0Resource[] = [
  {
    resourceId: '7648973686581529881',
    resourceType: 'text_template',
    resourceName: '燃爆',
    selectionReason: '高能量视觉冲击，适合 title/key_emphasis；用户列为已真实测试'
  },
  {
    resourceId: '7481212496670641433',
    resourceType: 'text_template',
    resourceName: '强烈推荐-美食',
    selectionReason: '已在 Visual Resource Registry 注册并验证渲染；强调型，适合 key_emphasis'
  },
  {
    resourceId: '7090496807737888034',
    resourceType: 'text_template',
    resourceName: '片尾信息14',
    selectionReason: '信息排版型，适合 dense_info_item；用户列为已真实测试'
  },
  {
    resourceId: '7662260569604443417',
    resourceType: 'text_template',
    resourceName: '新闻-实时动态',
    selectionReason: '规整新闻排版，识别度高，适合 title/dense_info；用户列为已真实测试'
  },
  {
    resourceId: '7634078804973210905',
    resourceType: 'text_template',
    resourceName: '科技数码-流畅度拉满',
    selectionReason: '科技感风格，适合企业/工厂产品介绍；用户列为已真实测试'
  }
];

/**
 * P0 花字（3个，从12个 unique flower_text 中选择）
 *
 * 选择标准：简洁、不幼稚、不综艺化过强、识别度高、背景适应性好
 * 排除：可爱彩色涂鸦、粉紫3D、红色渐变裂痕综艺、彩色手绘蜡笔、绿黄红渐变星星夏日
 */
export const P0_FLOWER_TEXTS: P0Resource[] = [
  {
    resourceId: '7583314481644604697',
    resourceType: 'flower_text',
    resourceName: '黄色图案描边字',
    selectionReason: '简洁高对比，黄色描边识别度高，背景适应性好，适合企业 title'
  },
  {
    resourceId: '7509039282737302808',
    resourceType: 'flower_text',
    resourceName: '白纸纹理蓝边拼贴花字',
    selectionReason: '干净商务风，白纸蓝边不花哨，适合 key_emphasis/dense_info'
  },
  {
    resourceId: '7565778764605607193',
    resourceType: 'flower_text',
    resourceName: '蓝橙渐变光面立体运动花字',
    selectionReason: '科技感立体字，适合工厂/产品介绍，视觉存在感强'
  }
];

/** 全部 P0 资源 */
export const P0_RESOURCES: P0Resource[] = [...P0_TEXT_TEMPLATES, ...P0_FLOWER_TEXTS];

// ============================================================================
// 矩阵生成
// ============================================================================

const ASPECT: CalibrationAspectRatio = '9:16';
const TEXT_CLASS: TextClass = 'chinese_normal';

/** role → 测试字数 */
const ROLE_CHAR_BUCKETS: Record<UsageRole, CharBucket[]> = {
  title: [2, 4, 6, 8],
  key_emphasis: [2, 4, 6, 8],
  dense_info_item: [2, 4, 6] // 8字作为 edge case，可选
};

/** role → variants */
function getVariantsForRole(role: UsageRole): CalibrationVariant[] {
  if (role === 'dense_info_item') return ['withTitle', 'withoutTitle'];
  return ['default'];
}

/** 生成 case ID */
function makeCaseId(
  resourceId: string,
  role: UsageRole,
  bucket: CharBucket,
  variant: CalibrationVariant
): string {
  return `cal-${resourceId.slice(-8)}-${role}-${bucket}${variant !== 'default' ? '-' + variant : ''}`;
}

/**
 * 生成完整校准矩阵。
 * 所有 cell 初始状态 NOT_STARTED。
 */
export function generateCalibrationMatrix(): CalibrationMatrix {
  const entries: CalibrationEntry[] = [];
  const now = new Date().toISOString();

  for (const res of P0_RESOURCES) {
    for (const role of Object.keys(ROLE_CHAR_BUCKETS) as UsageRole[]) {
      const buckets = ROLE_CHAR_BUCKETS[role];
      const variants = getVariantsForRole(role);
      for (const bucket of buckets) {
        for (const variant of variants) {
          const status: CalibrationStatus = 'NOT_STARTED';
          entries.push({
            caseId: makeCaseId(res.resourceId, role, bucket, variant),
            resourceId: res.resourceId,
            resourceType: res.resourceType,
            resourceName: res.resourceName,
            aspectRatio: ASPECT,
            usageRole: role,
            charCount: bucket,
            charBucket: bucket,
            testText: STANDARD_TEST_TEXTS[bucket],
            textClass: TEXT_CLASS,
            variant,
            status,
            createdAt: now,
            updatedAt: now
          });
        }
      }
    }
  }

  // 统计
  const byStatus: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  for (const e of entries) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    byRole[e.usageRole] = (byRole[e.usageRole] ?? 0) + 1;
  }

  return {
    version: '1.0.0',
    aspectRatio: ASPECT,
    generatedAt: now,
    p0Resources: P0_RESOURCES.map((r) => ({
      resourceId: r.resourceId,
      resourceType: r.resourceType,
      resourceName: r.resourceName,
      selectionReason: r.selectionReason
    })),
    entries,
    stats: {
      total: entries.length,
      byStatus: byStatus as Record<CalibrationStatus, number>,
      byRole: byRole as Record<UsageRole, number>
    }
  };
}

/**
 * 计算矩阵 cell 总数（用于验证）
 * 5 text_template + 3 flower_text = 8 resources
 * title: 4 buckets × 1 variant = 4
 * key_emphasis: 4 buckets × 1 variant = 4
 * dense_info_item: 3 buckets × 2 variants = 6
 * per resource = 14 cells
 * total = 8 × 14 = 112 cells
 */
export const EXPECTED_MATRIX_SIZE = 8 * (4 + 4 + 6); // 112
