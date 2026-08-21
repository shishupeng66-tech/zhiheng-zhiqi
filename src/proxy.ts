import { NextResponse, type NextRequest } from 'next/server';

/**
 * 本地登录保护中间件（替换原 Clerk clerkMiddleware）。
 *
 * 设计要点：
 * - 运行在 Edge Runtime，严禁引入 better-sqlite3 / 任何原生模块或数据库查询。
 * - 仅做「Cookie 是否存在」的快速门禁；真正的会话校验（令牌有效性 / 过期 / 账号禁用）
 *   在 dashboard 布局的服务端组件里通过 getCurrentUser() 完成（Node Runtime，可访问 SQLite）。
 * - 未携带 session_token Cookie 访问 /dashboard/* 一律 307 跳转到 /auth/sign-in。
 */
const SESSION_COOKIE = 'session_token';

function isProtectedRoute(pathname: string): boolean {
  return pathname.startsWith('/dashboard');
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isProtectedRoute(pathname)) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      const signInUrl = new URL('/auth/sign-in', req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)'
  ]
};
