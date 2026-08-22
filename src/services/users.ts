import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../lib/db';
import { users, type Role, type Status, type User } from '../lib/db/schema';
import { hashPassword } from '../lib/auth/password';
import { deleteUserSessions as deleteUserSessionsFromSession } from '../lib/auth/session';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

export type CreateUserInput = {
  username: string;
  name: string;
  employeeNo: string;
  /** 明文密码，函数内部哈希后入库 */
  password: string;
  role?: Role;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  avatar?: string | null;
  status?: Status;
  mustChangePassword?: boolean;
};

export type UpdateUserInput = Partial<{
  name: string;
  phone: string | null;
  department: string | null;
  position: string | null;
  avatar: string | null;
  role: Role;
  status: Status;
  mustChangePassword: boolean;
}>;

export async function findUserByUsername(username: string) {
  return getDb().select().from(users).where(eq(users.username, username)).get();
}

export async function findUserByEmployeeNo(employeeNo: string) {
  return getDb().select().from(users).where(eq(users.employeeNo, employeeNo)).get();
}

export async function findUserById(id: string) {
  return getDb().select().from(users).where(eq(users.id, id)).get();
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const [row] = await getDb()
    .insert(users)
    .values({
      id: randomUUID(),
      username: input.username,
      name: input.name,
      employeeNo: input.employeeNo,
      phone: input.phone ?? null,
      department: input.department ?? null,
      position: input.position ?? null,
      avatar: input.avatar ?? null,
      passwordHash,
      role: input.role ?? 'employee',
      status: input.status ?? 'active',
      mustChangePassword: input.mustChangePassword ?? true,
      createdAt: now,
      updatedAt: now
    })
    .returning();
  return row;
}

