/**
 * Template Asset —— 正式 Schema（schemaVersion 1.0）
 *
 * 描述企业模板的事实（由 template-parser 从人工母版编译生成）。
 * 注意：Template Asset 描述【企业模板事实】，属于客户 Obsidian，不属于产品源码。
 * 本文件只定义【类型 + 校验】，不包含任何企业模板数据。
 *
 * 版本化规则：
 * - schemaVersion 升级时不得悄悄破坏旧企业模板（parser 必须向后兼容）。
 * - 本文件对应 schemaVersion = "1.0"。
 */
import { z } from 'zod';

export const TEMPLATE_ASSET_SCHEMA_VERSION = '1.0';

// ============================================================================
// Slot Constraint
// ============================================================================

export const SLOT_CONSTRAINT_MODES = [
  'EXACT_CHAR_COUNT',
  'CHAR_RANGE',
  'FIXED_TEXT',
  'NEEDS_VALIDATION'
] as const;
export type SlotConstraintMode = (typeof SLOT_CONSTRAINT_MODES)[number];

export interface SlotConstraint {
  /** 约束模式（EXACT_CHAR_COUNT 必须严格等字数） */
  mode: SlotConstraintMode;
  /** 必须等于的字数（mode=EXACT_CHAR_COUNT 时生效） */
  exactCharCount?: number;
  /** 允许字数下限（mode=CHAR_RANGE 时生效） */
  minChars?: number | null;
  /** 允许字数上限（mode=CHAR_RANGE 时生效） */
  maxChars?: number | null;
  /** 固定文本（mode=FIXED_TEXT 时生效，禁止 LLM 替换） */
  fixedText?: string;
  /** 验证状态 */
  validationStatus?: 'UNKNOWN' | 'PENDING_VISUAL_REVIEW' | 'HUMAN_APPROVED' | 'REJECTED';
  /** 验证来源 */
  validationSource?: 'HUMAN_VISUAL_REVIEW' | 'INFERRED_FROM_APPROVED_CLUSTER';
}

// ============================================================================
// Text Slot
// ============================================================================

export const TEXT_SLOT_ROLES = [
  'title',
  'key_emphasis',
  'dense_info_item',
  'cta',
  'decoration',
  'subtitle',
  'unknown'
] as const;
export type TextSlotRole = (typeof TEXT_SLOT_ROLES)[number];

export const TEXT_SLOT_RESOURCE_TYPES = ['plain_text', 'flower_text', 'text_template'] as const;
export type TextSlotResourceType = (typeof TEXT_SLOT_RESOURCE_TYPES)[number];

export interface TemplateTextSlot {
  /** 槽位唯一 ID（segmentId，母版真实 ID） */
  slotId: string;
  /** 剪映 segment id */
  segmentId: string;
  /** 剪映 material id */
  materialId: string;
  /** 轨道下标 */
  trackIndex: number;
  /** 资源类型 */
  resourceType: TextSlotResourceType;
  /** text_template 的 resource_id / flower_text 的 effectStyleId（plain 为 null） */
  resourceId: string | null;
  /** 原文 */
  originalText: string;
  /** 可见中文字符数 */
  originalCharCount: number;
  /** 起始时间（秒） */
  startSec: number;
  /** 时长（秒） */
  durationSec: number;
  /** 视觉角色（LLM 辅助分类，与确定性数据分开记录） */
  role?: TextSlotRole;
  /** 字数约束（缺失 = NEEDS_VALIDATION） */
  constraint?: SlotConstraint;
  /** 搭配组 ID（组内槽位必须整体替换） */
  groupId?: string;
  /** 文本类别 */
  textClass?: 'chinese_normal' | 'numeric' | 'latin' | 'mixed';
}

// ============================================================================
// Media Slot
// ============================================================================

export const MEDIA_SLOT_TYPES = ['video', 'image', 'audio'] as const;
export type MediaSlotType = (typeof MEDIA_SLOT_TYPES)[number];

export const MEDIA_SLOT_SEMANTIC_ROLES = [
  'factory',
  'production_line',
  'product',
  'packaging',
  'inspection',
  'office',
  'logistics',
  'team',
  'certificate',
  'unknown'
] as const;
export type MediaSlotSemanticRole = (typeof MEDIA_SLOT_SEMANTIC_ROLES)[number];

