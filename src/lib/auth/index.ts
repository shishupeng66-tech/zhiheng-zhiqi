import { cookies } from 'next/headers';
import { findUserByUsername } from '../../services/users';
import { verifyPassword } from './password';
import {
  createSession,
  destroySession,
  getUserBySessionToken,
  SESSION_COOKIE
} from './session';
import type { LoginError, PublicUser } from './types';
import type { Role, Status, User } from '../db/schema';

export { SESSION_COOKIE, SESSION_TTL_MS } from './session';
export type { PublicUser, LoginError } from './types';

/** 将服务端 User 行转换为可下发的 PublicUser（剔除密码哈希与时间戳） */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    employeeNo: user.employeeNo,
    phone: user.phone,
    department: user.department,
    position: user.position,
    avatar: user.avatar,
    role: user.role as Role,
    status: user.status as Status,
    mustChangePassword: user.mustChangePassword
  };
}

export type LoginResult =
  | { ok: true; user: PublicUser; token: string; expiresAt: Date }
  | { ok: false; error: LoginError };

/**
 * 本地登录：校验账号是否存在、是否禁用、密码是否匹配。
 * 成功后创建会话并返回令牌（由调用方写入 HttpOnly Cookie）。
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await findUserByUsername(username);
  if (!user) return { ok: false, error: 'not_found' };
  if (user.status === 'disabled') return { ok: false, error: 'disabled' };
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { ok: false, error: 'invalid_password' };
  const { token, expiresAt } = await createSession(user.id);
  return { ok: true, user: toPublicUser(user), token, expiresAt };
}

/**
 * 服务端读取当前登录用户（Server Component / Route Handler）。
 * 仅读取 Cookie，不写入，可在只读上下文安全调用。
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);
  return user ? toPublicUser(user) : null;
}

/**
 * 登出：销毁服务端会话并清除 Cookie。
 * 注意：会调用 cookies().delete，只能在可写 Cookie 的上下文（Route Handler / Server Action）调用。
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  await destroySession(token);
  cookieStore.delete(SESSION_COOKIE);
}
