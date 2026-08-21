import type { Role, Status } from '@/lib/db/schema';

/** 角色中文名（全局统一，避免各处文案不一致） */
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: '超级管理员',
  manager: '管理层',
  employee: '员工'
};

/** 账号状态中文名 */
export const STATUS_LABELS: Record<Status, string> = {
  active: '启用',
  disabled: '禁用'
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

export function statusLabel(status: Status): string {
  return STATUS_LABELS[status] ?? status;
}

/** 可被管理员在「新建/编辑」时授予的角色（不含限制项，super_admin 可由管理员显式创建） */
export const ASSIGNABLE_ROLES: Role[] = ['super_admin', 'manager', 'employee'];
