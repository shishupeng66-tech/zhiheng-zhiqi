import { and, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
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

const enterpriseMediaWorkspaceModules = [
  'overview',
  'assets',
  'scripts',
  'ai-video',
  'projects',
  'review',
  'publish',
  'analytics',
  'members'
];

const aiContentWorkspaceModules = [
  'overview',
  'topics',
  'scripts',
  'ai-video',
  'projects',
  'review',
  'publish',
  'analytics',
  'members'
];

const enterpriseAdminPermissions = [
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
] satisfies WorkspacePermission[];

export const defaultWorkspaces = [
  {
    id: 'workspace-enterprise-media',
    name: '企业媒体空间',
    slug: 'enterprise-media',
    description: '用于企业实拍素材管理、自动剪辑、字幕配音、成片输出与历史视频沉淀。',
    icon: 'video',
    workspaceType: 'enterprise-media' as WorkspaceType,
    status: 'active' as const,
    enabledModules: enterpriseMediaWorkspaceModules,
    moduleConfig: {}
  },
  {
    id: 'workspace-ai-content',
    name: 'AI内容创作空间',
    slug: 'ai-content',
    description: '用于AI选题、爆款分析、脚本分镜、提示词管理与AI视频生成流程管理。',
    icon: 'sparkles',
    workspaceType: 'ai-content' as WorkspaceType,
    status: 'active' as const,
    enabledModules: aiContentWorkspaceModules,
    moduleConfig: {}
  }
];

function now() {
  return new Date();
}

export function ensureDefaultWorkspacesSeed() {
  const db = getDb();
  const timestamp = now();

  for (const defaultWorkspace of defaultWorkspaces) {
    const existingWorkspace = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, defaultWorkspace.slug))
      .get();

    if (!existingWorkspace) {
      db.insert(workspaces)
        .values({
          ...defaultWorkspace,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .run();
    }
  }

  return defaultWorkspaces.map(
    (defaultWorkspace) =>
      db.select().from(workspaces).where(eq(workspaces.slug, defaultWorkspace.slug)).get()!
  );
}

export function ensureDefaultWorkspaceSeed() {
  return ensureDefaultWorkspacesSeed()[0];
}

export async function getCurrentWorkspaceUser(): Promise<User | null> {
  ensureDefaultWorkspacesSeed();

  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  return getDb().select().from(users).where(eq(users.id, currentUser.id)).get() ?? null;
}

export function getWorkspaceBySlug(slug: string) {
  ensureDefaultWorkspacesSeed();
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

  return {
    user,
    workspace,
    membership,
    effectiveRole: isEnterpriseAdmin ? 'enterprise_admin' : (membership?.role ?? 'viewer'),
    permissions: isEnterpriseAdmin ? enterpriseAdminPermissions : [],
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
  return getDb()
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      updatedAt: workspaceMembers.updatedAt,
      userId: users.id,
      name: users.name,
      username: users.username,
      avatar: users.avatar,
      employeeNo: users.employeeNo,
      companyRole: users.role,
      department: users.department,
      position: users.position,
      status: users.status
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(users.status, 'deleted')))
    .all();
}

export function listWorkspaceMemberCandidates(workspaceId: string) {
  const members = getDb()
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .all();
  const memberIds = new Set(members.map((member) => member.userId));

  return getDb()
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      avatar: users.avatar,
      employeeNo: users.employeeNo,
      department: users.department,
      position: users.position,
      role: users.role,
      status: users.status
    })
    .from(users)
    .where(eq(users.status, 'active'))
    .all()
    .filter((user) => !memberIds.has(user.id));
}

export function addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceMemberRole) {
  const db = getDb();
  const existing = getWorkspaceMembership(workspaceId, userId);
  if (existing) return existing;

  const now = new Date();
  const row = db
    .insert(workspaceMembers)
    .values({
      id: randomUUID(),
      workspaceId,
      userId,
      role,
      createdAt: now,
      updatedAt: now
    })
    .returning()
    .get();
  return row;
}

export function updateWorkspaceMemberRole(memberId: string, role: WorkspaceMemberRole) {
  return (
    getDb()
      .update(workspaceMembers)
      .set({ role, updatedAt: new Date() })
      .where(eq(workspaceMembers.id, memberId))
      .returning()
      .get() ?? null
  );
}

export function removeWorkspaceMember(memberId: string) {
  getDb().delete(workspaceMembers).where(eq(workspaceMembers.id, memberId)).run();
}
