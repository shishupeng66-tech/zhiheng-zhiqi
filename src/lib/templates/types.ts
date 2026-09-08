/**
 * Template Library —— 类型定义
 *
 * 正式模板库：只管理已经制作、测试、验收过，可以程序化复用的剪映模板。
 * 不包含第三方 729 套研究库（那是 General Research Library）。
 */

/** 模板状态 */
export type TemplateStatus = 'draft' | 'testing' | 'approved' | 'disabled';

/** 模板类型 */
export type TemplateType =
  | 'full_video'
  | 'title'
  | 'ending'
  | 'information_wall'
  | 'product_intro'
  | 'factory'
  | 'business_knowledge'
  | 'case_study';

/** 模板来源类型（预留 Promote 工作流） */
export type TemplateSourceType = 'zhiheng_created' | 'external_reviewed' | 'imported';

/** 画幅 */
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4';

/** 单个模板定义 */
export interface JianyingTemplate {
  /** 唯一 ID */
  templateId: string;
  /** 模板名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 状态 */
  status: TemplateStatus;
  /** 模板类型 */
  templateType: TemplateType;
  /** 画幅 */
  aspectRatio: AspectRatio;
  /** 原生时长（秒） */
  nativeDurationSec?: number;
  /** 推荐时长下限（秒） */
  recommendedDurationMinSec?: number;
  /** 推荐时长上限（秒） */
  recommendedDurationMaxSec?: number;
  /** 剪映草稿路径（绝对路径，由 Path Resolver 或登记时写入） */
  draftPath: string;
  /** 预览图路径（可选） */
  previewImagePath?: string;
  /** 剪映版本 */
  jianyingVersion?: string;
  /** 素材完整性标记 */
  assetIntegrity?: 'complete' | 'partial' | 'missing';
  /** 替换就绪度 */
  replacementReadiness?: 'ready' | 'partial' | 'not_ready';
  /** 视频槽数量 */
  videoSlotCount?: number;
  /** 图片槽数量 */
  imageSlotCount?: number;
  /** 文字槽数量 */
  textSlotCount?: number;
  /** 标签 */
  tags: string[];
  /** 适用场景 */
  useCases: string[];
  /** 来源类型 */
  sourceType?: TemplateSourceType;
  /** 来源模板 ID（从研究库 promote 时记录，可为空） */
  sourceTemplateId?: string;
  /** 来源工作草稿路径（testing 阶段可引用剪映工作草稿） */
  sourceDraftPath?: string;
  /** Production 冻结草稿路径（approved 阶段必须复制到 <root>/drafts/<type>/<templateId>/） */
  productionDraftPath?: string;
  /** 冻结草稿指纹（SHA256，approved 时记录） */
  frozenFingerprint?: string;
  /** 验收通过时间 ISO */
  approvedAt?: string;
  /** 归档时间 ISO */
  archivedAt?: string;
  /** Agent 是否可用（approved 默认 true，其他默认 false） */
  enabledForAgent?: boolean;
  /** 搜索文本（由 name/description/useCases/tags/templateType 组成，供后续检索） */
  searchText?: string;
  /** 创建时间 ISO */
  createdAt: string;
  /** 更新时间 ISO */
  updatedAt: string;
}

/** Registry 文件结构 */
export interface TemplateRegistryFile {
  version: number;
  generatedAt: string;
  templates: JianyingTemplate[];
}

/** 状态中文映射 */
export const TEMPLATE_STATUS_LABEL: Record<TemplateStatus, string> = {
  draft: '草稿',
  testing: '测试中',
  approved: '已验收',
  disabled: '已停用'
};

/** 状态对应的 Badge variant */
export const TEMPLATE_STATUS_VARIANT: Record<
  TemplateStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  testing: 'outline',
  approved: 'default',
  disabled: 'destructive'
};

// ============================================================================
// Research → Production Promote Contract（预留，本轮不实现完整 UI）
// ============================================================================

/** Promote 参数：将 Research 模板经人工审核后加入 Production 库 */
export interface PromoteResearchTemplateParams {
  /** Research 模板 ID */
  researchTemplateId: string;
  /** Research 模板来源路径 */
  researchDraftPath: string;
  /** Production 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 模板类型 */
  templateType: TemplateType;
  /** 画幅 */
  aspectRatio: AspectRatio;
  /** 操作人 */
  promotedBy: string;
  /** 是否直接进入 testing（否则 draft） */
  enterTesting?: boolean;
}

/** Promote 结果 */
export interface PromoteResearchTemplateResult {
  ok: boolean;
  templateId?: string;
  productionDraftPath?: string;
  frozenFingerprint?: string;
  error?: string;
}

/** 模板库完整性检查结果（供 Environment Doctor / Agent Debug） */
export interface TemplateLibraryInspection {
  /** Production 根目录 */
  root: string;
  /** registry.json 路径 */
  registryPath: string;
  /** 根目录是否存在 */
  exists: boolean;
  /** 根目录是否可写 */
  writable: boolean;
  /** registry.json 是否存在 */
  registryExists: boolean;
  /** registry 是否有效（false 时 error 有值） */
  registryValid: boolean;
  /** 错误信息（如 REGISTRY_INVALID） */
  error?: string;
  /** 模板总数 */
  templateCount: number;
  /** 各状态数量 */
  approvedCount: number;
  testingCount: number;
  draftCount: number;
  disabledCount: number;
  /** Research 库路径（仅作参考，不读取） */
  researchRoot: string;
}
