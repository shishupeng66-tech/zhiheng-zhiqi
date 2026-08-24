import type { Role, WorkspaceMemberRole } from '@/lib/db/schema';

export const workspacePermissions = [
  'workspace:view',
  'workspace:manage',
  'members:manage',
  'assets:view',
  'assets:manage',
  'topics:manage',
  'scripts:manage',
  'voices:manage',
  'video:generate',
  'projects:manage',
  'review:approve',
  'publish:manage',
  'analytics:view'
] as const;

export type WorkspacePermission = (typeof workspacePermissions)[number];

const allPermissions = [...workspacePermissions];

export const rolePermissionMap: Record<WorkspaceMemberRole, WorkspacePermission[]> = {
  owner: allPermissions,
  admin: allPermissions,
  editor: [
    'workspace:view',
    'assets:view',
    'assets:manage',
    'topics:manage',
    'scripts:manage',
    'video:generate',
    'projects:manage',
    'review:approve',
    'analytics:view'
  ],
  member: [
    'workspace:view',
    'assets:view',
    'topics:manage',
    'scripts:manage',
    'video:generate',
    'projects:manage',
    'analytics:view'
  ],
  viewer: ['workspace:view', 'assets:view', 'analytics:view']
};

export const workspaceRoleLabels: Record<WorkspaceMemberRole, string> = {
  owner: '所有者',
  admin: '管理员',
  editor: '编辑者',
  member: '成员',
  viewer: '只读'
};

export function hasRolePermission(
  role: WorkspaceMemberRole | null | undefined,
  permission: WorkspacePermission
) {
  if (!role) return false;
  return rolePermissionMap[role]?.includes(permission) ?? false;
}

export function hasEnterpriseAdminAccess(role: Role | null | undefined) {
  return role === 'super_admin';
}
