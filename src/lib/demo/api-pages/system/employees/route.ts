import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, toPublicUser } from '@/lib/auth';
import { createEmployee, listUsers, searchUsers } from '@/services/users';
import { serviceErrorResponse } from '@/lib/api/error-response';
import type { Role, Status } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['super_admin', 'manager', 'employee'];
const STATUSES: Status[] = ['active', 'disabled', 'deleted'];

/**
 * GET /api/system/employees
 * 列出 / 搜索员工。仅超级管理员可访问，否则 403。
 * 查询参数：q（姓名/账号/工号）、role、status
 */
export async function GET(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') ?? undefined;
  const roleParam = searchParams.get('role');
  const statusParam = searchParams.get('status');
  const role = roleParam && ROLES.includes(roleParam as Role) ? (roleParam as Role) : undefined;
  const status =
    statusParam && STATUSES.includes(statusParam as Status) ? (statusParam as Status) : undefined;

  const rows = q ? await searchUsers({ q, role, status }) : await listUsers({ role, status });

  return NextResponse.json({ users: rows.map(toPublicUser) });
}

/**
 * POST /api/system/employees
 * 新建员工账号。仅超级管理员可访问，否则 403。
 */
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const created = await createEmployee({
      username: String(body.username ?? ''),
      name: String(body.name ?? ''),
      employeeNo: String(body.employeeNo ?? ''),
      password: String(body.password ?? ''),
      role: body.role && ROLES.includes(body.role as Role) ? (body.role as Role) : 'employee',
      phone: body.phone ? String(body.phone) : null,
      department: body.department ? String(body.department) : null,
      position: body.position ? String(body.position) : null,
      avatar: body.avatar ? String(body.avatar) : null,
      status:
        body.status && STATUSES.includes(body.status as Status)
          ? (body.status as Status)
          : 'active',
      mustChangePassword: body.mustChangePassword !== false
    });
    return NextResponse.json({ user: toPublicUser(created) }, { status: 201 });
  } catch (e) {
    return serviceErrorResponse(e);
  }
}
