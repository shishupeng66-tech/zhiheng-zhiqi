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
import { searchVideoClips, type VideoClipResult } from '../video-asset-index';

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
// 注册所有 Tool
// ============================================================

toolRegistry.register(listVideoSkillsTool);
toolRegistry.register(getVideoSkillTool);
toolRegistry.register(getCompanyContextSummaryTool);
toolRegistry.register(searchVideoAssetsTool);

export {
  listVideoSkillsTool,
  getVideoSkillTool,
  getCompanyContextSummaryTool,
  searchVideoAssetsTool
};
export type { CompanyContextSummary };
