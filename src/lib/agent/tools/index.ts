import { z } from 'zod';
import { toolRegistry, type AgentTool } from '../tool-registry';
import {
  listVideoEditingSkills,
  getVideoEditingSkill,
  getSkillByContentType,
  type VideoEditingSkill
} from '../skill-loader';
import { loadCompanyContext } from '../company-context';
import type { CompanyContext } from '../types';
import { searchVideoClips, loadVideoAssetIndex, type VideoClipResult } from '../video-asset-index';
import {
  createDraftTaskFromVideoPlan,
  executeAutomationVideoDraftTask,
  getTaskAgentPlan
} from '@/lib/workspaces/automation-editing';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { startMoneyPrinterTaskWorker } from '@/lib/workspaces/moneyprinter-engine';
import { listTemplateAssets } from '@/lib/templates/template-asset-store';
import { runTemplateParse } from '@/lib/workspaces/template-parse';
import { runTemplateRoute } from '@/lib/workspaces/template-route';
import { findDraftDir } from '@/lib/workspaces/draft-locator';
import fs from 'node:fs';
import path from 'node:path';
import { chat } from '@/lib/ai';

/** 工具默认工作空间：无显式上下文时的兜底（与自动化剪辑空间保持一致）。 */
const DEFAULT_TEMPLATE_WORKSPACE = 'enterprise-media';

/**
 * 根据模板资产中的文字槽内容，让 LLM 生成中文业务名（3~8 字）。
 * 失败时返回 null（保持原草稿名），不阻断解析成功。
 */
async function autoNameTemplate(assetPath: string): Promise<string | null> {
  try {
    const asset = JSON.parse(fs.readFileSync(assetPath, 'utf-8')) as {
      templateName?: string;
      textSlots?: Array<{ text?: string; originalText?: string }>;
    };
    const samples = (asset.textSlots ?? [])
      .map((s) => s.text ?? s.originalText ?? '')
      .filter((t) => t && t.trim().length >= 2)
      .slice(0, 10);
    if (samples.length === 0) return null;

    const prompt =
      '你是知衡智企模板命名助手。下面是从一个企业短视频模板中提取的文案片段，' +
      '请给这个模板起一个简洁的中文业务名（3~8个字，风格类似「饮品贴牌避坑」「工厂实力展示」「老板IP观点」），' +
      '直接输出名字本身，不要引号、不要标点、不要解释、不要换行。\n文案片段：\n' +
      samples.map((t, i) => `${i + 1}. ${t}`).join('\n');

    const name = (await chat([{ role: 'user', content: prompt }])).trim();
    if (!name || name.length < 2 || name.length > 12) return null;
    const clean = name.replace(/[「」""''。，、.!！?？\n]/g, '').trim();
    if (!clean) return null;

    // 写回 template-asset.json，让模板名持久化
    asset.templateName = clean;
    fs.writeFileSync(assetPath, JSON.stringify(asset, null, 2), 'utf-8');
    return clean;
  } catch {
    return null;
  }
}

/**
 * 把模板文件夹重命名为中文业务名（蒸馏入库规则：模板文件夹名=业务名）。
 * 同步更新 template-asset.json 内的 templateId。
 * 同名冲突时追加短后缀，避免覆盖已有模板。
 */
async function renameTemplateFolder(
  assetPath: string,
  newName: string
): Promise<{ ok: boolean; templateId?: string; assetPath?: string; error?: string }> {
  try {
    const dir = path.dirname(assetPath); // .../企业模板/<oldId>
    const parent = path.dirname(dir); // .../企业模板
    const oldId = path.basename(dir);
    const clean = newName
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean || clean === oldId) {
      return { ok: true, templateId: oldId, assetPath };
    }
    let target = path.join(parent, clean);
    if (fs.existsSync(target)) {
      target = path.join(parent, `${clean}-${Date.now().toString(36).slice(-3)}`);
    }
    fs.renameSync(dir, target);
    const newAssetPath = path.join(target, 'template-asset.json');
    if (fs.existsSync(newAssetPath)) {
      const asset = JSON.parse(fs.readFileSync(newAssetPath, 'utf-8')) as Record<string, unknown>;
      asset.templateId = path.basename(target);
      if (!asset.templateName) asset.templateName = clean;
      fs.writeFileSync(newAssetPath, JSON.stringify(asset, null, 2), 'utf-8');
    }
    return { ok: true, templateId: path.basename(target), assetPath: newAssetPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '重命名模板文件夹失败' };
  }
}

// ============================================================
// Tool 8: list_templates
// 列出企业模板库中的全部模板（供 Agent 选择/蒸馏后确认）
// ============================================================

const listTemplatesInput = z.object({
  workspaceSlug: z
    .string()
    .optional()
    .describe('工作空间 slug，默认 enterprise-media（自动化剪辑空间）')
});

const listTemplatesTool: AgentTool<
  z.infer<typeof listTemplatesInput>,
  {
    ok: boolean;
    count: number;
    templates: Array<{
      templateId: string;
      templateName: string;
      status: string;
      aspectRatio?: string;
      durationSec?: number;
      textSlotCount?: number;
      mediaSlotCount?: number;
    }>;
    error?: string;
  }
