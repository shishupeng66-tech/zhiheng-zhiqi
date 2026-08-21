import { loadEnvConfig } from '@next/env';
import { runMigrations } from '../src/lib/db';
import { findUserByUsername, createUser } from '../src/services/users';

loadEnvConfig(process.cwd());

/**
 * 初始化首个超级管理员（super_admin）
 *
 * 用法：
 *   INITIAL_ADMIN_USERNAME=admin INITIAL_ADMIN_PASSWORD='xxxx' npm run init-admin
 *
 * 行为：
 * 1. 应用数据库迁移（确保表结构存在）
 * 2. 若同用户名 super_admin 已存在 -> 跳过（幂等，可重复执行）
 * 3. 否则创建账号：role=super_admin、status=active、mustChangePassword=true（首次登录须改密）
 *
 * 安全：
 * - 密码仅来自环境变量，绝不硬编码
 * - 哈希后入库，本脚本不打印明文密码
 * - 真实凭据不要提交到 Git
 */
async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || '系统管理员';
  const employeeNo = process.env.INITIAL_ADMIN_EMPLOYEE_NO?.trim() || 'A0001';

  if (!username || !password) {
    console.error(
      '[init-admin] 缺少环境变量：请设置 INITIAL_ADMIN_USERNAME 与 INITIAL_ADMIN_PASSWORD（参考 env.example.txt）'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[init-admin] 初始密码长度至少 8 位。');
    process.exit(1);
  }

  console.log('[init-admin] 正在应用数据库迁移...');
  runMigrations();

  const existing = await findUserByUsername(username);
  if (existing) {
    console.log(`[init-admin] 超级管理员 "${username}" 已存在，跳过创建（id=${existing.id}）。`);
    process.exit(0);
  }

  const admin = await createUser({
    username,
    name,
    employeeNo,
    password,
    role: 'super_admin',
    status: 'active',
    mustChangePassword: true
  });

  console.log('============================================================');
  console.log('[init-admin] 首个超级管理员创建成功：');
  console.log(`  用户名(username) : ${admin.username}`);
  console.log(`  姓名(name)       : ${admin.name}`);
  console.log(`  工号(employeeNo) : ${admin.employeeNo}`);
  console.log(`  角色(role)       : ${admin.role}`);
  console.log('  重要：该账号使用初始密码，首次登录后必须修改密码！');
  console.log('============================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('[init-admin] 初始化失败：', err);
  process.exit(1);
});
