import type { WorkspaceType } from '@/lib/db/schema';
import type { WorkspacePermission } from './permissions';

export type WorkspaceModuleKey =
  | 'overview'
  | 'assets'
  | 'topics'
  | 'scripts'
  | 'ai-video'
  | 'projects'
  | 'review'
  | 'publish'
  | 'analytics'
  | 'members';

export type WorkspaceModuleDefinition = {
  key: WorkspaceModuleKey;
  label: string;
  shortLabel?: string;
  path: string;
  description: string;
  requiredPermission: WorkspacePermission;
};

export type WorkspaceTypeDefinition = {
  type: WorkspaceType;
  name: string;
  icon: string;
  description: string;
  modules: WorkspaceModuleDefinition[];
};

export const enterpriseMediaModules: WorkspaceModuleDefinition[] = [
  {
    key: 'overview',
    label: '概览',
    path: '',
    description: '查看企业实拍视频生产任务、素材资产和成片进度。',
    requiredPermission: 'workspace:view'
  },
  {
    key: 'assets',
    label: '素材库',
    path: 'assets',
    description: '管理企业实拍视频、图片、品牌素材和素材分析状态。',
    requiredPermission: 'assets:view'
  },
  {
    key: 'scripts',
    label: '脚本中心',
    shortLabel: '脚本',
    path: 'scripts',
    description: '管理宣传视频脚本、拍摄说明和剪辑参考。',
    requiredPermission: 'scripts:manage'
  },
  {
    key: 'ai-video',
    label: '剪辑流程',
    shortLabel: '剪辑',
    path: 'ai-video',
    description: '承载从素材选择到自动剪辑、字幕、配音和导出的流程骨架。',
    requiredPermission: 'video:generate'
  },
  {
    key: 'projects',
    label: '成片管理',
    shortLabel: '成片',
    path: 'projects',
    description: '跟踪企业宣传视频项目、成片状态和历史视频。',
    requiredPermission: 'projects:manage'
  },
  {
    key: 'review',
    label: '审核中心',
    shortLabel: '审核',
    path: 'review',
    description: '处理宣传视频的审核、修改和确认。',
    requiredPermission: 'review:approve'
  },
  {
    key: 'publish',
    label: '发布中心',
    shortLabel: '发布',
    path: 'publish',
    description: '管理待发布、已排期、已发布和发布失败状态。',
    requiredPermission: 'publish:manage'
  },
  {
    key: 'analytics',
    label: '数据复盘',
    shortLabel: '复盘',
    path: 'analytics',
    description: '查看宣传视频数量、播放、互动和线索表现。',
    requiredPermission: 'analytics:view'
  },
  {
    key: 'members',
    label: '成员与权限',
    shortLabel: '成员',
    path: 'members',
    description: '管理企业媒体空间成员、角色和权限。',
    requiredPermission: 'members:manage'
  }
];

export const aiContentModules: WorkspaceModuleDefinition[] = [
  {
    key: 'overview',
    label: '概览',
    path: '',
    description: '查看 AI 内容创作流程、今日任务和内容资产概况。',
    requiredPermission: 'workspace:view'
  },
  {
    key: 'topics',
    label: '选题中心',
    shortLabel: '选题',
    path: 'topics',
    description: '沉淀选题来源、热点分析和 AI 选题推荐入口。',
    requiredPermission: 'topics:manage'
  },
  {
    key: 'scripts',
    label: '脚本中心',
    shortLabel: '脚本',
    path: 'scripts',
    description: '管理 AI 脚本草稿、确认状态和使用记录。',
    requiredPermission: 'scripts:manage'
  },
  {
    key: 'ai-video',
    label: 'AI 视频生成',
    shortLabel: 'AI 视频',
    path: 'ai-video',
    description: '承载从脚本、分镜到 AI 图片/视频生成的流程骨架。',
    requiredPermission: 'video:generate'
  },
  {
    key: 'projects',
    label: '内容项目',
    shortLabel: '项目',
    path: 'projects',
    description: '跟踪 AI 内容创作项目的状态、负责人和更新时间。',
    requiredPermission: 'projects:manage'
  },
  {
    key: 'review',
    label: '审核中心',
    shortLabel: '审核',
    path: 'review',
    description: '处理 AI 内容的审核、修改和确认。',
    requiredPermission: 'review:approve'
  },
  {
    key: 'publish',
    label: '发布中心',
    shortLabel: '发布',
    path: 'publish',
    description: '管理待发布、已排期、已发布和发布失败状态。',
    requiredPermission: 'publish:manage'
  },
  {
    key: 'analytics',
    label: '数据复盘',
    shortLabel: '复盘',
    path: 'analytics',
    description: '查看内容数量、播放、互动和趋势复盘。',
    requiredPermission: 'analytics:view'
  },
  {
    key: 'members',
    label: '成员与权限',
    shortLabel: '成员',
    path: 'members',
    description: '管理 AI 内容创作空间成员、角色和权限。',
    requiredPermission: 'members:manage'
  }
];