> = {
  name: 'list_templates',
  displayName: '列出企业模板库',
  description:
    '列出企业模板库（用户数据存储中配置的模板库路径）中所有已蒸馏入库的剪映模板资产。' +
    '当用户询问"有哪些模板"、"模板库有什么"、"用哪个模板"时调用此工具。',
  inputSchema: listTemplatesInput,
  riskLevel: 'low',
  requiredPermission: undefined,
  execute: async (input) => {
    const slug = input.workspaceSlug || DEFAULT_TEMPLATE_WORKSPACE;
    const workspace = getWorkspaceBySlug(slug);
    if (!workspace) return { ok: false, count: 0, templates: [], error: `工作空间不存在: ${slug}` };
    const loaded = await listTemplateAssets(workspace.id);
    const templates = loaded
      .filter((l) => l.ok && l.asset)
      .map((l) => {
        const a = l.asset!;
        return {
          templateId: a.templateId,
          templateName: a.templateName || a.templateId,
          status: a.status ?? 'unknown',
          aspectRatio: a.templateInfo?.canvas
            ? `${a.templateInfo.canvas.width}x${a.templateInfo.canvas.height}`
            : undefined,
          durationSec: a.templateInfo?.durationSec,
          textSlotCount: a.textSlots?.length ?? 0,
          mediaSlotCount: a.mediaSlots?.length ?? 0
        };
      });
    return { ok: true, count: templates.length, templates };
  }
};

// ============================================================
// Tool 9: parse_template
// 把人工剪映草稿蒸馏为企业模板资产（template-asset.json）
// ============================================================

const parseTemplateInput = z.object({
  draftName: z
    .string()
    .optional()
    .describe('剪映草稿名称（如「9月5日 (1)」「8月28日」），或剪映草稿完整目录路径（D:\\...）。'),
  templateName: z.string().optional().describe('可选：模板中文名（如 饮品贴牌避坑），缺省用草稿名'),
  workspaceSlug: z
    .string()
    .optional()
    .describe('工作空间 slug，默认 enterprise-media（自动化剪辑空间）')
});

const parseTemplateTool: AgentTool<
  z.infer<typeof parseTemplateInput>,
  {
    ok: boolean;
    templateId?: string;
    templateName?: string;
    assetPath?: string;
    textSlotCount?: number;
    mediaSlotCount?: number;
    message?: string;
    error?: string;
  }
> = {
  name: 'parse_template',
  displayName: '解析剪映草稿为模板',
  description:
    '把用户人工剪辑完成的剪映草稿解析（蒸馏）为企业模板资产 template-asset.json，写入企业模板库（用户数据存储配置的模板库路径）。' +
    '当用户说"分析/解析/提取/导入/识别某个剪映草稿"、"把这个草稿变成模板"、"蒸馏草稿"时调用此工具。' +
    'draftName 可以是草稿名（会在剪映草稿根和模板库目录中按名称查找）或完整路径。',
  inputSchema: parseTemplateInput,
  riskLevel: 'low',
  requiredPermission: 'video:generate',
  execute: async (input) => {
    const slug = input.workspaceSlug || DEFAULT_TEMPLATE_WORKSPACE;
    if (!input.draftName) {
      return { ok: false, error: '请提供要解析的剪映草稿名称或路径。' };
    }
    // 1) 定位草稿（支持名称/路径；多候选不猜测）
    const located = await findDraftDir(input.draftName, slug);
    if (!located.ok) {
      return { ok: false, error: located.error };
    }
    // 2) 解析为模板资产
    const tpl = await runTemplateParse({
      workspaceSlug: slug,
      draftDir: located.draftDir,
      templateName: input.templateName || located.draftName
    });
    if (!tpl.ok || !tpl.templateId) {
      return { ok: false, error: tpl.error ?? '模板解析失败' };
    }
    // 3) 自动命名：用户没指定模板名时，根据草稿文字内容语义生成中文业务名
    //    （蒸馏技能规则：新模板入库必须有一个可读的业务名，不能只是草稿文件名）
    let templateName = tpl.templateName ?? located.draftName;
    let templateId = tpl.templateId!;
    let assetPath = tpl.assetPath;
    if (!input.templateName && tpl.assetPath) {
      const generated = await autoNameTemplate(tpl.assetPath);
      if (generated) {
        templateName = generated;
        // 蒸馏入库规则：文件夹名=中文业务名，前端模板库显示即业务名
        const renamed = await renameTemplateFolder(tpl.assetPath, generated);
        if (renamed.ok && renamed.templateId) {
          templateId = renamed.templateId;
          if (renamed.assetPath) assetPath = renamed.assetPath;
        }
      }
    }
    return {
      ok: true,
      templateId,
      templateName,
      assetPath,
      textSlotCount: tpl.textSlotCount,
      mediaSlotCount: tpl.mediaSlotCount,
      message: `已把剪映草稿「${tpl.templateName}」解析为模板「${templateName}」：${tpl.textSlotCount ?? 0} 个文字槽、${tpl.mediaSlotCount ?? 0} 个素材槽，已写入企业模板库。`
    };
  }
};

// ============================================================
// Tool 10: run_template_route
// 按指定企业模板自动剪辑一条视频（模板优先路线，含TTS/字幕/素材替换）
// ============================================================

const runTemplateRouteInput = z.object({
  templateId: z
    .string()
    .describe('要使用的企业模板 ID 或模板名（如 0828-yinpin-tiepai-bikeng / 饮品贴牌避坑）'),
  businessContext: z
    .string()
    .describe('本次视频需求/业务内容：客户、产品、口播方向、平台、画幅等用户要求'),
  workspaceSlug: z
    .string()
    .optional()
    .describe('工作空间 slug，默认 enterprise-media（自动化剪辑空间）')
});

