/**
 * System Asset Registry —— 类型定义
 *
 * 三类资产路径（严禁混用）：
 * - SYSTEM_GLOBAL_ASSET：知衡智企全局共用，不属于任何客户（风格知识/模板/视觉资源/技能/校准/索引）。
 * - WORKSPACE_ASSET：属于某个 workspace / 客户（客户/产品/素材/视频/语音/知识/输出）。
 * - RUNTIME_INTERNAL：程序运行时内部路径（runtime/worker/pjd/logs/cache/diagnostics）。
 *
 * 所有业务 Agent / Skill / Retriever 一律通过 resolver 获取路径，禁止拼绝对路径。
 */

/** 系统全局资产 key（业务 Agent / Skill / Retriever 使用）。 */
export const SYSTEM_ASSET_KEYS = [
  'styleKnowledgeRoot',
  'jianyingTemplateRoot',
  'visualResourceRegistryRoot',
  'resourceCalibrationRoot',
  'resourceIndexRoot',
  'editingSkillRoot'
] as const;
export type SystemAssetKey = (typeof SYSTEM_ASSET_KEYS)[number];

/** 工作区（客户）资产 key。 */
export const WORKSPACE_ASSET_KEYS = [
  'customerRoot',
  'productRoot',
  'materialRoot',
  'videoRoot',
  'voiceRoot',
  'knowledgeRoot',
  'outputRoot',
  'templateRoot'
] as const;
export type WorkspaceAssetKey = (typeof WORKSPACE_ASSET_KEYS)[number];

/** 运行时内部 key（Agent 一般不直接使用，由 Runtime Resolver 内部管理）。 */
export const RUNTIME_ASSET_KEYS = [
  'runtimeRoot',
  'workerRoot',
  'pjdRoot',
  'logsRoot',
  'cacheRoot',
  'diagnosticsRoot'
] as const;
export type RuntimeAssetKey = (typeof RUNTIME_ASSET_KEYS)[number];

/** 路径来源（优先级：DATABASE > WORKSPACE > ENV > DEFAULT > RUNTIME）。 */
export type AssetSource = 'DATABASE' | 'WORKSPACE' | 'ENV' | 'DEFAULT' | 'RUNTIME';

/** 解析结果。 */
export interface ResolvedAsset {
  key: string;
  path: string;
  source: AssetSource;
  /** 目录是否存在 */
  exists: boolean;
  /** 是否可写（存在时检测） */
  writable: boolean;
}

/** 目录状态（复用 storage 语义）。 */
export type AssetDirStatus = 'normal' | 'readonly' | 'missing' | 'inaccessible' | 'invalid';

export interface SystemAssetKeyMeta {
  key: SystemAssetKey;
  label: string;
  description: string;
  /** 建议默认子目录名（相对系统资产根） */
  defaultSubdir: string;
}