export const videoProductionModules: WorkspaceModuleDefinition[] = [
  {
    key: 'overview',
    label: '概览',
    path: '',
    description: '查看短视频生产工作流、今日任务和内容资产概况。',
    requiredPermission: 'workspace:view'
  },
  {
    key: 'assets',
    label: '素材库',
    path: 'assets',
    description: '管理视频、图片、标签和素材分析状态。',
    requiredPermission: 'assets:view'
  },
  {
    key: 'topics',
    label: '选题中心',
    shortLabel: '选题',
    path: 'topics',
    description: '沉淀选题来源，准备后续 AI 推荐选题。',
    requiredPermission: 'topics:manage'
  },
  {
    key: 'scripts',
    label: '脚本中心',
    shortLabel: '脚本',
    path: 'scripts',
    description: '管理脚本草稿、确认状态和使用记录。',
    requiredPermission: 'scripts:manage'
  },
  {
    key: 'ai-video',
    label: 'AI 视频生产',
    shortLabel: 'AI 视频',
    path: 'ai-video',
    description: '搭建从素材到审核的 AI 视频生产流程骨架。',
    requiredPermission: 'video:generate'
  },
  {
    key: 'projects',
    label: '视频项目',
    shortLabel: '项目',
    path: 'projects',
    description: '跟踪视频生产项目的状态、负责人和更新时间。',
    requiredPermission: 'projects:manage'
  },
  {
    key: 'review',
    label: '审核中心',
    shortLabel: '审核',
    path: 'review',
    description: '处理待审核、通过和需要修改的视频。',
    requiredPermission: 'review:approve'
  },
  {
    key: 'publish',
    label: '发布中心',
    shortLabel: '发布',
    path: 'publish',
    description: '管理待发布、已排期、已发布和发布失败状态。',
    requiredPermission: 'publish:manage'
  },
  {
    key: 'analytics',
    label: '数据复盘',
    shortLabel: '复盘',
    path: 'analytics',
    description: '查看内容数量、播放、互动、线索和趋势空状态。',
    requiredPermission: 'analytics:view'
  },
  {
    key: 'members',
    label: '成员与权限',
    shortLabel: '成员',
    path: 'members',
    description: '查看并管理工作空间成员、角色和权限状态。',
    requiredPermission: 'members:manage'
  }
];

export const workspaceTypeRegistry: Record<WorkspaceType, WorkspaceTypeDefinition> = {
  'enterprise-media': {
    type: 'enterprise-media',
    name: '企业媒体空间',
    icon: 'video',
    description: '企业实拍素材、宣传视频生产与成片管理空间。',
    modules: enterpriseMediaModules
  },
  'ai-content': {
    type: 'ai-content',
    name: 'AI内容创作空间',
    icon: 'sparkles',
    description: 'AI选题、脚本、分镜与视频生成创作空间。',
    modules: aiContentModules
  },
  'video-production': {
    type: 'video-production',
    name: '短视频生产',
    icon: 'video',
    description: '企业短视频内容生产工作台',
    modules: videoProductionModules
  },
  sales: {
    type: 'sales',
    name: '销售工作',
    icon: 'trendingUp',
    description: '销售线索、跟进与成交管理工作空间。',
    modules: []
  },
  'customer-service': {
    type: 'customer-service',
    name: '客服工作',
    icon: 'chat',
    description: '客户咨询、工单与服务质量管理工作空间。',
    modules: []
  },
  knowledge: {
    type: 'knowledge',
    name: '企业知识管理',
    icon: 'post',
    description: '企业知识沉淀、检索与复用工作空间。',
    modules: []
  },
  'production-management': {
    type: 'production-management',
    name: '生产问题处理',
    icon: 'kanban',
    description: '生产异常、问题流转与处理跟踪工作空间。',
    modules: []
  }
};

export function getWorkspaceTypeDefinition(type: WorkspaceType) {
  return workspaceTypeRegistry[type];
}

export function getWorkspaceModules(type: WorkspaceType, enabledModules: string[]) {
  const definition = getWorkspaceTypeDefinition(type);
  const enabled = new Set(enabledModules);
  return definition.modules.filter((module) => enabled.has(module.key));
}