const runTemplateRouteTool: AgentTool<
  z.infer<typeof runTemplateRouteInput>,
  {
    ok: boolean;
    route?: string;
    templateId?: string;
    draftName?: string;
    draftPath?: string;
    textFillCount?: number;
    textFillTotal?: number;
    mediaPlanCount?: number;
    voiceOk?: boolean;
    message?: string;
    error?: string;
  }
> = {
  name: 'run_template_route',
  displayName: '按模板自动剪辑视频',
  description:
    '按指定企业模板自动剪辑一条视频：读取模板资产 → 生成/适配文案（严格按槽位字数约束）→ 豆包TTS配音+字幕 → 企业素材库检索填充素材槽 → 复制人工母版 → 替换文字/素材 → 输出剪映草稿。' +
    '当用户说"按XX模板剪一条XX视频"、"用XX模板做一条视频"时调用此工具。' +
    '执行前如有必要先调用 list_templates 确认模板 ID。',
  inputSchema: runTemplateRouteInput,
  riskLevel: 'low',
  requiredPermission: 'video:generate',
  execute: async (input) => {
    const slug = input.workspaceSlug || DEFAULT_TEMPLATE_WORKSPACE;
    // 模板名 → ID：支持直接 ID / 模板名（含/等于匹配）
    let templateId = input.templateId;
    const workspace = getWorkspaceBySlug(slug);
    if (workspace) {
      const loaded = await listTemplateAssets(workspace.id);
      const hit = loaded.find(
        (l) =>
          l.ok &&
          l.asset &&
          (l.asset.templateId === input.templateId ||
            l.asset.templateName === input.templateId ||
            (l.asset.templateName ?? '').includes(input.templateId) ||
            input.templateId.includes(l.asset.templateId))
      );
      if (hit?.ok && hit.asset) templateId = hit.asset.templateId;
    }
    const result = await runTemplateRoute({
      workspaceSlug: slug,
      templateId,
      businessContext: input.businessContext
    });
    if (!result.ok) {
      return { ok: false, route: 'template', templateId, error: result.error ?? '模板剪辑失败' };
    }
    return {
      ok: true,
      route: result.route,
      templateId: result.templateId,
      draftName: result.draftName,
      draftPath: result.draftPath,
      textFillCount: result.textFillCount,
      textFillTotal: result.textFillTotal,
      mediaPlanCount: result.mediaPlanCount,
      voiceOk: result.voice?.ok ?? false,
      message: `模板剪辑完成：${result.textFillCount}/${result.textFillTotal} 文字槽已填充、${result.mediaPlanCount} 个素材槽已替换，配音${result.voice?.ok ? '成功' : '未生成'}，草稿已输出：${result.draftName}`
    };
  }
};

// ============================================================
// Tool 1: list_video_skills
// 列出所有可用的视频剪辑 Skill
// ============================================================

const listVideoSkillsInput = z.object({});

const listVideoSkillsTool: AgentTool<
  z.infer<typeof listVideoSkillsInput>,
  Array<{
    id: string;
    name: string;
    description: string;
    contentType: string;
    category: string;
    status: string;
    version: string;
  }>
> = {
  name: 'list_video_skills',
  displayName: '获取视频剪辑风格列表',
  description:
    '列出当前系统中所有可用的视频剪辑 Skill（风格模板）。当用户询问"有哪些风格"、"有什么剪辑模板"、"支持什么类型的视频"等问题时调用此工具。',
  inputSchema: listVideoSkillsInput,
  riskLevel: 'low',
  requiredPermission: undefined,
  execute: async () => {
    const skills = await listVideoEditingSkills();
    return skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      contentType: s.content.contentType,
      category: s.category,
      status: s.status,
      version: s.version
    }));
  }
};

// ============================================================
// Tool 2: get_video_skill
// 获取单个视频剪辑 Skill 的详细规则
// ============================================================

const getVideoSkillInput = z.object({
  skillId: z.string().optional().describe('Skill 的唯一 ID，如 executive-ip'),
  name: z.string().optional().describe('Skill 的名称，如 老板IP观点型'),
  contentType: z.string().optional().describe('内容类型，如 知识科普、老板IP 等')
});

const getVideoSkillTool: AgentTool<z.infer<typeof getVideoSkillInput>, VideoEditingSkill | null> = {
  name: 'get_video_skill',
  displayName: '读取视频剪辑风格详情',
  description:
    '获取某个视频剪辑 Skill 的详细规则，包括脚本结构、镜头规则、配音风格、字幕样式、BGM 规则等。当用户询问某个具体风格的规则、要求、怎么剪时调用此工具。可通过 skillId、name 或 contentType 任一参数查询。',
  inputSchema: getVideoSkillInput,
  riskLevel: 'low',
  requiredPermission: undefined,
  execute: async (input) => {
    if (input.skillId) {
      return getVideoEditingSkill(input.skillId);
    }
    if (input.contentType) {
      return getSkillByContentType(input.contentType);
    }
    if (input.name) {
      const skills = await listVideoEditingSkills();
      return skills.find((s) => s.name.includes(input.name!)) ?? null;
    }
    return null;
  }
};

// ============================================================
// Tool 3: get_company_context_summary
// 获取企业定位上下文摘要
// ============================================================

const getCompanyContextSummaryInput = z.object({});

type CompanyContextSummary = {
  available: boolean;
  company?: {
    name?: string;
    industry?: string;
    businessScope?: string;
  };
  brand?: {
    positioning?: string;
    tone?: string;
  };
  audience?: {
    primary?: string;
  };
  guardrails?: {
    forbiddenFacts?: string[];
  };
  contentDirections?: string[];
};

