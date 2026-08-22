import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '../db';
import { sessions, users, type User } from '../db/schema';

/**
 * 会话有效期：7 天（毫秒）。
 * 与写入 Cookie 的 maxAge 一致，确保「关闭浏览器重开」后本地部署仍可凭持久 Cookie 保持登录。
 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** HttpOnly Cookie 名称 */
export const SESSION_COOKIE = 'session_token';

/**
 * 生成 256bit（32 字节）随机、不可预测的会话令牌。
 * 使用 node:crypto.randomBytes（CSPRNG），不依赖任何可猜测的来源（时间 / 自增 ID / 用户名）。
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** 登录成功后创建一条会话记录，返回令牌与过期时间 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await getDb().insert(sessions).values({
    id: randomUUID(),
    sessionToken: token,
    userId,
    expiresAt,
    createdAt: now
  });
  return { token, expiresAt };
}

/** 销毁指定会话（登出）。令牌为空时安全跳过 */
export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.sessionToken, token));
}

/**
 * 根据会话令牌解析当前登录用户（服务端组件 / 中间件 / 路由处理器共用）。
 * - 无令牌 → null
 * - 令牌不存在或已过期 → 清理过期行并返回 null
 * - 用户不存在或已禁用 → null
 */
export async function getUserBySessionToken(
  token: string | undefined | null
): Promise<User | null> {
  if (!token) return null;
  const session = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.sessionToken, token))
    .get();
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await getDb().delete(sessions).where(eq(sessions.sessionToken, token));
    return null;
  }
  const user = await getDb().select().from(users).where(eq(users.id, session.userId)).get();
  if (!user || user.status !== 'active') return null;
  return user;
}

/**
 * 删除指定用户的全部会话（用于：禁用账号 / 重置密码 / 用户自助修改密码后让其余设备下线）。
 * 与 destroySession（按令牌删除单条）不同，此函数按 userId 整批清除。
 */
export async function deleteUserSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteOtherUserSessions(
  userId: string,
  keepToken: string | undefined | null
): Promise<void> {
  if (!keepToken) {
    await deleteUserSessions(userId);
    return;
  }
  await getDb()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.sessionToken, keepToken)));
}
