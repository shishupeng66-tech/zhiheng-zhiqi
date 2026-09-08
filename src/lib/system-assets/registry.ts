/**
 * System Asset Registry —— 覆盖配置读取
 *
 * 配置优先级（由 resolver 合并）：
 *   1) DATABASE（storage_configs 表，key=`system_asset:<key>`）
 *   2) WORKSPACE（workspaces.module_config.systemAssetOverrides.<key>，可选 workspaceId）
 *   3) ENV（ZHI_HENG_SYSTEM_ASSET_<KEY> / 根 ZHI_HENG_SYSTEM_ASSET_ROOT）
 *   4) DEFAULT（getDefaultSystemAssetPaths + legacy fallback）
 *
 * 复用现有 storage_configs 表，不新建数据库。
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { storageConfigs, workspaces } from '@/lib/db/schema';
import type { SystemAssetKey } from './types';

/** DB 覆盖：storage_configs.storage_key = `system_asset:<key>` */
export async function getDbSystemAssetOverride(key: SystemAssetKey): Promise<string | null> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(storageConfigs)
      .where(eq(storageConfigs.storageKey as any, `system_asset:${key}`))
      .limit(1);
    const p = rows[0]?.storagePath?.trim();
    return p ? p : null;
  } catch {
    return null;
  }
}

/** workspace 覆盖：workspaces.module_config.systemAssetOverrides.<key> */
export async function getWorkspaceSystemAssetOverride(
  workspaceId: string,
  key: SystemAssetKey
): Promise<string | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({ moduleConfig: workspaces.moduleConfig })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const mc = rows[0]?.moduleConfig;
    if (!mc) return null;
    const parsed = typeof mc === 'string' ? JSON.parse(mc) : mc;
    const overrides = parsed?.systemAssetOverrides as Record<string, string> | undefined;
    const p = overrides?.[key]?.trim();
    return p ? p : null;
  } catch {
    return null;
  }
}

/** ENV 覆盖：ZHI_HENG_SYSTEM_ASSET_<KEY 大写> */
export function getEnvSystemAssetOverride(key: SystemAssetKey): string | null {
  const name = `ZHI_HENG_SYSTEM_ASSET_${key.toUpperCase()}`;
  const p = process.env[name]?.trim();
  return p ? p : null;
}