const getCompanyContextSummaryTool: AgentTool<
  z.infer<typeof getCompanyContextSummaryInput>,
  CompanyContextSummary
> = {
  name: 'get_company_context_summary',
  displayName: '读取企业定位信息',
  description:
    '获取当前企业的定位信息摘要，包括企业名称、行业、品牌定位、目标受众、内容方向和事实边界（Guardrails）。当用户询问企业信息、品牌定位、不能说什么、内容方向等问题时调用此工具。',
  inputSchema: getCompanyContextSummaryInput,
  riskLevel: 'low',
  requiredPermission: undefined,
  execute: async (): Promise<CompanyContextSummary> => {
    const ctx = await loadCompanyContext();
    if (!ctx) {
      return { available: false };
    }
    return {
      available: true,
      company: ctx.company
        ? {
            name: ctx.company.name,
            industry: ctx.company.industry,
            businessScope: ctx.company.businessScope
          }
        : undefined,
      brand: ctx.brand
        ? {
            positioning: ctx.brand.positioning,
            tone: ctx.brand.tone
          }
        : undefined,
      audience: ctx.audience
        ? {
            primary: ctx.audience.primary
          }
        : undefined,
      guardrails: ctx.guardrails
        ? {
            forbiddenFacts: ctx.guardrails.forbiddenFacts
          }
        : undefined,
      contentDirections: ctx.contentStrategy?.directions
    };
  }
};

// ============================================================
// Tool 4: search_video_assets
// 搜索视频素材片段（秒级粒度）
// ============================================================

const searchVideoAssetsInput = z.object({
  query: z
    .string()
    .optional()
    .describe('搜索关键词或查询文本，如"无菌灌装设备运行"、"工厂生产车间"'),
  contentType: z
    .string()
    .optional()
    .describe('内容类型/风格，如 老板IP、知识科普、工厂实力展示 等'),
  usageRoles: z
    .array(z.string())
    .optional()
    .describe('适用角色过滤，如 ["Hook","正文B-roll","能力证明"]'),
  topicTags: z.array(z.string()).optional().describe('主题标签过滤，如 ["品控","研发","生产线"]'),
  semanticMatches: z.array(z.string()).optional().describe('语义匹配关键词（高级过滤）'),
  orientation: z
    .enum(['landscape', 'portrait'])
    .optional()
    .describe('横竖屏过滤：landscape横屏 / portrait竖屏'),
  preferredOnly: z.boolean().optional().describe('是否仅返回优选素材（preferred=true）'),
  excludeDuplicateGroups: z.boolean().optional().describe('同一重复组是否只返回一个，默认 true'),
  minClipDuration: z.number().optional().describe('最小片段时长（秒）'),
  maxClipDuration: z.number().optional().describe('最大片段时长（秒）'),
  limit: z.number().optional().describe('返回结果数量上限，默认 10')
});

const searchVideoAssetsTool: AgentTool<
  z.infer<typeof searchVideoAssetsInput>,
  { total: number; results: VideoClipResult[] }
> = {
  name: 'search_video_assets',
  displayName: '查找视频素材',
  description:
    '在企业视频素材库中搜索符合条件的视频片段。搜索的最小单位是秒级片段（timelineSegments + recommendedCuts），不是整个视频文件。' +
    '返回每个片段的推荐起止时间、内容描述、适用场景、画质等信息。' +
    '当用户需要找素材、找镜头、找画面、问"有什么素材可以配"等问题时调用此工具。',
  inputSchema: searchVideoAssetsInput,
  riskLevel: 'low',
  requiredPermission: undefined,
  execute: async (input) => {
    const results = await searchVideoClips({
      query: input.query,
      contentType: input.contentType,
      usageRoles: input.usageRoles,
      topicTags: input.topicTags,
      semanticMatches: input.semanticMatches,
      orientation: input.orientation,
      preferredOnly: input.preferredOnly,
      excludeDuplicateGroups: input.excludeDuplicateGroups,
      minClipDuration: input.minClipDuration,
      maxClipDuration: input.maxClipDuration,
      limit: input.limit ?? 10
    });
    return {
      total: results.length,
      results
    };
  }
};

// ============================================================
// Tool 5: create_video_plan
// Generate an editing plan only. It does not render video.
// ============================================================

const createVideoPlanInput = z.object({
  userRequest: z.string().describe('用户的视频创作需求或主题'),
  enterprisePositioning: z.string().optional().describe('可选的企业定位补充'),
  skillId: z.string().optional().describe('视频剪辑 Skill ID'),
  contentType: z.string().optional().describe('视频内容类型，如 知识科普型、老板IP观点型'),
  script: z.string().optional().describe('已有脚本文案；为空时按需求生成规划段落'),
  platform: z.string().optional().describe('发布平台，默认 抖音'),
  targetDuration: z.number().optional().describe('目标视频时长，单位秒，默认 30'),
  videoRatio: z.string().optional().describe('视频比例，默认 9:16')
});

export type VideoPlanSegmentMatchLevel = 'high_match' | 'medium_match' | 'low_match' | 'no_match';

