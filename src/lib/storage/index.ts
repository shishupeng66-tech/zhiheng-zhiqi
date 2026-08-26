/**
 * 数据存储 —— 统一存储服务层（StorageService）
 *
 * 业务代码统一通过本服务获取/配置文件目录，禁止写死路径：
 *   import { getPath, resolveDir } from '@/lib/storage';
 *   const videosDir = await getPath('videos');
 *
 * 规则：
 * - root 为根目录 key；业务 key（customers/...）未单独配置时继承 root + 默认子目录名。
 * - storage_configs 表仅存「被显式配置/覆盖」的目录（含 root）。
 * - 目录检测（probeStatus）：绝对路径校验 + 存在性 + 可读/可写，不做表面保存。
 *
 * 本阶段不做：OSS/COS/云存储/NAS 自动发现/数据库路径迁移/自动搬迁现有文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { storageConfigs, type StorageKey } from '@/lib/db/schema';
import {
  STORAGE_KEY_META,
  STORAGE_ROOT_KEY,
  BUSINESS_STORAGE_KEYS,
  type StorageKeyMeta
} from './types';

function now(): Date {
  return new Date();
}

/** 根目录缺省值：优先 env STORAGE_ROOT，否则 <项目根>/data（与 DB 同一目录但不参与 DB 迁移） */
export function defaultRootPath(): string {
  return process.env.STORAGE_ROOT || path.join(process.cwd(), 'data');
}

/** 是否合法绝对路径：Windows 盘符 / UNC / POSIX 均可 */
export function isAbsolutePath(p: string): boolean {
  const s = (p ?? '').trim();
  if (!s) return false;
  // win32: D:\xx / D:/xx / \\server\share / \\?\UNC\...
  // posix: /xx
  return path.win32.isAbsolute(s) || path.posix.isAbsolute(s);
}

/** 目录检测结果状态 */
export type DirStatus =
  | 'normal' // 存在且可读可写
  | 'readonly' // 存在但不可写（只读）
  | 'missing' // 不存在（可被创建）
  | 'inaccessible' // 存在但不可访问
  | 'invalid'; // 非合法绝对路径

export interface DirProbe {
  status: DirStatus;
  /** 人类可读状态描述（用于页面展示） */
  label: string;
}

const STATUS_LABEL: Record<DirStatus, string> = {
  normal: '正常',
  readonly: '不可写',
  missing: '目录不存在',
  inaccessible: '不可访问',
  invalid: '路径无效'
};

/**
 * 真实检测目录：
 * 1) 合法绝对路径（Windows 盘符/UNC/POSIX）
 * 2) 目录存在性
 * 3) 可读 / 可写（W_OK）
 * 不创建目录 —— 创建由 ensureDir / 保存流程负责。
 */
export function probeDir(p: string): DirProbe {
  const s = (p ?? '').trim();
  if (!isAbsolutePath(s)) {
    return { status: 'invalid', label: STATUS_LABEL.invalid };
  }
  let exists = false;
  try {
    exists = fs.existsSync(s);
  } catch {
    return { status: 'inaccessible', label: STATUS_LABEL.inaccessible };
  }
  if (!exists) {
    return { status: 'missing', label: STATUS_LABEL.missing };
  }
  try {
    // 可读 + 可写
    fs.accessSync(s, fs.constants.R_OK | fs.constants.W_OK);
    return { status: 'normal', label: STATUS_LABEL.normal };
  } catch {
    try {
      fs.accessSync(s, fs.constants.R_OK);
      return { status: 'readonly', label: STATUS_LABEL.readonly };
    } catch {
      return { status: 'inaccessible', label: STATUS_LABEL.inaccessible };
    }
  }
}

/** 读取某个 key 的显式配置（未配置返回 null） */
export async function getConfig(key: StorageKey) {
  const db = getDb();
  const rows = await db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.storageKey, key))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 获取某业务目录的最终生效路径：
 * - 已显式配置 → 使用配置值
 * - 未配置 → 根目录 + 默认子目录
 */
