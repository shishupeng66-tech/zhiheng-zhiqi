import Database from 'better-sqlite3';
import { resolveDbPath, runMigrations } from '../src/lib/db';
import {
  findUserByUsername,
  findUserByEmployeeNo,
  createUser,
  disableUser,
  enableUser,
  updatePassword
} from '../src/services/users';
import { verifyPassword } from '../src/lib/auth/password';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name} ${extra}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function main() {
  console.log('=== Phase 2 验证开始 ===');
  console.log(`  [数据库文件] ${resolveDbPath()}`);

  // 1. 数据库初始化 & 2. migration 执行（重复执行安全）
  runMigrations();
  check('1+2. 数据库初始化 & migration 可执行', true);

  // 每次运行使用唯一测试数据，保证可重复执行
  const stamp = Date.now();
  const u = `vuser_${stamp}`;
  const e = `V${stamp}`;

  // 6. 密码非明文
  const created = await createUser({
    username: u,
    name: '验证账号',
    employeeNo: e,
    password: 'Secret123!',
    role: 'employee'
  });
  check(
    '6. 密码存入数据库不是明文',
    created.passwordHash !== 'Secret123!' && created.passwordHash.startsWith('$2'),
    `hash=${created.passwordHash.slice(0, 7)}...`
  );

  // 7. 按 username 查
  const byU = await findUserByUsername(u);
  check('7. 可按 username 查用户', !!byU && byU.id === created.id);

  // 8. 按 employeeNo 查
  const byE = await findUserByEmployeeNo(e);
  check('8. 可按 employeeNo 查用户', !!byE && byE.id === created.id);

  // 4. username 唯一约束
  let uniqUserOk = false;
  try {
    await createUser({ username: u, name: 'dup', employeeNo: `V${stamp}_x`, password: 'x' });
  } catch (err) {
    uniqUserOk = /UNIQUE|unique|constraint/i.test(String((err as Error)?.message ?? err));
  }
  check('4. username 唯一约束有效', uniqUserOk);

  // 5. employeeNo 唯一约束
  let uniqEmpOk = false;
  try {
    await createUser({ username: `${u}_x`, name: 'dup', employeeNo: e, password: 'x' });
  } catch (err) {
    uniqEmpOk = /UNIQUE|unique|constraint/i.test(String((err as Error)?.message ?? err));
  }
  check('5. employeeNo 唯一约束有效', uniqEmpOk);

  // 9. 改状态（禁用/启用）
  const dis = await disableUser(created.id);
  check('9a. 可禁用用户', dis.status === 'disabled');
  const en = await enableUser(created.id);
  check('9b. 可启用用户', en.status === 'active');

  // 10. 改密码
  await updatePassword(created.id, 'NewSecret456!');
  const after = await findUserByUsername(u);
  const okNew = after ? await verifyPassword('NewSecret456!', after.passwordHash) : false;
  const okOld = after ? await verifyPassword('Secret123!', after.passwordHash) : true;
  check('10. 可修改密码', !!after && okNew && !okOld && after.mustChangePassword === false);

  // 11. 重启/重连后数据仍在（用全新连接直接读盘上文件）
  const fileDb = new Database(resolveDbPath());
  const cnt = (fileDb.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  fileDb.close();
  check('11. 数据库文件重启/重连后仍存在', cnt >= 1, `users 行数=${cnt}`);

  // 3. 首个 super_admin（由 init-admin 创建；此处确认存在且角色正确）
  const adminName = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  const admin = await findUserByUsername(adminName);
  check('3. 首个 super_admin 已创建', !!admin && admin.role === 'super_admin', `username=${adminName}`);

  console.log(`\n=== 验证结果：通过 ${pass}，失败 ${fail} ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('验证异常：', err);
  process.exit(1);
});