export type VideoPlanTimelineItem = {
  order: number;
  timelineStart: number;
  timelineEnd: number;
  scriptText: string;
  purpose: string;
  asset: {
    assetId: string | null;
    fileName: string | null;
    relativePath: string | null;
    sourceStart: number | null;
    sourceEnd: number | null;
  };
  usageRole: string;
  matchLevel: VideoPlanSegmentMatchLevel;
  matchScore: number;
  matchReasons: string[];
  cropSafety: string | null;
  transitionOut: string;
};

export type CreateVideoPlanOutput = {
  title: string;
  topic: string;
  contentType: string;
  platform: string;
  targetDuration: number;
  videoRatio: string;
  skill: {
    id: string | null;
    name: string | null;
    contentType: string | null;
  };
  script: string;
  scriptSegments: string[];
  timeline: VideoPlanTimelineItem[];
  coverage: {
    totalSegments: number;
    highMatch: number;
    mediumMatch: number;
    lowMatch: number;
    noMatch: number;
    highQualityCoverageRate: number;
    status: 'confirmed' | 'warning' | 'insufficient';
  };
  warnings: string[];
  voice: {
    strategy: string;
    style: string | null;
  };
  subtitle: {
    enabled: boolean;
    style: string | null;
  };
  bgm: {
    strategy: string;
    style: string | null;
  };
};

const createVideoPlanTool: AgentTool<
  z.infer<typeof createVideoPlanInput>,
  CreateVideoPlanOutput
