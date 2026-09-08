/**
 * Template Asset Store —— 企业模板资产数据访问层
 *
 * 读取企业 Obsidian 中的 template-asset.json（由 template-parser 编译、企业人工验收）。
 * 路径统一通过 resolveWorkspaceAsset(workspaceId, 'templateRoot') 解析，
 * 企业模板属于客户数据，绝不允许硬编码绝对路径。
 *
 * 数据边界：
 * - 模板资产（template-asset.json）= 客户 Obsidian（<企业Obsidian>\剪辑模板\<templateId>\）
 * - 产品源码（schema / parser / usage / rules）= 项目内部（本项目）
 *
 * 提供：
 *   loadTemplateAsset(workspaceId, templateId)   — 读取并校验单个资产
 *   listTemplateAssets(workspaceId)              — 列出企业模板目录全部资产
 *   getAssetPath(workspaceId, templateId)        — 解析资产 JSON 路径
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceAsset } from '@/lib/system-assets';
import {
  TEMPLATE_ASSET_SCHEMA_VERSION,
  normalizeTemplateAsset,
  validateTemplateAsset,
  type TemplateAsset
} from './asset-schema';

const ASSET_FILENAME = 'template-asset.json';

export interface LoadedTemplateAsset {
  ok: boolean;
  asset?: TemplateAsset;
  error?: string;
  path?: string;
}

/** 解析企业模板根目录（workspace templateRoot）。 */
export async function resolveEnterpriseTemplateRoot(
  workspaceId: string
): Promise<{ path: string; exists: boolean; writable: boolean }> {
  const r = await resolveWorkspaceAsset(workspaceId, 'templateRoot');
  return { path: r.path, exists: r.exists, writable: r.writable };
}

/** 单个模板资产 JSON 路径：<templateRoot>/<templateId>/template-asset.json */
export async function getAssetPath(workspaceId: string, templateId: string): Promise<string> {
  const { path: root } = await resolveEnterpriseTemplateRoot(workspaceId);
  const direct = path.join(root, templateId, ASSET_FILENAME);
  if (fs.existsSync(direct)) return direct;
  // 兼容企业 Obsidian 结构：<templateRoot>\企业模板\<templateId>\template-asset.json
  const nested = path.join(root, '企业模板', templateId, ASSET_FILENAME);
  if (fs.existsSync(nested)) return nested;
  return direct;
}

/** 读取并校验单个模板资产。 */
export async function loadTemplateAsset(
  workspaceId: string,
  templateId: string
): Promise<LoadedTemplateAsset> {
  const assetPath = await getAssetPath(workspaceId, templateId);
  if (!fs.existsSync(assetPath)) {
    return { ok: false, error: `TEMPLATE_ASSET_NOT_FOUND: ${assetPath}`, path: assetPath };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(assetPath, 'utf-8')) as Record<string, unknown>;
    // v1.0 校验（含旧资产归一化）
    const v = validateTemplateAsset(raw);
    if (!v.ok) {
      // 旧格式（无 schemaVersion）→ 尝试归一化
      if (typeof raw.schemaVersion === 'undefined') {
        const normalized = normalizeTemplateAsset(raw);
        if (normalized) {
          return { ok: true, asset: normalized, path: assetPath };
        }
      }
      return {
        ok: false,
        error: `TEMPLATE_ASSET_INVALID: ${v.errors.join('; ')}`,
        path: assetPath
      };
    }
    const asset = normalizeTemplateAsset(raw);
    return asset
      ? { ok: true, asset, path: assetPath }
      : { ok: false, error: 'TEMPLATE_ASSET_NORMALIZE_FAILED', path: assetPath };
  } catch (e) {
    return {
      ok: false,
      error: `TEMPLATE_ASSET_PARSE_ERROR: ${e instanceof Error ? e.message : '未知错误'}`,
      path: assetPath
    };
  }
}

/** 列出企业模板目录下全部模板资产。 */
export async function listTemplateAssets(workspaceId: string): Promise<LoadedTemplateAsset[]> {
  const { path: root, exists } = await resolveEnterpriseTemplateRoot(workspaceId);
  if (!exists) return [];
  const out: LoadedTemplateAsset[] = [];
  const seenIds = new Set<string>();

  const collect = async (dir: string): Promise<void> => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const assetPath = path.join(dir, e.name, ASSET_FILENAME);
      if (!fs.existsSync(assetPath)) continue;
      if (seenIds.has(e.name)) continue;
      seenIds.add(e.name);
      out.push(await loadTemplateAsset(workspaceId, e.name));
    }
  };

  await collect(root);
  // 兼容企业 Obsidian 结构：模板资产可能位于 <templateRoot>\企业模板\<templateId>\
  const nestedRoot = path.join(root, '企业模板');
  if (fs.existsSync(nestedRoot)) await collect(nestedRoot);
  return out;
}

/** 列出可用模板（approved + testing 显式允许时），供 Agent 检索。 */
export async function listUsableTemplateAssets(
  workspaceId: string,
  opts: { includeTesting?: boolean } = {}
): Promise<TemplateAsset[]> {
  const loaded = await listTemplateAssets(workspaceId);
  return loaded
    .filter((l) => l.ok && l.asset)
    .map((l) => l.asset!)
    .filter((a) => a.status === 'approved' || (opts.includeTesting && a.status === 'testing'));
}

export { TEMPLATE_ASSET_SCHEMA_VERSION };
