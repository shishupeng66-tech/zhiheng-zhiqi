import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, toPublicUser } from '@/lib/auth';
import { findUserById, updateEmployee, type UpdateEmployeeInput } from '@/services/users';
import { serviceErrorResponse } from '@/lib/api/error-response';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/system/employees/:id — 单个员工详情（仅超级管理员） */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const user = await findUserById(id);
  if (!user) {
    return NextResponse.json({ error: 'not_found', message: '员工不存在' }, { status: 404 });
  }
  return NextResponse.json({ user: toPublicUser(user) });
}

/**
 * PATCH /api/system/employees/:id
 * 编辑员工资料（姓名 / 手机号 / 部门 / 岗位 / 头像）。
 * 角色与状态不在此处处理（走 /role 与 /status 接口），以保证安全校验集中。
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
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

  try {
    const patch: UpdateEmployeeInput = {};
    if (typeof body.name === 'string') patch.name = body.name;
    if (body.phone === null || typeof body.phone === 'string') patch.phone = body.phone;
    if (body.department === null || typeof body.department === 'string')
      patch.department = body.department;
    if (body.position === null || typeof body.position === 'string') patch.position = body.position;
    if (body.avatar === null || typeof body.avatar === 'string') patch.avatar = body.avatar;

    const updated = await updateEmployee(id, patch);
    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (e) {
    return serviceErrorResponse(e);
  }
}
