/**
 * Template Repository —— 正式模板库（Production Template Library）数据访问层
 *
 * 所有模板路径统一通过 resolveSystemAsset("jianyingTemplateRoot") 解析，
 * 指向 Production Template Library（D:\知衡智企数据库\系统资产\剪映模板库）。
 *
 * 与 Research Template Library 物理隔离：
 * - Production Root = resolveSystemAsset("jianyingTemplateRoot") —— 正式模板，Agent 可用
 * - Research Root   = RESEARCH_TEMPLATE_ROOT —— 第三方研究库，禁止正式读取
 *
 * 提供：
 *   loadTemplateRegistry()   — 读取 Production registry.json
 *   listTemplates()          — 列出全部模板
 *   listApprovedTemplates()  — 列出 Agent 可用模板
 *   listTestingTemplates()   — 列出测试中模板
 *   getTemplate()            — 按 ID 查询
 *   inspectTemplateLibrary() — 模板库完整性检查
 *   promoteResearchTemplate()— Research → Production Promote（contract + validation，不实际批量导入）
 *
 * 安全规则：
 * - Production registry 损坏时明确报 REGISTRY_INVALID，绝不 fallback 到 Research 库。
 * - 不自动创建目录、不下载模板、不导入第三方研究库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveSystemAsset } from '@/lib/system-assets';
import { RESEARCH_TEMPLATE_ROOT } from '@/lib/system-assets/defaults';
import type {
  JianyingTemplate,
  TemplateLibraryInspection,
  TemplateRegistryFile,
  TemplateStatus,
  PromoteResearchTemplateParams,
  PromoteResearchTemplateResult
} from './types';

const REGISTRY_FILENAME = 'registry.json';

/** Registry 错误码 */
export const TEMPLATE_REGISTRY_ERROR = {
  REGISTRY_INVALID: 'REGISTRY_INVALID',
  REGISTRY_MISSING: 'REGISTRY_MISSING',
  ROOT_MISSING: 'ROOT_MISSING'
} as const;

/** 构建 searchText（由 name/description/useCases/tags/templateType 组成） */
function buildSearchText(t: JianyingTemplate): string {
  const parts = [t.name, t.description, t.templateType, ...(t.tags || []), ...(t.useCases || [])];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/** 规范化单条模板（补全默认字段、构建 searchText、过滤无效 entry，兼容旧 entry） */
function normalizeTemplate(raw: Record<string, unknown>, index: number): JianyingTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const templateId = typeof raw.templateId === 'string' ? raw.templateId : `template-${index}`;
  const name = typeof raw.name === 'string' ? raw.name : `未命名模板 ${index + 1}`;
  const status = (['draft', 'testing', 'approved', 'disabled'] as const).includes(
    raw.status as TemplateStatus
  )
    ? (raw.status as TemplateStatus)
    : 'draft';
  const templateType =
    typeof raw.templateType === 'string'
      ? (raw.templateType as JianyingTemplate['templateType'])
      : 'full_video';
  const aspectRatio =
    typeof raw.aspectRatio === 'string'
      ? (raw.aspectRatio as JianyingTemplate['aspectRatio'])
      : '9:16';
  const draftPath = typeof raw.draftPath === 'string' ? raw.draftPath : '';
  if (!draftPath) return null; // 无草稿路径的 entry 视为无效

  const now = new Date().toISOString();
  const t: JianyingTemplate = {
    templateId,
    name,
    description: typeof raw.description === 'string' ? raw.description : '',
    status,
    templateType,
    aspectRatio,
    draftPath,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    useCases: Array.isArray(raw.useCases) ? (raw.useCases as string[]) : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  };

  // 可选字段（兼容旧 entry，缺失则不设置）
  if (typeof raw.nativeDurationSec === 'number') t.nativeDurationSec = raw.nativeDurationSec;
  if (typeof raw.recommendedDurationMinSec === 'number')
    t.recommendedDurationMinSec = raw.recommendedDurationMinSec;
  if (typeof raw.recommendedDurationMaxSec === 'number')
    t.recommendedDurationMaxSec = raw.recommendedDurationMaxSec;
  if (typeof raw.previewImagePath === 'string') t.previewImagePath = raw.previewImagePath;
  if (typeof raw.jianyingVersion === 'string') t.jianyingVersion = raw.jianyingVersion;
  if (typeof raw.assetIntegrity === 'string')
    t.assetIntegrity = raw.assetIntegrity as JianyingTemplate['assetIntegrity'];
  if (typeof raw.replacementReadiness === 'string')
    t.replacementReadiness = raw.replacementReadiness as JianyingTemplate['replacementReadiness'];
  if (typeof raw.videoSlotCount === 'number') t.videoSlotCount = raw.videoSlotCount;
  if (typeof raw.imageSlotCount === 'number') t.imageSlotCount = raw.imageSlotCount;
  if (typeof raw.textSlotCount === 'number') t.textSlotCount = raw.textSlotCount;
  if (typeof raw.sourceType === 'string')
    t.sourceType = raw.sourceType as JianyingTemplate['sourceType'];
  if (typeof raw.sourceTemplateId === 'string') t.sourceTemplateId = raw.sourceTemplateId;
  // 新增字段（Production 隔离 / approved freeze）
  if (typeof raw.sourceDraftPath === 'string') t.sourceDraftPath = raw.sourceDraftPath;
  if (typeof raw.productionDraftPath === 'string') t.productionDraftPath = raw.productionDraftPath;
  if (typeof raw.frozenFingerprint === 'string') t.frozenFingerprint = raw.frozenFingerprint;
  if (typeof raw.approvedAt === 'string') t.approvedAt = raw.approvedAt;
  if (typeof raw.archivedAt === 'string') t.archivedAt = raw.archivedAt;

  // enabledForAgent：approved 默认 true，其他状态默认 false；显式设置优先
  if (typeof raw.enabledForAgent === 'boolean') {
    t.enabledForAgent = raw.enabledForAgent;
  } else {
    t.enabledForAgent = status === 'approved';
  }

  t.searchText = buildSearchText(t);
  return t;
}

