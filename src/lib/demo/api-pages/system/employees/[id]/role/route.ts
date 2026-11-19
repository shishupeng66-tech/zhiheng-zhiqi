import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, toPublicUser } from '@/lib/auth';
import { setUserRole } from '@/services/users';
import { serviceErrorResponse } from '@/lib/api/error-response';
import type { Role } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const ROLES: Role[] = ['super_admin', 'manager', 'employee'];

/** POST /api/system/employees/:id/role — 调整员工角色（仅超级管理员） */
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

  const role = body.role;
  if (typeof role !== 'string' || !ROLES.includes(role as Role)) {
    return NextResponse.json(
      { error: 'validation', message: 'role 必须是 super_admin / manager / employee 之一' },
      { status: 400 }
    );
  }

  try {
    const updated = await setUserRole(id, role as Role, {
      id: actor.id,
      role: actor.role
    });
    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (e) {
    return serviceErrorResponse(e);
  }
}
