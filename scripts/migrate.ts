import { loadEnvConfig } from '@next/env';
import { runMigrations } from '../src/lib/db';

loadEnvConfig(process.cwd());

/**
 * 应用数据库迁移（drizzle 迁移，使用 better-sqlite3 驱动）。
 * 重复执行安全：已执行的迁移会被跳过（依据 drizzle.__drizzle_migrations 记录）。
 *
 * 用法：npm run db:migrate
 */
runMigrations();
console.log('[migrate] 数据库迁移已应用（已执行的迁移会自动跳过）。');