/**
 * 读取 Production Registry 文件。
 * - 根目录不存在 / registry.json 不存在 → 返回空库（registryExists=false）
 * - registry.json 存在但 JSON 解析失败或结构无效 → 明确 error=REGISTRY_INVALID，绝不 fallback 到 Research
 */
export async function loadTemplateRegistry(): Promise<{
  rootPath: string;
  registryPath: string;
  templates: JianyingTemplate[];
  registryExists: boolean;
  registryValid: boolean;
  error?: string;
}> {
  const resolved = await resolveSystemAsset('jianyingTemplateRoot');
  const rootPath = resolved.path;
  const registryPath = path.join(rootPath, REGISTRY_FILENAME);

  if (!resolved.exists) {
    return {
      rootPath,
      registryPath,
      templates: [],
      registryExists: false,
      registryValid: false,
      error: TEMPLATE_REGISTRY_ERROR.ROOT_MISSING
    };
  }

  if (!fs.existsSync(registryPath)) {
    return { rootPath, registryPath, templates: [], registryExists: false, registryValid: true };
  }

  try {
    const content = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return {
        rootPath,
        registryPath,
        templates: [],
        registryExists: true,
        registryValid: false,
        error: TEMPLATE_REGISTRY_ERROR.REGISTRY_INVALID
      };
    }
    const rawList: Record<string, unknown>[] = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : Array.isArray((parsed as TemplateRegistryFile).templates)
        ? ((parsed as TemplateRegistryFile).templates as unknown as Record<string, unknown>[])
        : [];
    const templates: JianyingTemplate[] = [];
    rawList.forEach((raw, i) => {
      const t = normalizeTemplate(raw, i);
      if (t) templates.push(t);
    });
    return { rootPath, registryPath, templates, registryExists: true, registryValid: true };
  } catch {
    // JSON 解析失败：明确报错，绝不 fallback 到 Research 库
    return {
      rootPath,
      registryPath,
      templates: [],
      registryExists: true,
      registryValid: false,
      error: TEMPLATE_REGISTRY_ERROR.REGISTRY_INVALID
    };
  }
}

