import type { Role, Status } from '@/lib/db/schema';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: '超级管理员',
  manager: '管理者',
  employee: '员工'
};

export const STATUS_LABELS: Record<Status, string> = {
  active: '启用',
  disabled: '停用'
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

export function statusLabel(status: Status): string {
  return STATUS_LABELS[status] ?? status;
}

export const ASSIGNABLE_ROLES: Role[] = ['super_admin', 'manager', 'employee'];