export interface TemplateMediaSlot {
  /** 槽位唯一 ID（segmentId） */
  slotId: string;
  /** 剪映 segment id */
  segmentId: string;
  /** 剪映 material id */
  materialId: string;
  /** 轨道下标 */
  trackIndex: number;
  /** 媒体类型 */
  mediaType: MediaSlotType;
  /** 原素材路径（母版引用，可能离线） */
  originalPath: string;
  /** 原素材时长（秒） */
  durationSec: number;
  /** 槽位起始时间（秒） */
  startSec: number;
  /** 槽位段时长（秒） */
  segmentDurationSec: number;
  /** 语义角色（LLM 辅助分类） */
  semanticRole?: MediaSlotSemanticRole;
}

// ============================================================================
// Template Asset
// ============================================================================

export const TEMPLATE_ASSET_STATUSES = ['testing', 'approved', 'disabled'] as const;
export type TemplateAssetStatus = (typeof TEMPLATE_ASSET_STATUSES)[number];

export interface TemplateAsset {
  /** schema 版本（必须 = "1.0"） */
  schemaVersion: string;
  /** 模板唯一 ID */
  templateId: string;
  /** 模板名 */
  templateName: string;
  /** 模板信息 */
  templateInfo: {
    /** 画幅（canvas 宽高） */
    canvas: { width: number; height: number };
    /** 总时长（秒） */
    durationSec: number;
    /** 轨道结构 */
    tracks: Array<{ index: number; type: string; segmentCount: number }>;
    /** 来源母版名 */
    sourceDraft: string;
    /** 来源母版目录 */
    sourceDraftDir: string;
    /** 内容类型 */
    contentType?: string;
    /** 目标受众 */
    targetAudience?: string;
    /** 内容结构 */
    structure?: string;
    /** 剪映版本 */
    jianyingVersion?: string;
  };
  /** 默认约束模式 */
  constraintMode: SlotConstraintMode;
  /** 文字槽 */
  textSlots: TemplateTextSlot[];
  /** 媒体槽 */
  mediaSlots: TemplateMediaSlot[];
  /** 替换方案（parser 生成骨架，usage 填充） */
  replacementPlan?: {
    text: Record<string, string>;
    media: Record<
      string,
      {
        assetPath: string;
        assetDurationSec: number;
        semanticRole?: string;
        width?: number;
        height?: number;
        fileName?: string;
      }
    >;
  };
  /** 状态 */
  status: TemplateAssetStatus;
  /** 验证状态（PENDING_USER_REVIEW → HUMAN_APPROVED） */
  verificationStatus: 'PENDING_USER_REVIEW' | 'HUMAN_APPROVED' | 'REJECTED';
  /** 验收证据草稿名 */
  reviewedDraft?: string;
  /** 备注 */
  audioNote?: string;
  /** 离线素材（MEDIA_OFFLINE 记录） */
  offlineAssets?: string[];
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
}

// ============================================================================
// Zod Schema（运行时校验）
// ============================================================================

const textSlotSchema = z.object({
  slotId: z.string(),
  segmentId: z.string(),
  materialId: z.string(),
  trackIndex: z.number(),
  resourceType: z.enum(TEXT_SLOT_RESOURCE_TYPES),
  resourceId: z.string().nullable(),
  originalText: z.string(),
  originalCharCount: z.number(),
  startSec: z.number(),
  durationSec: z.number(),
  role: z.enum(TEXT_SLOT_ROLES).optional(),
  constraint: z
    .object({
      mode: z.enum(SLOT_CONSTRAINT_MODES),
      exactCharCount: z.number().optional(),
      minChars: z.number().nullable().optional(),
      maxChars: z.number().nullable().optional(),
      fixedText: z.string().optional(),
      validationStatus: z.string().optional(),
      validationSource: z.string().optional()
    })
    .optional(),
  groupId: z.string().optional(),
  textClass: z.string().optional()
});