export async function getPath(key: StorageKey): Promise<string> {
  if (key === STORAGE_ROOT_KEY) {
    const cfg = await getConfig(key);
    return cfg ? cfg.storagePath : defaultRootPath();
  }
  const cfg = await getConfig(key);
  if (cfg) return cfg.storagePath;
  const root = await getPath(STORAGE_ROOT_KEY);
  const sub = STORAGE_KEY_META[key].defaultSubdir;
  return sub ? path.join(root, sub) : root;
}

/** 同步取根目录生效路径（无 DB 依赖，供不需要落库的读取场景使用） */
export function getRootPathSync(): string {
  // 不查 DB（同步函数无法 await）；仅返回缺省根目录。
  // 需要「已配置根目录」时请使用 getPath('root')。
  return defaultRootPath();
}

/**
 * 确保目录存在（递归创建）。返回创建后的真实路径。
 * 用于业务写入前保证目录可用。
 */
export async function ensureDir(key: StorageKey): Promise<string> {
  const dir = await getPath(key);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 列出全部业务目录（含 root）的展示信息，供「数据存储」设置页使用。
 * 每个条目包含：key / label / description / 是否显式配置 / 生效路径 / 默认继承来源 / 检测状态。
 */
export async function listStorageOverview(): Promise<
  (StorageKeyMeta & {
    configured: boolean;
    effectivePath: string;
    inheritedFromRoot: boolean;
    probe: DirProbe;
  })[]
> {
  const rootPath = await getPath(STORAGE_ROOT_KEY);
  const rootConfigured = (await getConfig(STORAGE_ROOT_KEY)) !== null;
  const out: Awaited<ReturnType<typeof listStorageOverview>> = [];

  // 根目录
  out.push({
    ...STORAGE_KEY_META[STORAGE_ROOT_KEY],
    configured: rootConfigured,
    effectivePath: rootPath,
    inheritedFromRoot: false,
    probe: probeDir(rootPath)
  });

  // 业务子目录
  for (const key of BUSINESS_STORAGE_KEYS) {
    const cfg = await getConfig(key);
    const effectivePath = cfg
      ? cfg.storagePath
      : path.join(rootPath, STORAGE_KEY_META[key].defaultSubdir!);
    out.push({
      ...STORAGE_KEY_META[key],
      configured: cfg !== null,
      effectivePath,
      inheritedFromRoot: cfg === null,
      probe: probeDir(effectivePath)
    });
  }
  return out;
}

/**
 * 保存/覆盖某个目录配置（upsert，storage_key 唯一）。
 * 保存前：
 * - 校验合法绝对路径
 * - 若不存在则递归创建（并二次校验创建后是否可写）
 * 返回保存后的生效路径 + 检测结果。
 */
export async function saveConfig(
  key: StorageKey,
  rawPath: string
): Promise<{ effectivePath: string; probe: DirProbe }> {
  const p = (rawPath ?? '').trim();
  if (!isAbsolutePath(p)) {
    return { effectivePath: p, probe: { status: 'invalid', label: STATUS_LABEL.invalid } };
  }
  // 创建目录（若不存在）
  fs.mkdirSync(p, { recursive: true });
  const probe = probeDir(p);

  const db = getDb();
  const existing = await getConfig(key);
  if (existing) {
    await db
      .update(storageConfigs)
      .set({ storagePath: p, updatedAt: now() })
      .where(eq(storageConfigs.id, existing.id));
  } else {
    await db.insert(storageConfigs).values({
      id: randomUUID(),
      storageKey: key,
      storagePath: p,
      storageType: 'local',
      createdAt: now(),
      updatedAt: now()
    });
  }
  return { effectivePath: p, probe };
}

/** 重置某业务目录为「继承根目录」状态（删除显式配置行）。root 本身不可重置。 */
export async function resetConfig(key: StorageKey): Promise<void> {
  if (key === STORAGE_ROOT_KEY) return;
  const db = getDb();
  await db.delete(storageConfigs).where(eq(storageConfigs.storageKey, key));
}
