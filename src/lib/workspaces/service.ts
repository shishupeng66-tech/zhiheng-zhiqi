import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import {
  users,
  workspaces,
  workspaceMembers,
  type User,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceMemberRole,
  type WorkspaceType
} from '@/lib/db/schema';
import {
  hasEnterpriseAdminAccess,
  hasRolePermission,
  type WorkspacePermission
} from './permissions';

export type WorkspaceAccessContext = {
  user: User;
  workspace: Workspace;
  membership: WorkspaceMember | null;
  effectiveRole: WorkspaceMemberRole | 'enterprise_admin';
  permissions: WorkspacePermission[];
  isEnterpriseAdmin: boolean;
};

export type WorkspaceAccessResult =
  | { ok: true; context: WorkspaceAccessContext }
  | { ok: false; reason: 'unauthenticated' | 'not_found' | 'inactive' | 'forbidden' };

const defaultWorkspaceModules = [
  'overview',
  'assets',
  'topics',
  'scripts',
  'ai-video',
  'projects',
  'review',
  'publish',
  'analytics',
  'members'
];

export const defaultVideoWorkspace = {
  id: 'workspace-video-production',
  name: '短视频生产',
  slug: 'video-production',
  description: '企业短视频内容策划、素材管理、AI视频生产、审核发布与数据复盘工作台',
  icon: 'video',
  workspaceType: 'video-production' as WorkspaceType,
  status: 'active' as const,
  enabledModules: defaultWorkspaceModules,
  moduleConfig: {}
};

function now() {
  return new Date();
}

function placeholderPasswordHash() {
  return 'workspace-dev-auth-placeholder';
}

export async function ensureCurrentAppUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const db = getDb();
  const existing = db.select().from(users).where(eq(users.id, userId)).get();
  if (existing) return existing;

  const hasAnyUser = db.select({ id: users.id }).from(users).limit(1).get();
  const timestamp = now();
  db.insert(users)
    .values({
      id: userId,
      username: `clerk-${userId}`,
      name: '开发用户',
      employeeNo: `CLERK-${userId.slice(-8)}`,
      phone: null,
      department: '系统',
      position: '开发账号',
      avatar: null,
      passwordHash: placeholderPasswordHash(),
      role: hasAnyUser ? 'employee' : 'super_admin',
      status: 'active',
      mustChangePassword: false,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .run();

  return db.select().from(users).where(eq(users.id, userId)).get()!;
}

export function ensureDefaultWorkspaceSeed(userId?: string) {
  const db = getDb();
  const timestamp = now();
  const existingWorkspace = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, defaultVideoWorkspace.slug))
    .get();

  if (!existingWorkspace) {
    db.insert(workspaces)
      .values({
        ...defaultVideoWorkspace,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();
  }

  const workspace = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, defaultVideoWorkspace.slug))
    .get()!;

  if (!userId) return workspace;

  const memberCount = db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspace.id))
    .limit(1)
    .get();

  const existingMembership = db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)))
    .get();

  if (!existingMembership && !memberCount) {
    db.insert(workspaceMembers)
      .values({
        id: randomUUID(),
        workspaceId: workspace.id,
        userId,
        role: 'owner',
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();
  }

  return workspace;
}

export async function getCurrentWorkspaceUser() {
  const user = await ensureCurrentAppUser();
  if (user) {
    ensureDefaultWorkspaceSeed(user.id);
  } else {
    ensureDefaultWorkspaceSeed();
  }
  return user;
}

export function getWorkspaceBySlug(slug: string) {
  ensureDefaultWorkspaceSeed();
  return getDb().select().from(workspaces).where(eq(workspaces.slug, slug)).get() ?? null;
}

export function getWorkspaceMembership(workspaceId: string, userId: string) {
  return (
    getDb()
      .select()
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
      )
      .get() ?? null
  );
}

export function hasWorkspacePermission(
  user: User,
  membership: WorkspaceMember | null,
  permission: WorkspacePermission
) {
  if (hasEnterpriseAdminAccess(user.role)) return true;
  return hasRolePermission(membership?.role, permission);
}

function buildAccessContext(user: User, workspace: Workspace): WorkspaceAccessContext {
  const membership = getWorkspaceMembership(workspace.id, user.id);
  const isEnterpriseAdmin = hasEnterpriseAdminAccess(user.role);
  const permissions = isEnterpriseAdmin
    ? ([
        'workspace:view',
        'workspace:manage',
        'members:manage',
        'assets:view',
        'assets:manage',
        'topics:manage',
        'scripts:manage',
        'video:generate',
        'projects:manage',
        'review:approve',
        'publish:manage',
        'analytics:view'
      ] satisfies WorkspacePermission[])
    : [];

  return {
    user,
    workspace,
    membership,
    effectiveRole: isEnterpriseAdmin ? 'enterprise_admin' : (membership?.role ?? 'viewer'),
    permissions,
    isEnterpriseAdmin
  };
}

export async function requireWorkspaceAccess(slug: string): Promise<WorkspaceAccessResult> {
  const user = await getCurrentWorkspaceUser();
  if (!user) return { ok: false, reason: 'unauthenticated' };

  const workspace = getWorkspaceBySlug(slug);
  if (!workspace) return { ok: false, reason: 'not_found' };
  if (workspace.status !== 'active') return { ok: false, reason: 'inactive' };

  const membership = getWorkspaceMembership(workspace.id, user.id);
  if (!membership && !hasEnterpriseAdminAccess(user.role)) {
    return { ok: false, reason: 'forbidden' };
  }

  return { ok: true, context: buildAccessContext(user, workspace) };
}

export async function requireWorkspacePermission(
  slug: string,
  permission: WorkspacePermission
): Promise<WorkspaceAccessResult> {
  const result = await requireWorkspaceAccess(slug);
  if (!result.ok) return result;
  const { user, membership } = result.context;
  if (!hasWorkspacePermission(user, membership, permission)) {
    return { ok: false, reason: 'forbidden' };
  }
  return result;
}

export async function listVisibleWorkspacesForCurrentUser() {
  const user = await getCurrentWorkspaceUser();
  if (!user) return [];

  const db = getDb();
  const allWorkspaces = db.select().from(workspaces).all();

  if (hasEnterpriseAdminAccess(user.role)) {
    return allWorkspaces.map((workspace) => ({
      workspace,
      membership: getWorkspaceMembership(workspace.id, user.id),
      canEnter: workspace.status === 'active'
    }));
  }

  const memberships = db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id))
    .all();
  const byWorkspaceId = new Map(
    memberships.map((membership) => [membership.workspaceId, membership])
  );

  return allWorkspaces
    .filter((workspace) => workspace.status === 'active' && byWorkspaceId.has(workspace.id))
    .map((workspace) => ({
      workspace,
      membership: byWorkspaceId.get(workspace.id) ?? null,
      canEnter: true
    }));
}

export function listWorkspaceMembers(workspaceId: string) {
  const rows = getDb()
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      updatedAt: workspaceMembers.updatedAt,
      userId: users.id,
      name: users.name,
      username: users.username,
      department: users.department,
      position: users.position,
      status: users.status
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .all();

  return rows;
}