> = {
  name: 'create_video_plan',
  displayName: '生成视频剪辑方案',
  description:
    '根据用户需求、企业定位、视频 Skill、脚本和秒级素材搜索结果，生成低风险视频剪辑方案。只输出方案，不渲染视频、不调用 MoneyPrinterTurbo、不执行真实剪辑。',
  inputSchema: createVideoPlanInput,
  riskLevel: 'low',
  requiredPermission: undefined,
  execute: async (input) => {
    const companyContext = await loadCompanyContext();
    const skills = await listVideoEditingSkills();
    const skill = await resolveVideoPlanSkill(input, skills);
    const platform = input.platform || skill?.content.targetPlatform || '抖音';
    const targetDuration = input.targetDuration || inferDuration(skill) || 30;
    const videoRatio = input.videoRatio || '9:16';
    const scriptSegments = buildScriptSegments(input, companyContext, skill);
    const secondsPerSegment = Math.max(
      3,
      Math.round((targetDuration / scriptSegments.length) * 10) / 10
    );

    // 素材时长表（relativePath → 素材总时长秒）：用于把 source range 扩展到时长的容量上限。
    const assetDurations: Record<string, number> = {};
    try {
      const assets = await loadVideoAssetIndex();
      for (const asset of assets) {
        if (asset.relativePath && typeof asset.durationSeconds === 'number') {
          assetDurations[asset.relativePath] = asset.durationSeconds;
        }
      }
    } catch {
      // 索引不可用时按未知处理（不扩展超出 recommendedEnd 的范围）
    }

    const timeline: VideoPlanTimelineItem[] = [];
    const warnings: string[] = [];
    const usedAssetPaths = new Set<string>();

    for (let i = 0; i < scriptSegments.length; i++) {
      const scriptText = scriptSegments[i];
      const usageRole = inferUsageRole(i, scriptSegments.length);
      const query = buildAssetQuery(scriptText, input, companyContext, skill, usageRole);
      const results = await searchVideoClips({
        query,
        contentType: skill?.content.contentType || input.contentType,
        orientation: videoRatio.includes('9:16')
          ? 'portrait'
          : videoRatio.includes('16:9')
            ? 'landscape'
            : undefined,
        excludeDuplicateGroups: true,
        limit: 5,
        // 规划阶段仅依赖索引元数据（assetId / recommendedCuts / avoidCuts），不要求物理文件已挂载。
        requireFileExists: false
      });
      const best = results.find((result) => !usedAssetPaths.has(result.relativePath)) ?? results[0];

      const timelineStart = Math.round(i * secondsPerSegment * 10) / 10;
      const timelineEnd =
        i === scriptSegments.length - 1
          ? targetDuration
          : Math.round((i + 1) * secondsPerSegment * 10) / 10;
      // 该段时间预算（最后一段吸收取整余量，保证各段 slot 之和 === targetDuration）
      const slotDuration = Math.max(0.1, Math.round((timelineEnd - timelineStart) * 10) / 10);

      // 时间感知选片：若内容最优素材容量不足以覆盖该段时间预算，
      // 优先从结果中选一个容量足够的素材；仍不足则二次搜索更多候选，
      // 找可覆盖该时段的安全 source range（避免产出明显短于配音的片段）。
      let chosen = best;
      if (chosen?.relativePath) {
        const capacity = assetDurations[chosen.relativePath] ?? 0;
        if (capacity < slotDuration) {
          const timeCapable = results.find(
            (result) =>
              result.relativePath !== chosen!.relativePath &&
              !usedAssetPaths.has(result.relativePath) &&
              (assetDurations[result.relativePath] ?? 0) >= slotDuration
          );
          if (timeCapable) {
            chosen = timeCapable;
          } else {
            // 二次搜索：为这段时间预算继续找容量足够的素材
            const wider = await searchVideoClips({
              query,
              contentType: skill?.content.contentType || input.contentType,
              orientation: videoRatio.includes('9:16')
                ? 'portrait'
                : videoRatio.includes('16:9')
                  ? 'landscape'
                  : undefined,
              excludeDuplicateGroups: true,
              limit: 30,
              requireFileExists: false
            });
            const widerCapable = wider.find(
              (result) =>
                result.relativePath !== chosen!.relativePath &&
                !usedAssetPaths.has(result.relativePath) &&
                (assetDurations[result.relativePath] ?? 0) >= slotDuration
            );
            if (widerCapable) {
              chosen = widerCapable;
            } else {
              // 仍无够长素材：从全库找「未使用且容量足够」的素材兜底填充，
              // 优先分类/关键词粗匹配，其次取时长最长者（保证 sum(duration) 覆盖配音时长）。
              const allAssets = await loadVideoAssetIndex();
              const fillCandidates = allAssets.filter(
                (asset) =>
                  asset.relativePath &&
                  !usedAssetPaths.has(asset.relativePath) &&
                  typeof asset.durationSeconds === 'number' &&
                  asset.durationSeconds >= slotDuration
              );
              const keywords = query
                .split(/[\s,，、：:]+/)
                .map((word) => word.trim())
                .filter((word) => word.length >= 2);
              const scored = fillCandidates
                .map((asset) => {
                  const hay = `${asset.normalizedCategory || asset.sourceCategory || ''} ${asset.fileName || ''} ${asset.overallContent || ''}`;
                  const hits = keywords.filter((keyword) => hay.includes(keyword)).length;
                  return { asset, hits };
                })
                .sort(
                  (a, b) =>
                    b.hits - a.hits ||
                    (b.asset.durationSeconds ?? 0) - (a.asset.durationSeconds ?? 0)
                );
              const fill = scored[0]?.asset;
              if (fill && fill.relativePath) {
                const fillEnd = Math.min(
                  fill.durationSeconds ?? slotDuration,
                  Math.round(slotDuration * 10) / 10
                );
                chosen = {
                  ...(best ?? (results[0] as VideoClipResult)),
                  assetId: fill.id,
                  fileName: fill.fileName,
                  relativePath: fill.relativePath,
                  recommendedStart: 0,
                  recommendedEnd: fillEnd
                };
              }
            }
          }
        }
      }

      if (chosen?.relativePath) {
        usedAssetPaths.add(chosen.relativePath);
      }
      const matchLevel = getMatchLevel(chosen?.matchScore ?? 0);
      if (!chosen || matchLevel === 'no_match') {
        warnings.push(`第 ${i + 1} 段素材不足：${scriptText}`);
      }

      // source range 覆盖该段时间预算（素材总时长封顶；未知时长则不扩展）
      const srcStart = Math.max(0, chosen?.recommendedStart ?? 0);
      const knownDuration = chosen?.relativePath
        ? (assetDurations[chosen.relativePath] ?? null)
        : null;
      const srcEnd =
        knownDuration != null
          ? Math.min(knownDuration, Math.round((srcStart + slotDuration) * 10) / 10)
          : (chosen?.recommendedEnd ?? Math.round((srcStart + slotDuration) * 10) / 10);

      timeline.push({
        order: i + 1,
        timelineStart,
        timelineEnd,
        scriptText,
        purpose: inferSegmentPurpose(i, scriptSegments.length, skill),
        asset: {
          assetId: chosen?.assetId ?? null,
          fileName: chosen?.fileName ?? null,
          relativePath: chosen?.relativePath ?? null,
          sourceStart: Math.round(srcStart * 10) / 10,
          sourceEnd: srcEnd
        },
        usageRole,
        matchLevel,
        matchScore: chosen?.matchScore ?? 0,
        matchReasons: chosen?.matchReasons ?? [],
        cropSafety: chosen?.cropSafety ?? null,
        transitionOut: i === scriptSegments.length - 1 ? 'none' : 'cut'
      });
    }

    const coverage = buildCoverage(timeline);
    if (coverage.status === 'warning') {
      warnings.push('素材高质量覆盖率在 60%-80%，建议人工复核低匹配片段。');
    }
    if (coverage.status === 'insufficient') {
      warnings.push('素材高质量覆盖率低于 60%，建议修改脚本或补充素材。');
    }

    warnings.push(...buildGuardrailWarnings(companyContext));

    return {
      title: buildPlanTitle(input),
      topic: input.userRequest,
      contentType: skill?.content.contentType || input.contentType || '企业宣传短视频',
      platform,
      targetDuration,
      videoRatio,
      skill: {
        id: skill?.id ?? null,
        name: skill?.name ?? null,
        contentType: skill?.content.contentType ?? null
      },
      script: scriptSegments.join('\n'),
      scriptSegments,
      timeline,
      coverage,
      warnings: [...new Set(warnings)],
      voice: {
        strategy: '使用企业默认声音资产；正式生成时再进入语音合成链路。',
        style: skill?.voice.voiceStyle ?? companyContext?.voiceStyle?.tone ?? null
      },
      subtitle: {
        enabled: true,
        style: skill?.subtitle.subtitleStyle ?? '企业默认字幕'
      },
      bgm: {
        strategy: '使用企业默认背景音乐；音量在正式生成阶段控制。',
        style: skill?.bgm.bgmStyle ?? null
      }
    };
  }
};

// ============================================================
// Tool 6: save_video_plan_as_draft
// Persist an existing plan as a draft task. High risk, requires confirmation.
// ============================================================