const mediaSlotSchema = z.object({
  slotId: z.string(),
  segmentId: z.string(),
  materialId: z.string(),
  trackIndex: z.number(),
  mediaType: z.enum(MEDIA_SLOT_TYPES),
  originalPath: z.string(),
  durationSec: z.number(),
  startSec: z.number(),
  segmentDurationSec: z.number(),
  semanticRole: z.string().optional()
});

/** Template Asset 运行时校验（返回 { ok, errors }） */
export function validateTemplateAsset(raw: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['资产不是对象'] };
  }
  const d = raw as Record<string, unknown>;
  if (d.schemaVersion !== TEMPLATE_ASSET_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion 必须为 ${TEMPLATE_ASSET_SCHEMA_VERSION}，实际 ${String(d.schemaVersion)}`
    );
  }
  if (typeof d.templateId !== 'string' || !d.templateId) errors.push('templateId 缺失');
  if (typeof d.templateName !== 'string' || !d.templateName) errors.push('templateName 缺失');
  if (!Array.isArray(d.textSlots)) errors.push('textSlots 必须为数组');
  if (!Array.isArray(d.mediaSlots)) errors.push('mediaSlots 必须为数组');
  const ts = d.textSlots as unknown[];
  if (Array.isArray(ts)) {
    ts.forEach((s, i) => {
      const r = textSlotSchema.safeParse(s);
      if (!r.success)
        errors.push(`textSlots[${i}] 无效: ${r.error.issues[0]?.message ?? 'schema'}`);
    });
  }
  const ms = d.mediaSlots as unknown[];
  if (Array.isArray(ms)) {
    ms.forEach((s, i) => {
      const r = mediaSlotSchema.safeParse(s);
      if (!r.success)
        errors.push(`mediaSlots[${i}] 无效: ${r.error.issues[0]?.message ?? 'schema'}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

/** 兼容旧资产：把旧字段名（text→originalText, resourceType PLAIN→plain_text 等）归一化到 v1.0 */
export function normalizeTemplateAsset(raw: Record<string, unknown>): TemplateAsset | null {
  try {
    const ts = Array.isArray(raw.textSlots)
      ? (raw.textSlots as Record<string, unknown>[]).map((s) => {
          const rt =
            s.resourceType === 'PLAIN'
              ? 'plain_text'
              : s.resourceType === 'TEXT_TEMPLATE'
                ? 'text_template'
                : s.resourceType === 'flower_text'
                  ? 'flower_text'
                  : 'plain_text';
          return {
            slotId: String(s.segmentId ?? s.slotId ?? ''),
            segmentId: String(s.segmentId ?? s.slotId ?? ''),
            materialId: String(s.materialId ?? ''),
            trackIndex: Number(s.trackIndex ?? -1),
            resourceType: rt as TextSlotResourceType,
            resourceId: s.resourceId ? String(s.resourceId) : null,
            originalText: String(s.text ?? s.originalText ?? ''),
            originalCharCount: Number(s.charCount ?? s.originalCharCount ?? 0),
            startSec: Number(s.startSec ?? 0),
            durationSec: Number(s.durationSec ?? 0),
            role: (s.role as TextSlotRole) || undefined,
            constraint: s.constraint as SlotConstraint | undefined,
            groupId: s.groupId ? String(s.groupId) : undefined,
            textClass: (s.textClass as TemplateTextSlot['textClass']) || undefined
          } satisfies TemplateTextSlot;
        })
      : [];
    const ms = Array.isArray(raw.mediaSlots)
      ? (raw.mediaSlots as Record<string, unknown>[]).map(
          (s) =>
            ({
              slotId: String(s.segmentId ?? s.slotId ?? ''),
              segmentId: String(s.segmentId ?? s.slotId ?? ''),
              materialId: String(s.materialId ?? ''),
              trackIndex: Number(s.trackIndex ?? -1),
              mediaType: (s.type === 'video'
                ? 'video'
                : s.type === 'image'
                  ? 'image'
                  : 'video') as MediaSlotType,
              originalPath: String(s.originalPath ?? ''),
              durationSec: Number(s.durationSec ?? 0),
              startSec: Number(s.startSec ?? 0),
              segmentDurationSec: Number(s.segmentDurationSec ?? 0),
              semanticRole: s.semanticRole
                ? (s.semanticRole as TemplateMediaSlot['semanticRole'])
                : undefined
            }) satisfies TemplateMediaSlot
        )
      : [];

    const info = (raw.templateInfo ?? {}) as Record<string, unknown>;
    const asset: TemplateAsset = {
      schemaVersion: TEMPLATE_ASSET_SCHEMA_VERSION,
      templateId: String(raw.templateId ?? ''),
      templateName: String(raw.templateName ?? ''),
      templateInfo: {
        canvas: {
          width: Number((info.canvas as Record<string, unknown>)?.width ?? 0),
          height: Number((info.canvas as Record<string, unknown>)?.height ?? 0)
        },
        durationSec: Number(info.durationSec ?? 0),
        tracks: Array.isArray(info.tracks)
          ? (info.tracks as TemplateAsset['templateInfo']['tracks'])
          : [],
        sourceDraft: String(info.sourceDraft ?? ''),
        sourceDraftDir: String(info.sourceDraftDir ?? ''),
        contentType: info.contentType ? String(info.contentType) : undefined,
        targetAudience: info.targetAudience ? String(info.targetAudience) : undefined,
        structure: info.structure ? String(info.structure) : undefined,
        jianyingVersion: info.jianyingVersion ? String(info.jianyingVersion) : undefined
      },
      constraintMode: (raw.constraintMode as SlotConstraintMode) || 'EXACT_CHAR_COUNT',
      textSlots: ts,
      mediaSlots: ms,
      replacementPlan: raw.replacementPlan as TemplateAsset['replacementPlan'],
      status: (raw.status as TemplateAssetStatus) || 'testing',
      verificationStatus:
        (raw.verificationStatus as TemplateAsset['verificationStatus']) || 'PENDING_USER_REVIEW',
      reviewedDraft: raw.reviewedDraft ? String(raw.reviewedDraft) : undefined,
      audioNote: raw.audioNote ? String(raw.audioNote) : undefined,
      offlineAssets: Array.isArray(raw.offlineAssets) ? (raw.offlineAssets as string[]) : undefined,
      createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined
    };
    return asset;
  } catch {
    return null;
  }
}

/** 统计可见中文字符数（中文=1，可见标点=1，空格忽略）——统一规则 */
export function countVisibleChineseChars(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === ' ' || ch === '\u3000') continue; // 忽略空格/全角空格
    count += 1;
  }
  return count;
}

