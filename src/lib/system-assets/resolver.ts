/**
 * System Asset Registry —— Path Resolver
 *
 * 统一调用方式（Agent / Skill / Retriever 一律走这里，禁止拼绝对路径）：
 *   const { path } = await resolveSystemAsset('jianyingTemplateRoot');
 *   const { path } = await resolveWorkspaceAsset(workspaceId, 'materialRoot');
 *   await ensureSystemAsset('visualResourceRegistryRoot'); // 仅显式需要创建时
 *
 * 规则：
 * - resolve 只解析/检测，不创建目录；ensure 才允许 mkdir recursive。
 * - 优先级：DATABASE > WORKSPACE > ENV > DEFAULT（含 legacy fallback）。
 * - 绝对路径校验：Windows 盘符 / UNC / POSIX（复用现有 isAbsolutePath 语义）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { isAbsolutePath, getPath } from '@/lib/storage';
import { getDefaultSystemAssetPaths, getLegacySystemAssetPaths } from './defaults';
import {
  getDbSystemAssetOverride,
  getWorkspaceSystemAssetOverride,
  getEnvSystemAssetOverride
} from './registry';
import type { SystemAssetKey, WorkspaceAssetKey, ResolvedAsset, AssetSource } from './types';

/** 检测目录存在性 + 可写性（不创建）。 */
function probe(p: string): { exists: boolean; writable: boolean } {
  try {
    const exists = fs.existsSync(p);
    if (!exists) return { exists: false, writable: false };
    try {
      fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK);
      return { exists: true, writable: true };
    } catch {
      return { exists: true, writable: false };
    }
  } catch {
    return { exists: false, writable: false };
  }
}

function build(key: string, p: string, source: AssetSource): ResolvedAsset {
  const { exists, writable } = probe(p);
  return { key, path: p, source, exists, writable };
}

export interface ResolveSystemOptions {
  /** 可选：允许 workspace 层覆盖系统资产（优先级在 DB 之后、ENV 之前） */
  workspaceId?: string;
}

/** 解析系统全局资产路径（不创建目录）。 */
export async function resolveSystemAsset(
  key: SystemAssetKey,
  opts: ResolveSystemOptions = {}
): Promise<ResolvedAsset> {
  // 1) DATABASE
  const dbOverride = await getDbSystemAssetOverride(key);
  if (dbOverride && isAbsolutePath(dbOverride)) {
    return build(key, dbOverride, 'DATABASE');
  }
  // 2) WORKSPACE（可选）
  if (opts.workspaceId) {
    const wsOverride = await getWorkspaceSystemAssetOverride(opts.workspaceId, key);
    if (wsOverride && isAbsolutePath(wsOverride)) {
      return build(key, wsOverride, 'WORKSPACE');
    }
  }
  // 3) ENV
  const envOverride = getEnvSystemAssetOverride(key);
  if (envOverride && isAbsolutePath(envOverride)) {
    return build(key, envOverride, 'ENV');
  }
  // 4) DEFAULT（默认布局 → legacy 现有实际布局 fallback）
  const defaults = getDefaultSystemAssetPaths();
  const defaultPath = defaults[key];
  if (isAbsolutePath(defaultPath) && fs.existsSync(defaultPath)) {
    return build(key, defaultPath, 'DEFAULT');
  }
  const legacy = getLegacySystemAssetPaths()[key];
  if (isAbsolutePath(legacy) && fs.existsSync(legacy)) {
    return build(key, legacy, 'DEFAULT');
  }
  return build(key, defaultPath, 'DEFAULT');
}

/** workspace key → 现有统一 storage 业务目录 key 映射。 */
const WORKSPACE_TO_STORAGE_KEY: Record<WorkspaceAssetKey, Parameters<typeof getPath>[0]> = {
  customerRoot: 'customers',
  productRoot: 'products',
  materialRoot: 'assets',
  videoRoot: 'videos',
  voiceRoot: 'voices',
  knowledgeRoot: 'knowledge',
  outputRoot: 'assets',
  templateRoot: 'templates'
};

/** 解析 workspace（客户）资产路径（不创建目录）。 */
export async function resolveWorkspaceAsset(
  workspaceId: string,
  key: WorkspaceAssetKey
): Promise<ResolvedAsset> {
  // 1) WORKSPACE 显式覆盖（module_config.workspaceAssetOverrides）
  try {
    const db = (await import('@/lib/db')).getDb();
    const { workspaces } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db
      .select({ moduleConfig: workspaces.moduleConfig })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const mc = rows[0]?.moduleConfig;
    if (mc) {
      const parsed = typeof mc === 'string' ? JSON.parse(mc) : mc;
      const overrides = parsed?.workspaceAssetOverrides as Record<string, string> | undefined;
      const p = overrides?.[key]?.trim();
      if (p && isAbsolutePath(p)) return build(key, p, 'WORKSPACE');
    }
  } catch {
    /* 忽略 */
  }
  // 2) DATABASE：现有 storage_configs 的业务 key（customers/products/...）
  try {
    const storageKey = WORKSPACE_TO_STORAGE_KEY[key];
    const p = await getPath(storageKey);
    if (p) {
      const resolved = build(key, p, 'DATABASE');
      if (resolved.exists || key !== 'templateRoot') return resolved;

      // 兼容 2026-09 知识库升级：旧 DB 可能仍指向不存在的 90_模板，
      // 实际企业模板已收敛到 <knowledgeRoot>/05_模板/企业模板。
      const knowledgeRoot = await getPath('knowledge').catch(() => '');
      if (knowledgeRoot) {
        const upgraded = path.join(knowledgeRoot, '05_模板', '企业模板');
        if (fs.existsSync(upgraded)) return build(key, upgraded, 'DEFAULT');
      }
    }
  } catch {
    /* 忽略 */
  }
  // 3) DEFAULT：基于项目 data 根推导
  const storageKey = WORKSPACE_TO_STORAGE_KEY[key];
  const p = await getPath(storageKey);
  return build(key, p, 'DEFAULT');
}

/** 显式创建系统资产目录（递归）。仅当调用方确定需要时才调用。 */
export async function ensureSystemAsset(key: SystemAssetKey): Promise<ResolvedAsset> {
  const r = await resolveSystemAsset(key);
  if (!r.exists) {
    fs.mkdirSync(r.path, { recursive: true });
    return { ...r, exists: true, writable: true };
  }
  return r;
}

/** 诊断：全部系统资产状态（Environment Doctor / Agent Debug 用）。 */
export async function inspectSystemAssets(): Promise<ResolvedAsset[]> {
  const keys: SystemAssetKey[] = [
    'styleKnowledgeRoot',
    'jianyingTemplateRoot',
    'visualResourceRegistryRoot',
    'resourceCalibrationRoot',
    'resourceIndexRoot',
    'editingSkillRoot'
  ];
  const out: ResolvedAsset[] = [];
  for (const k of keys) {
    out.push(await resolveSystemAsset(k));
  }
  return out;
}

/** 生成诊断快照内容（供 snapshot 写入；只读，不把快照当配置源）。 */
export async function buildSystemAssetSnapshot(): Promise<{
  generatedAt: string;
  assets: Record<string, ResolvedAsset>;
}> {
  const assets = await inspectSystemAssets();
  const map: Record<string, ResolvedAsset> = {};
  for (const a of assets) map[a.key] = a;
  return { generatedAt: new Date().toISOString(), assets: map };
}