export async function updateUser(id: string, patch: UpdateUserInput) {
  const [row] = await getDb()
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function disableUser(id: string) {
  return updateUser(id, { status: 'disabled' });
}

export async function enableUser(id: string) {
  return updateUser(id, { status: 'active' });
}

export async function updatePassword(id: string, newPlainPassword: string) {
  const passwordHash = await hashPassword(newPlainPassword);
  const [row] = await getDb()
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

// ============================================================
// Phase 4 — 员工管理 / 角色权限 相关能力
// ============================================================

/** 新建员工入参（管理员在「员工管理」中创建） */
export type CreateEmployeeInput = {
  username: string;
  name: string;
  employeeNo: string;
  /** 明文初始密码，函数内部哈希后入库 */
  password: string;
  role?: Role;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  avatar?: string | null;
  status?: Status;
  /** 是否要求首次登录改密（默认 true） */
  mustChangePassword?: boolean;
};

/** 编辑员工资料入参（不含角色/状态，二者走独立安全接口） */
export type UpdateEmployeeInput = Partial<{
  name: string;
  phone: string | null;
  department: string | null;
  position: string | null;
  avatar: string | null;
}>;

/** 执行操作的主体（当前登录的超级管理员） */
export type Actor = { id: string; role: Role };

/** 列出员工（可按角色 / 状态过滤），按创建时间倒序 */
export async function listUsers(opts?: { role?: Role; status?: Status }): Promise<User[]> {
  const conditions = [];
  if (opts?.role) conditions.push(eq(users.role, opts.role));
  if (opts?.status) conditions.push(eq(users.status, opts.status));
  return getDb()
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .all();
}

/** 搜索员工（姓名 / 登录账号 / 工号，可选角色 / 状态过滤） */
export async function searchUsers(opts: {
  q?: string;
  role?: Role;
  status?: Status;
}): Promise<User[]> {
  // 去除会影响 LIKE 语义的元字符，避免注入与意外通配
  const q = opts.q?.trim().replace(/[%_\\]/g, '');
  const conditions = [];
  if (q) {
    conditions.push(
      or(
        like(users.name, `%${q}%`),
        like(users.username, `%${q}%`),
        like(users.employeeNo, `%${q}%`)
      )
    );
  }
  if (opts.role) conditions.push(eq(users.role, opts.role));
  if (opts.status) conditions.push(eq(users.status, opts.status));
  return getDb()
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .all();
}

/**
 * 新建员工账号。唯一性冲突（登录账号 / 工号）以友好中文文案返回（ConflictError → 409）。
 */
export async function createEmployee(input: CreateEmployeeInput): Promise<User> {
  const username = input.username.trim();
  const name = input.name.trim();
  const employeeNo = input.employeeNo.trim();

  if (!username) throw new ValidationError('登录账号不能为空');
  if (!name) throw new ValidationError('姓名不能为空');
  if (!employeeNo) throw new ValidationError('工号不能为空');
  if (!input.password || input.password.length < 6) {
    throw new ValidationError('初始密码至少 6 位');
  }

  if (await findUserByUsername(username)) {
    throw new ConflictError('username_exists', '该登录账号已存在');
  }
  if (await findUserByEmployeeNo(employeeNo)) {
    throw new ConflictError('employeeNo_exists', '该工号已存在');
  }

  return createUser({
    username,
    name,
    employeeNo,
    password: input.password,
    role: input.role ?? 'employee',
    phone: input.phone ?? null,
    department: input.department ?? null,
    position: input.position ?? null,
    avatar: input.avatar ?? null,
    status: input.status ?? 'active',
    mustChangePassword: input.mustChangePassword ?? true
  });
}

/**
 * 编辑员工资料（姓名 / 手机号 / 部门 / 岗位 / 头像）。
 * 角色与状态不在此处处理，走 setUserRole / setUserStatus 以保证安全校验集中。
 */
export async function updateEmployee(id: string, patch: UpdateEmployeeInput): Promise<User> {
  const target = await findUserById(id);
  if (!target) throw new NotFoundError('员工不存在');

  const next: UpdateUserInput = {};
  if (patch.name !== undefined) next.name = patch.name.trim() || target.name;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.department !== undefined) next.department = patch.department;
  if (patch.position !== undefined) next.position = patch.position;
  if (patch.avatar !== undefined) next.avatar = patch.avatar;

  const updated = await updateUser(id, next);
  if (!updated) throw new NotFoundError('员工不存在');
  return updated;
}

/**
 * 设置员工状态（启用 / 禁用）。
 * 安全规则：
 * - 超级管理员不能禁用自己；
 * - 禁用某超级管理员前，系统必须至少保留 1 个启用状态的超级管理员。
 */
export async function setUserStatus(id: string, status: Status, actor: Actor): Promise<User> {
  const target = await findUserById(id);
  if (!target) throw new NotFoundError('员工不存在');

  if (status === 'disabled' && target.role === 'super_admin' && actor.id === id) {
    throw new ForbiddenError('超级管理员不能禁用自己。');
  }
  if (status === 'disabled' && target.role === 'super_admin') {
    const active = await countActiveSuperAdmins();
    if (active <= 1) {
      throw new ForbiddenError('系统必须至少保留一个启用状态的超级管理员。');
    }
  }

  const updated = await updateUser(id, { status });
  if (!updated) throw new NotFoundError('员工不存在');
  return updated;
}

/**
 * 设置员工角色。
 * 安全规则：
 * - 超级管理员不能把自己的角色降级为非超级管理员；
 * - 将某超级管理员降级前，系统必须至少保留 1 个启用状态的超级管理员。
 */
export async function setUserRole(id: string, role: Role, actor: Actor): Promise<User> {
  const target = await findUserById(id);
  if (!target) throw new NotFoundError('员工不存在');

  if (actor.id === id && target.role === 'super_admin' && role !== 'super_admin') {
    throw new ForbiddenError('超级管理员不能修改自己的角色。');
  }
  if (target.role === 'super_admin' && role !== 'super_admin') {
    const active = await countActiveSuperAdmins();
    if (active <= 1) {
      throw new ForbiddenError('系统必须至少保留一个启用状态的超级管理员。');
    }
  }

  const updated = await updateUser(id, { role });
  if (!updated) throw new NotFoundError('员工不存在');
  return updated;
}

/**
 * 管理员重置员工密码。重置后该员工全部会话失效（含其他设备），
 * 且 mustChangePassword 置为 true（下次登录须重新设置密码）。
 */
export async function resetUserPassword(id: string, newPlainPassword: string): Promise<User> {
  if (!newPlainPassword || newPlainPassword.length < 6) {
    throw new ValidationError('新密码至少 6 位');
  }
  const target = await findUserById(id);
  if (!target) throw new NotFoundError('员工不存在');

  const passwordHash = await hashPassword(newPlainPassword);
  const [row] = await getDb()
    .update(users)
    .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  if (!row) throw new NotFoundError('员工不存在');

  // 使该用户全部会话失效，确保新密码立即生效、旧会话不可用
  await deleteUserSessionsFromSession(id);
  return row;
}

/** 统计当前启用状态的超级管理员数量（用于安全护栏） */
export async function countActiveSuperAdmins(): Promise<number> {
  const rows = getDb()
    .select({ value: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, 'super_admin'), eq(users.status, 'active')))
    .all();
  return Number(rows[0]?.value ?? 0);
}

/** 删除某用户的全部会话（按 userId 整批清除），供上层在禁用 / 重置密码时调用 */
export async function deleteUserSessions(userId: string): Promise<void> {
  return deleteUserSessionsFromSession(userId);
}