/** 校验替换文本是否满足槽位约束 */
export function validateReplacementText(
  slot: Pick<TemplateTextSlot, 'originalCharCount' | 'constraint'>,
  replacementText: string
): { valid: boolean; reason?: string } {
  const mode = slot.constraint?.mode ?? 'EXACT_CHAR_COUNT';
  const actual = countVisibleChineseChars(replacementText);
  if (mode === 'EXACT_CHAR_COUNT') {
    const expected = slot.constraint?.exactCharCount ?? slot.originalCharCount;
    if (actual !== expected) {
      return { valid: false, reason: `EXACT_CHAR_COUNT 要求 ${expected} 字，实际 ${actual} 字` };
    }
    return { valid: true };
  }
  if (mode === 'CHAR_RANGE') {
    const min = slot.constraint?.minChars ?? slot.originalCharCount;
    const max = slot.constraint?.maxChars ?? slot.originalCharCount;
    if (actual < min || actual > max) {
      return { valid: false, reason: `CHAR_RANGE 要求 ${min}-${max} 字，实际 ${actual} 字` };
    }
    return { valid: true };
  }
  if (mode === 'FIXED_TEXT') {
    return slot.constraint?.fixedText === replacementText
      ? { valid: true }
      : { valid: false, reason: 'FIXED_TEXT 不允许替换' };
  }
  // NEEDS_VALIDATION：按原字数保守校验
  const expected = slot.originalCharCount;
  if (actual !== expected) {
    return {
      valid: false,
      reason: `NEEDS_VALIDATION 按原字数 ${expected} 保守校验，实际 ${actual} 字`
    };
  }
  return { valid: true };
}
