import { runMigrations, getDb } from '../src/lib/db';
import { eq } from 'drizzle-orm';
import { sessions, users } from '../src/lib/db/schema';
import { randomUUID } from 'node:crypto';
import { login, toPublicUser } from '../src/lib/auth';
import {
  destroySession,
  getUserBySessionToken,
  generateSessionToken,
  SESSION_TTL_MS,
  SESSION_COOKIE
} from '../src/lib/auth/session';
import { findUserByUsername, createUser, disableUser } from '../src/services/users';

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, extra = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
    pass++;
  } else {
    console.log(`  FAIL  ${name} ${extra}`);
    fail++;
  }
}

async function main() {
  runMigrations();
  const specs = [
    { username: 'phase3_user', name: '普通用户', employeeNo: 'P3002', password: 'Test@2026user', mustChangePassword: false, status: 'active' as const },
    { username: 'phase3_admin', name: '管理员', employeeNo: 'P3001', password: 'Test@2026phase3', mustChangePassword: true, status: 'active' as const },
    { username: 'phase3_disabled', name: '已禁用', employeeNo: 'P3003', password: 'Test@2026dis', mustChangePassword: false, status: 'disabled' as const }
  ];
  for (const s of specs) {
    if (!(await findUserByUsername(s.username))) {
      await createUser({ username: s.username, name: s.name, employeeNo: s.employeeNo, password: s.password, role: 'employee', status: s.status, mustChangePassword: s.mustChangePassword });
    }
  }
  // 确保 disabled 测试账号确实处于禁用状态（历史 seed 可能将其留为 active）
  const disabledUser = await findUserByUsername('phase3_disabled');
  if (disabledUser && disabledUser.status !== 'disabled') {
    await disableUser(disabledUser.id);
    console.log('  [fix] phase3_disabled 已强制置为 disabled');
  }
  for (const s of specs) {
    const u = await findUserByUsername(s.username);
    console.log(`  [debug] ${s.username} mustChangePassword=${u?.mustChangePassword} status=${u?.status}`);
  }
  console.log('=== 登录成功（phase3_user）===');
  const r1 = await login('phase3_user', 'Test@2026user');
  assert('ok=true', r1.ok === true);
  if (r1.ok) {
    assert('返回 token（非空）', typeof r1.token === 'string' && r1.token.length > 0);
    assert('user.username=phase3_user', r1.user.username === 'phase3_user');
    assert('mustChangePassword=false', r1.user.mustChangePassword === false);
    assert('expiresAt 在未来(~7天)', r1.expiresAt.getTime() - Date.now() > 6 * 24 * 60 * 60 * 1000);
    assert('PublicUser 不含 passwordHash', !('passwordHash' in r1.user));
  }

  console.log('=== 会话解析（模拟携带 Cookie 的鉴权请求）===');
  if (r1.ok) {
    const u = await getUserBySessionToken(r1.token);
    assert('getUserBySessionToken 返回该用户', !!u && u.username === 'phase3_user');
  }

  console.log('=== 错误密码 → invalid_password ===');
  const r2 = await login('phase3_user', 'wrong-pass');
  assert('ok=false', r2.ok === false);
  assert('error=invalid_password', !r2.ok && r2.error === 'invalid_password');

  console.log('=== 不存在账号 → not_found ===');
  const r3 = await login('ghost_user', 'whatever');
  assert('ok=false', r3.ok === false);
  assert('error=not_found', !r3.ok && r3.error === 'not_found');

  console.log('=== 已禁用账号 → disabled（即使密码正确）===');
  const r4 = await login('phase3_disabled', 'Test@2026dis');
  assert('ok=false', r4.ok === false);
  assert('error=disabled', !r4.ok && r4.error === 'disabled');

  console.log('=== 首次登录改密用户 → mustChangePassword=true ===');
  const r5 = await login('phase3_admin', 'Test@2026phase3');
  assert('ok=true', r5.ok === true);
  assert('mustChangePassword=true（驱动跳 /dashboard/profile）', r5.ok && r5.user.mustChangePassword === true);

  console.log('=== 登出销毁会话 ===');
  if (r1.ok) {
    await destroySession(r1.token);
    const after = await getUserBySessionToken(r1.token);
    assert('销毁后 getUserBySessionToken=null', after === null);
  }

  console.log('=== 令牌不可预测（256bit 随机）===');
  const t1 = generateSessionToken();
  const t2 = generateSessionToken();
  assert('长度=64 十六进制字符(256bit)', t1.length === 64 && /^[0-9a-f]{64}$/.test(t1));
  assert('两次生成不相等', t1 !== t2);

  console.log('=== 会话有效期 7 天 ===');
  assert('SESSION_TTL_MS = 7*24*3600*1000', SESSION_TTL_MS === 7 * 24 * 60 * 60 * 1000);
  assert('SESSION_COOKIE = session_token', SESSION_COOKIE === 'session_token');

  console.log('=== 过期会话自动清理 ===');
  const su = await findUserByUsername('phase3_user');
  if (su) {
    const pastToken = generateSessionToken();
    await getDb().insert(sessions).values({
      id: randomUUID(),
      sessionToken: pastToken,
      userId: su.id,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(Date.now() - 1000)
    });
    const expired = await getUserBySessionToken(pastToken);
    assert('过期令牌解析为 null', expired === null);
    const row = await getDb().select().from(sessions).where(eq(sessions.sessionToken, pastToken)).get();
    assert('过期行已被清理', row === undefined);
  }

  console.log('=== toPublicUser 剔除敏感字段 ===');
  const su2 = await findUserByUsername('phase3_user');
  if (su2) {
    const pu = toPublicUser(su2);
    assert('不含 passwordHash', !('passwordHash' in pu));
    assert('不含 createdAt/updatedAt', !('createdAt' in pu) && !('updatedAt' in pu));
    assert('含 role/status', 'role' in pu && 'status' in pu);
  }

  console.log('==========================================');
  console.log(`结果: PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
