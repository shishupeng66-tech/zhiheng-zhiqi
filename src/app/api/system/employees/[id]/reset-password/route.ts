import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, toPublicUser } from '@/lib/auth';
import { resetUserPassword } from '@/services/users';
import { serviceErrorResponse } from '@/lib/api/error-response';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/system/employees/:id/reset-password
 * 管理员重置某员工密码。重置后该员工全部会话失效，且下次登录须重新设置密码。
 * 仅超级管理员可访问。
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6) {
    return NextResponse.json({ error: 'validation', message: '新密码至少 6 位' }, { status: 400 });
  }

  try {
    const updated = await resetUserPassword(id, password);
    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (e) {
    return serviceErrorResponse(e);
  }
}
