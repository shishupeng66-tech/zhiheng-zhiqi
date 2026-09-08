/**
 * System Asset Registry —— 统一入口
 *
 * 任何 Agent / Skill / Retriever 需要系统资产/工作区资产路径时：
 *   import { resolveSystemAsset, resolveWorkspaceAsset } from '@/lib/system-assets';
 */
export * from './types';
export * from './defaults';
export * from './registry';
export * from './resolver';