/** 列出全部 Production 模板 */
export async function listTemplates(): Promise<JianyingTemplate[]> {
  const { templates } = await loadTemplateRegistry();
  return templates;
}

/** 列出 Agent 可用模板（approved 且 enabledForAgent） */
export async function listApprovedTemplates(): Promise<JianyingTemplate[]> {
  const templates = await listTemplates();
  return templates.filter((t) => t.status === 'approved' && t.enabledForAgent !== false);
}

/** 列出测试中模板 */
export async function listTestingTemplates(): Promise<JianyingTemplate[]> {
  const templates = await listTemplates();
  return templates.filter((t) => t.status === 'testing');
}

/** 按状态过滤 */
export async function listTemplatesByStatus(status: TemplateStatus): Promise<JianyingTemplate[]> {
  const templates = await listTemplates();
  return templates.filter((t) => t.status === status);
}

/** 按 ID 查询单个模板 */
export async function getTemplate(templateId: string): Promise<JianyingTemplate | null> {
  const templates = await listTemplates();
  return templates.find((t) => t.templateId === templateId) || null;
}

/** 简单关键词搜索（基于 searchText，不做 embedding） */
export async function searchTemplates(keyword: string): Promise<JianyingTemplate[]> {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return listTemplates();
  const templates = await listTemplates();
  return templates.filter((t) => (t.searchText || '').includes(kw));
}

/**
 * 模板库完整性检查（供 Environment Doctor / Agent Debug）。
 * 只读 Production Root，不读取 Research 库内容。
 */
export async function inspectTemplateLibrary(): Promise<TemplateLibraryInspection> {
  const { rootPath, registryPath, templates, registryExists, registryValid, error } =
    await loadTemplateRegistry();

  let writable = false;
  try {
    if (fs.existsSync(rootPath)) {
      fs.accessSync(rootPath, fs.constants.W_OK);
      writable = true;
    }
  } catch {
    writable = false;
  }

  return {
    root: rootPath,
    registryPath,
    exists: fs.existsSync(rootPath),
    writable,
    registryExists,
    registryValid,
    error,
    templateCount: templates.length,
    approvedCount: templates.filter((t) => t.status === 'approved').length,
    testingCount: templates.filter((t) => t.status === 'testing').length,
    draftCount: templates.filter((t) => t.status === 'draft').length,
    disabledCount: templates.filter((t) => t.status === 'disabled').length,
    researchRoot: RESEARCH_TEMPLATE_ROOT
  };
}

/**
 * Research → Production Promote（contract + validation，本轮不实际批量导入）。
 *
 * 流程：Research Template → 人工审核 → 复制/冻结草稿 → 写 Production Registry → testing → approved
 *
 * approved 阶段必须满足：
 * 1. 草稿已人工验收
 * 2. 草稿快照已复制进 Production Template Library（drafts/<type>/<templateId>/）
 * 3. 记录 sourceDraftPath + productionDraftPath
 * 4. 记录 frozenFingerprint（SHA256）
 * 5. 记录剪映版本 + approvedAt
 *
 * 本函数仅做参数校验和路径规划，不执行实际文件复制/Registry 写入。
 */
export async function promoteResearchTemplate(
  params: PromoteResearchTemplateParams
): Promise<PromoteResearchTemplateResult> {
  // 参数校验
  if (!params.researchTemplateId || !params.researchDraftPath || !params.name) {
    return { ok: false, error: 'MISSING_REQUIRED_PARAMS' };
  }
  if (!fs.existsSync(params.researchDraftPath)) {
    return { ok: false, error: 'RESEARCH_DRAFT_NOT_FOUND' };
  }

  const resolved = await resolveSystemAsset('jianyingTemplateRoot');
  const templateId = `promoted-${params.researchTemplateId}-${Date.now().toString(36)}`;
  const productionDraftPath = path.join(
    resolved.path,
    'drafts',
    params.templateType || 'full_video',
    templateId
  );

  return {
    ok: true,
    templateId,
    productionDraftPath,
    // frozenFingerprint 需在实际复制草稿后计算，此处预留
    frozenFingerprint: undefined,
    error: undefined
  };
}