const saveVideoPlanAsDraftInput = z.object({
  workspaceSlug: z.string().describe('工作空间 slug，例如 enterprise-media'),
  plan: z
    .object({
      title: z.string(),
      topic: z.string(),
      contentType: z.string(),
      platform: z.string(),
      targetDuration: z.number(),
      videoRatio: z.string(),
      skill: z.object({
        id: z.string().nullable(),
        name: z.string().nullable(),
        contentType: z.string().nullable()
      }),
      script: z.string(),
      scriptSegments: z.array(z.string()),
      timeline: z.array(z.any()),
      coverage: z.object({
        totalSegments: z.number(),
        highMatch: z.number(),
        mediumMatch: z.number(),
        lowMatch: z.number(),
        noMatch: z.number(),
        highQualityCoverageRate: z.number(),
        status: z.enum(['confirmed', 'warning', 'insufficient'])
      }),
      warnings: z.array(z.string()),
      voice: z.object({
        strategy: z.string(),
        style: z.string().nullable()
      }),
      subtitle: z.object({
        enabled: z.boolean(),
        style: z.string().nullable()
      }),
      bgm: z.object({
        strategy: z.string(),
        style: z.string().nullable()
      })
    })
    .describe('create_video_plan 返回的完整方案对象')
});

const saveVideoPlanAsDraftTool: AgentTool<
  z.infer<typeof saveVideoPlanAsDraftInput>,
  { taskId: string; editorUrl: string; status: string; agentPlanSaved: boolean }
> = {
  name: 'save_video_plan_as_draft',
  displayName: '保存剪辑方案为草稿任务',
  description:
    '将已经生成并由用户确认的视频剪辑方案保存为自动化剪辑草稿任务。只写入 draft，不渲染视频、不调用 MoneyPrinterTurbo、不调用 Voice Service。',
  inputSchema: saveVideoPlanAsDraftInput,
  riskLevel: 'high',
  requiredPermission: 'video:generate',
  execute: async (input, ctx) => {
    const workspace = getWorkspaceBySlug(input.workspaceSlug);
    if (!workspace) {
      throw new Error('工作空间不存在');
    }
    if (ctx.workspaceId && ctx.workspaceId !== workspace.id) {
      throw new Error('工作空间上下文不匹配');
    }
    const task = createDraftTaskFromVideoPlan(workspace.id, ctx.userId, input.plan);
    return {
      taskId: task.id,
      editorUrl: `/dashboard/workspaces/${input.workspaceSlug}?taskId=${task.id}`,
      status: task.status,
      agentPlanSaved: Boolean(getTaskAgentPlan(task))
    };
  }
};

// ============================================================
// Tool 7: execute_video_task
// Confirm and execute an existing draft task. High risk.
// ============================================================

const executeVideoTaskInput = z.object({
  workspaceSlug: z.string().describe('工作空间 slug，例如 enterprise-media'),
  taskId: z.string().describe('需要确认执行的草稿任务 ID')
});

const executeVideoTaskTool: AgentTool<
  z.infer<typeof executeVideoTaskInput>,
  { taskId: string; status: string; timelineClips: number; executionSnapshotSaved: boolean }
> = {
  name: 'execute_video_task',
  displayName: '开始生成视频任务',
  description:
    '在用户确认后执行一个已保存的自动化剪辑草稿任务。该工具会冻结当前草稿配置和 Agent 剪辑方案，按 sourceStart/sourceEnd 裁剪素材，并调用视频合成链路。此工具会产生真实任务执行，必须先获得用户确认。',
  inputSchema: executeVideoTaskInput,
  riskLevel: 'high',
  requiredPermission: 'video:generate',
  execute: async (input, ctx) => {
    const workspace = getWorkspaceBySlug(input.workspaceSlug);
    if (!workspace) {
      throw new Error('工作空间不存在');
    }
    if (ctx.workspaceId && ctx.workspaceId !== workspace.id) {
      throw new Error('工作空间上下文不匹配');
    }
    const { task, snapshot } = await executeAutomationVideoDraftTask(workspace.id, input.taskId);
    startMoneyPrinterTaskWorker(input.taskId);
    return {
      taskId: input.taskId,
      status: task?.status ?? 'generating',
      timelineClips: snapshot.editTimeline.length,
      executionSnapshotSaved: true
    };
  }
};

async function resolveVideoPlanSkill(
  input: z.infer<typeof createVideoPlanInput>,
  skills: VideoEditingSkill[]
): Promise<VideoEditingSkill | null> {
  if (input.skillId) {
    return getVideoEditingSkill(input.skillId);
  }
  if (input.contentType) {
    const direct = await getSkillByContentType(input.contentType);
    if (direct) return direct;
    return (
      skills.find((skill) =>
        [skill.name, skill.content.contentType, skill.description]
          .filter(Boolean)
          .some((text) => text.includes(input.contentType!))
      ) ?? null
    );
  }

  const request = input.userRequest;
  return (
    skills.find((skill) =>
      [skill.name, skill.content.contentType, skill.description]
        .filter(Boolean)
        .some((text) => request.includes(text) || text.includes(request))
    ) ??
    skills.find((skill) => skill.id === 'factory-showcase') ??
    skills[0] ??
    null
  );
}

function inferDuration(skill: VideoEditingSkill | null): number | null {
  const range = skill?.content.durationRange;
  if (!range) return null;
  const numbers = range.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return numbers[0];
  return Math.round((numbers[0] + numbers[1]) / 2);
}

