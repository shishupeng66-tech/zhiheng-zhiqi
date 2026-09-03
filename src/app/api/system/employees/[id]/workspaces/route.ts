import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findUserById } from '@/services/users';
import { listUserWorkspaceAccess, syncUserWorkspaceAccess } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function forbidden() {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

async function requireSuperAdmin() {
  const actor = await getCurrentUser();
  return actor?.role === 'super_admin';
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  if (!(await requireSuperAdmin())) return forbidden();

  const { id } = await params;
  const user = await findUserById(id);
  if (!user || user.status === 'deleted') {
    return NextResponse.json({ error: 'not_found', message: '员工不存在' }, { status: 404 });
  }

  return NextResponse.json(listUserWorkspaceAccess(id));
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!(await requireSuperAdmin())) return forbidden();

  const { id } = await params;
  const user = await findUserById(id);
  if (!user || user.status === 'deleted') {
    return NextResponse.json({ error: 'not_found', message: '员工不存在' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(body.workspaceIds)) {
    return NextResponse.json(
      { error: 'invalid_workspace_ids', message: '工作空间访问权限格式不正确' },
      { status: 400 }
    );
  }

  const workspaceIds = body.workspaceIds.filter(
    (workspaceId): workspaceId is string => typeof workspaceId === 'string'
  );

  return NextResponse.json(syncUserWorkspaceAccess(id, workspaceIds, 'viewer'));
}
