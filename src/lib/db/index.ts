import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

/**
 * SQLite 数据库文件路径解析：
 * 1. 优先使用环境变量 DATABASE_PATH（生产环境建议指向持久化数据盘）
 * 2. 其次 SQLITE_DB_PATH
 * 3. 默认 ./data/zhiheng.db（项目根下的 data 目录，不参与 Next.js build，已被 .gitignore 忽略）
 *
 * 本地部署备份要点：备份该路径指向的 .db 文件（及其 -wal / -shm 临时文件）即可。
 */
export function resolveDbPath(): string {
  return process.env.DATABASE_PATH || process.env.SQLITE_DB_PATH || './data/zhiheng.db';
}

let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureDirFor(dbPath: string): void {
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 懒加载获取 Drizzle 数据库实例（单例） */
export function getDb() {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  ensureDirFor(dbPath);
  _sqlite = new Database(dbPath);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  // 多 worker 服务（Next 16 生产模式）下多个连接可能并发写同一 SQLite 文件；
  // 不设 busy_timeout 时会立刻返回 SQLITE_BUSY 导致请求崩溃（HTTP 000）。
  _sqlite.pragma('busy_timeout = 5000');
  _db = drizzle(_sqlite, { schema });
  return _db;
}

/** 获取底层 better-sqlite3 连接（仅在服务端使用） */
export function getSqlite() {
  if (!_sqlite) getDb();
  return _sqlite!;
}

/**
 * 应用 migrations 目录下的全部 SQL 迁移。
 * init-admin 等脚本会先调用本函数，确保表结构存在后再写数据。
 * 重复调用安全：drizzle migrate 会跳过已执行的迁移（依据 drizzle.__drizzle_migrations 表）。
 */
export function runMigrations(migrationsFolder = './drizzle'): void {
  const dbPath = resolveDbPath();
  ensureDirFor(dbPath);
  const sqlite = _sqlite ?? new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  migrate(drizzle(sqlite, { schema }), { migrationsFolder });
  if (!_sqlite) {
    _sqlite = sqlite;
    _db = drizzle(sqlite, { schema });
  }
}

export type AppDb = ReturnType<typeof getDb>;
export { schema };
