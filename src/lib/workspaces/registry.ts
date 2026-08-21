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
