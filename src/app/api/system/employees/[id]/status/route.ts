import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, toPublicUser } from '@/lib/auth';
import { setUserStatus } from '@/services/users';
import { serviceErrorResponse } from '@/lib/api/error-response';
import type { Status } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const STATUSES: Status[] = ['active', 'disabled'];

/** POST /api/system/employees/:id/status — 启用 / 禁用账号（仅超级管理员） */
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

  const status = body.status;
  if (typeof status !== 'string' || !STATUSES.includes(status as Status)) {
    return NextResponse.json(
      { error: 'validation', message: 'status 必须是 active 或 disabled' },
      { status: 400 }
    );
  }

  try {
    const updated = await setUserStatus(id, status as Status, {
      id: actor.id,
      role: actor.role
    });
    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (e) {
    return serviceErrorResponse(e);
  }
}
