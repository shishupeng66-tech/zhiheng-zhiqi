import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { workspaceMembers, type WorkspaceMemberRole } from '@/lib/db/schema';
import { workspaceRoleLabels } from '@/lib/workspaces/permissions';
import {
  addWorkspaceMember,
  listWorkspaceMemberCandidates,
  listWorkspaceMembers,
  removeWorkspaceMember,
  requireWorkspacePermission,
  updateWorkspaceMemberRole
} from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ workspaceSlug: string }> };

const ASSIGNABLE_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'editor', 'viewer'];

function isAssignableRole(value: unknown): value is WorkspaceMemberRole {
  return (
    typeof value === 'string' && ASSIGNABLE_WORKSPACE_ROLES.includes(value as WorkspaceMemberRole)
  );
}

function findWorkspaceMember(memberId: string, workspaceId: string) {
  const member = getDb()
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.id, memberId))
    .get();
  if (!member || member.workspaceId !== workspaceId) return null;
  return member;
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'members:manage');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const { workspace } = result.context;
  return NextResponse.json({
    members: listWorkspaceMembers(workspace.id),
    candidates: listWorkspaceMemberCandidates(workspace.id),
    roles: ASSIGNABLE_WORKSPACE_ROLES.map((role) => ({
      value: role,
      label: workspaceRoleLabels[role]
    }))
  });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'members:manage');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const userId = typeof body.userId === 'string' ? body.userId : '';
  const role = isAssignableRole(body.role) ? body.role : null;
  if (!userId || !role) {
    return NextResponse.json(
      { error: 'validation', message: '请选择成员并指定 Workspace 角色' },
      { status: 400 }
    );
  }

  const member = addWorkspaceMember(result.context.workspace.id, userId, role);
  return NextResponse.json({ member }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'members:manage');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const memberId = typeof body.memberId === 'string' ? body.memberId : '';
  const role = isAssignableRole(body.role) ? body.role : null;
  if (!memberId || !role) {
    return NextResponse.json(
      { error: 'validation', message: '请选择成员并指定 Workspace 角色' },
      { status: 400 }
    );
  }
  if (!findWorkspaceMember(memberId, result.context.workspace.id)) {
    return NextResponse.json({ error: 'not_found', message: '成员不存在' }, { status: 404 });
  }

  const member = updateWorkspaceMemberRole(memberId, role);
  return NextResponse.json({ member });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'members:manage');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const memberId = request.nextUrl.searchParams.get('memberId') ?? '';
  if (!memberId) {
    return NextResponse.json({ error: 'validation', message: '缺少成员 ID' }, { status: 400 });
  }
  if (!findWorkspaceMember(memberId, result.context.workspace.id)) {
    return NextResponse.json({ error: 'not_found', message: '成员不存在' }, { status: 404 });
  }

  removeWorkspaceMember(memberId);
  return NextResponse.json({ ok: true });
}