function buildScriptSegments(
  input: z.infer<typeof createVideoPlanInput>,
  companyContext: CompanyContext | null,
  skill: VideoEditingSkill | null
): string[] {
  const existing = splitScript(input.script);
  if (existing.length > 0) return existing.slice(0, 18);

  const audience = companyContext?.audience?.primary || '目标客户';
  const tone = companyContext?.brand?.tone || companyContext?.voiceStyle?.tone || '专业可信';
  const topic = input.userRequest.replace(/[。！？!?\n\r]+$/g, '');
  const skillName = skill?.name || input.contentType || '企业宣传';

  return [
    `${topic}：先用一个客户最关心的问题作为开场，引出视频主题。`,
    `结合${audience}的真实关注点，说明这个问题为什么值得重视。`,
    `用企业现场、流程和团队画面证明能力，语气保持${tone}。`,
    `补充关键细节和风险提醒，避免夸大未确认的企业事实。`,
    `最后回到${skillName}的核心观点，给出清晰的行动建议。`
  ];
}

/**
 * 把脚本切成语义段：
 * - 先按句号/问号/叹号/换行切句；
 * - 长句（≥24 字）再按逗号/顿号/分号切为短句（每段 ≥6 字，保持语义完整），
 *   让每段时间预算落在单条素材可覆盖的容量内（对齐 PJD 基准约 18 段粒度）。
 * - 上限 18 段。
 */
function splitScript(script?: string): string[] {
  if (!script?.trim()) return [];
  const sentences = script
    .split(/[\n。！？!?]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length >= 24) {
      const clauses = sentence
        .split(/[、，；:：]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (clauses.length >= 2 && clauses.every((item) => item.length >= 6)) {
        segments.push(...clauses);
        continue;
      }
    }
    segments.push(sentence);
  }
  return segments.slice(0, 18);
}

function inferUsageRole(index: number, total: number): string {
  if (index === 0) return 'Hook';
  if (index === total - 1) return '结尾';
  if (index === 1) return '正文B-roll';
  return '能力证明';
}

function inferSegmentPurpose(
  index: number,
  total: number,
  skill: VideoEditingSkill | null
): string {
  if (index === 0) return '开场抓住注意力';
  if (index === total - 1) return '收束观点并形成记忆点';
  const rules = skill?.shots.shotRules ?? [];
  return rules[index - 1] || '承接脚本信息并匹配可信画面';
}

function buildAssetQuery(
  scriptText: string,
  input: z.infer<typeof createVideoPlanInput>,
  companyContext: CompanyContext | null,
  skill: VideoEditingSkill | null,
  usageRole: string
): string {
  const parts = [
    scriptText,
    input.userRequest,
    input.enterprisePositioning,
    skill?.content.contentType,
    skill?.assets.preferredCategories?.join(' '),
    companyContext?.brand?.positioning,
    companyContext?.contentStrategy?.directions?.join(' '),
    usageRole
  ];
  return parts.filter(Boolean).join(' ');
}

function getMatchLevel(score: number): VideoPlanSegmentMatchLevel {
  if (score >= 0.6) return 'high_match';
  if (score >= 0.35) return 'medium_match';
  if (score >= 0.2) return 'low_match';
  return 'no_match';
}

function buildCoverage(timeline: VideoPlanTimelineItem[]): CreateVideoPlanOutput['coverage'] {
  const counts = {
    highMatch: timeline.filter((item) => item.matchLevel === 'high_match').length,
    mediumMatch: timeline.filter((item) => item.matchLevel === 'medium_match').length,
    lowMatch: timeline.filter((item) => item.matchLevel === 'low_match').length,
    noMatch: timeline.filter((item) => item.matchLevel === 'no_match').length
  };
  const highQualityCoverageRate =
    timeline.length > 0
      ? Math.round(((counts.highMatch + counts.mediumMatch) / timeline.length) * 1000) / 10
      : 0;
  return {
    totalSegments: timeline.length,
    ...counts,
    highQualityCoverageRate,
    status:
      highQualityCoverageRate >= 80
        ? 'confirmed'
        : highQualityCoverageRate >= 60
          ? 'warning'
          : 'insufficient'
  };
}

function buildPlanTitle(input: z.infer<typeof createVideoPlanInput>): string {
  const clean = input.userRequest.replace(/[。！？!?\n\r]+/g, '').trim();
  return clean.length > 24 ? `${clean.slice(0, 24)}...` : clean || '企业短视频剪辑方案';
}

function buildGuardrailWarnings(companyContext: CompanyContext | null): string[] {
  const warnings: string[] = [];
  const forbiddenFacts = companyContext?.guardrails?.forbiddenFacts ?? [];
  if (forbiddenFacts.length > 0) {
    warnings.push('方案已读取企业事实边界；涉及未确认企业事实时应人工复核。');
  }
  return warnings;
}

// ============================================================
// 注册所有 Tool
// ============================================================

// Agent-native 自由剪辑工具（listVideoSkills/getVideoSkill/createVideoPlan/saveVideoPlanAsDraft/executeVideoTask）
// 已按产品决策从知衡助手对话中摘除：自由剪辑效果不可控，正式剪辑统一走「人工母版模板」路线。
// 定义保留（export 兼容），但不再注册进对话工具集。
toolRegistry.register(getCompanyContextSummaryTool);
toolRegistry.register(searchVideoAssetsTool);
toolRegistry.register(listTemplatesTool);
toolRegistry.register(parseTemplateTool);
toolRegistry.register(runTemplateRouteTool);

export {
  listVideoSkillsTool,
  getVideoSkillTool,
  getCompanyContextSummaryTool,
  searchVideoAssetsTool,
  createVideoPlanTool,
  saveVideoPlanAsDraftTool,
  executeVideoTaskTool,
  listTemplatesTool,
  parseTemplateTool,
  runTemplateRouteTool
};
export type { CompanyContextSummary };
