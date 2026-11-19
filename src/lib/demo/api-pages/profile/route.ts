import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, toPublicUser } from '@/lib/auth';
import { updateUser } from '@/services/users';
import { serviceErrorResponse } from '@/lib/api/error-response';

export const dynamic = 'force-dynamic';

/** GET /api/profile — 返回当前登录用户自身信息 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ user });
}

/**
 * PATCH /api/profile — 员工自助修改个人资料。
 * 仅允许修改：姓名 / 手机号 / 头像。
 * 角色、状态、部门、岗位、登录账号、工号 等字段服务端一律忽略（不可自助修改）。
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (body.phone === null || typeof body.phone === 'string') {
      patch.phone = body.phone === null ? null : String(body.phone).trim();
    }
    if (body.avatar === null || typeof body.avatar === 'string') patch.avatar = body.avatar;

    const updated = await updateUser(user.id, patch);
    if (!updated) {
      return NextResponse.json({ error: 'not_found', message: '账号不存在' }, { status: 404 });
    }
    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (e) {
    return serviceErrorResponse(e);
  }
}
