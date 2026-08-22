import { NextResponse } from 'next/server';
import { logout } from '@/lib/auth';

/**
 * 本地登出接口：销毁服务端会话记录并清除 HttpOnly Cookie。
 * 前端调用后自行跳转到 /auth/sign-in。
 */
export async function POST() {
  await logout();
  return NextResponse.json({ ok: true });
}
