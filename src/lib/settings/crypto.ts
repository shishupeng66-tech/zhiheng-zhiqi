import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 统一设置中心 —— Secret 加密模块（AES-256-GCM）。
 *
 * 设计约束（来自《模型与接口设置中心设计方案》）：
 * 1. secret 类值（API Key / Access Key / Token 等）一律以密文入库，绝不明文。
 * 2. 主密钥（master key）不写死在源码中：解析顺序为
 *      a. 环境变量 SETTINGS_MASTER_KEY（hex 64 位 = 32 字节，或 base64 = 32 字节）
 *      b. gitignored 的本地引导文件 data/.settings-master-key（hex 64 位）
 *      c. 首次使用时随机生成并持久化到 (b)（仅本地企业部署场景；文件权限 0600）
 * 3. 本模块仅在服务端（Node 运行时）使用：better-sqlite3 + 文件 IO 均要求 Node。
 *
 * 密文存储格式：base64( iv(12) || authTag(16) || ciphertext )
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedMasterKey: Buffer | null = null;

function bootstrapKeyPath(): string {
  const dbPath = process.env.DATABASE_PATH || process.env.SQLITE_DB_PATH || './data/zhiheng.db';
  const dir = path.dirname(path.resolve(dbPath));
  return path.join(dir, '.settings-master-key');
}

function decodeMasterKey(raw: string): Buffer | null {
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  // 允许 base64（44 字符，解码后 32 字节）
  try {
    const b = Buffer.from(v, 'base64');
    if (b.length === 32) return b;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 解析主密钥。缓存到进程内，避免每次加解密重复读取磁盘。
 * 若环境变量与引导文件均缺失，则生成随机密钥并持久化（安全引导方式）。
 */
export function resolveMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const envKey = process.env.SETTINGS_MASTER_KEY?.trim();
  if (envKey) {
    const buf = decodeMasterKey(envKey);
    if (buf) {
      cachedMasterKey = buf;
      return cachedMasterKey;
    }
  }

  const keyPath = bootstrapKeyPath();
  try {
    if (fs.existsSync(keyPath)) {
      const buf = decodeMasterKey(fs.readFileSync(keyPath, 'utf8'));
      if (buf) {
        cachedMasterKey = buf;
        return cachedMasterKey;
      }
    }
  } catch {
    /* 落到生成分支 */
  }

  const key = randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  } catch {
    /* 极少数无法持久化场景：仍在本进程内存中使用，保证可用 */
  }
  cachedMasterKey = key;
  return cachedMasterKey;
}

/** 加密明文 secret，返回 base64 密文（含 iv + authTag）。 */
export function encryptSecret(plaintext: string): string {
  const key = resolveMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** 解密密文，返回明文 secret。仅在服务端内部调用（业务调用 / 桥接写入）。 */
export function decryptSecret(payload: string): string {
  const key = resolveMasterKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * 为前端展示生成脱敏串：保留前 4 位与后 4 位，中间以 • 替代。
 * 当长度 <= 8 时整体脱敏。绝不返回完整明文。
 */
export function maskSecret(value: string): string {
  const v = value?.trim() ?? '';
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
