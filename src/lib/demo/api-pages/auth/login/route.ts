import { NextResponse, type NextRequest } from 'next/server';
import { login, SESSION_COOKIE } from '@/lib/auth';

/**
 * 本地登录接口：校验账号密码，成功后写入 HttpOnly Cookie（session_token）。
 * - 账号不存在 / 密码错误 / 账号已禁用 统一返回 401，由前端按 error 区分文案（避免账号枚举）。
 * - Cookie 为 HttpOnly + SameSite=Lax，生产环境 secure，关闭浏览器后凭持久 Cookie 仍保持登录。
 */
export async function POST(req: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  const result = await login(username, password);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    mustChangePassword: result.user.mustChangePassword,
    user: result.user
  });
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: result.expiresAt
  });
  return res;
}
