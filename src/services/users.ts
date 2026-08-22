import { and, desc, eq, like, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../lib/db';
import {
  userWorkspaces,
  users,
  workspaceMembers,
  type Role,
  type Status,
  type User
} from '../lib/db/schema';
import { hashPassword } from '../lib/auth/password';
import { deleteUserSessions as deleteUserSessionsFromSession } from '../lib/auth/session';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

export type CreateUserInput = {
  username: string;
  name: string;
  employeeNo: string;
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
  username: string;
  name: string;
  employeeNo: string;
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

export type CreateEmployeeInput = {
  username: string;
  name: string;
  employeeNo: string;
  password: string;
  role?: Role;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  avatar?: string | null;
  status?: Status;
  mustChangePassword?: boolean;
};

export type UpdateEmployeeInput = Partial<{
  username: string;
  name: string;
  employeeNo: string;
  phone: string | null;
  department: string | null;
  position: string | null;
  avatar: string | null;
}>;

export type Actor = { id: string; role: Role };

export async function listUsers(opts?: {
  role?: Role;
  status?: Status;
  includeDeleted?: boolean;
}): Promise<User[]> {
  const conditions = [];
  if (opts?.role) conditions.push(eq(users.role, opts.role));
  if (opts?.status) conditions.push(eq(users.status, opts.status));
  if (!opts?.status && !opts?.includeDeleted) conditions.push(ne(users.status, 'deleted'));
  return getDb()
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .all();
}

export async function searchUsers(opts: {
  q?: string;
  role?: Role;
  status?: Status;
  includeDeleted?: boolean;
}): Promise<User[]> {
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
  if (!opts.status && !opts.includeDeleted) conditions.push(ne(users.status, 'deleted'));
  return getDb()
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .all();
}

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

export async function updateEmployee(id: string, patch: UpdateEmployeeInput): Promise<User> {
  const target = await findUserById(id);
  if (!target) throw new NotFoundError('员工不存在');

  const next: UpdateUserInput = {};

  if (patch.username !== undefined) {
    const username = patch.username.trim();
    if (!username) throw new ValidationError('登录账号不能为空');
    if (username !== target.username) {
      const existing = await findUserByUsername(username);
      if (existing && existing.id !== id) {
        throw new ConflictError('username_exists', '该登录账号已存在');
      }
    }
    next.username = username;
  }

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new ValidationError('姓名不能为空');
    next.name = name;
  }

  if (patch.employeeNo !== undefined) {
    const employeeNo = patch.employeeNo.trim();
    if (!employeeNo) throw new ValidationError('工号不能为空');
    if (employeeNo !== target.employeeNo) {
      const existing = await findUserByEmployeeNo(employeeNo);
      if (existing && existing.id !== id) {
        throw new ConflictError('employeeNo_exists', '该工号已存在');
      }
    }
    next.employeeNo = employeeNo;
  }

  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.department !== undefined) next.department = patch.department;
  if (patch.position !== undefined) next.position = patch.position;
  if (patch.avatar !== undefined) next.avatar = patch.avatar;

  const updated = await updateUser(id, next);
  if (!updated) throw new NotFoundError('员工不存在');
  return updated;
}

export async function setUserStatus(id: string, status: Status, actor: Actor): Promise<User> {
  const target = await findUserById(id);
  if (!target) throw new NotFoundError('员工不存在');

  if (status === 'disabled' && target.role === 'super_admin' && actor.id === id) {
    throw new ForbiddenError('超级管理员不能停用自己。');
  }
  if (status === 'disabled' && target.role === 'super_admin') {
    const active = await countActiveSuperAdmins();
    if (active <= 1) {
      throw new ForbiddenError('系统必须至少保留一个启用状态的超级管理员。');
    }
  }

  const updated = await updateUser(id, { status });
  if (!updated) throw new NotFoundError('员工不存在');
  if (status !== 'active') {
    await deleteUserSessionsFromSession(id);
  }
  return updated;
}

export async function deleteEmployee(id: string, actor: Actor): Promise<User> {
  const target = await findUserById(id);
  if (!target) throw new NotFoundError('员工不存在');

  if (actor.id === id) {
    throw new ForbiddenError('不能删除自己的账号。');
  }
  if (target.role === 'super_admin') {
    const active = await countActiveSuperAdmins();
    if (target.status === 'active' && active <= 1) {
      throw new ForbiddenError('系统必须至少保留一个启用状态的超级管理员。');
    }
  }

  await deleteUserSessionsFromSession(id);
  await getDb().delete(workspaceMembers).where(eq(workspaceMembers.userId, id));
  await getDb().delete(userWorkspaces).where(eq(userWorkspaces.userId, id));

  const updated = await updateUser(id, { status: 'deleted', mustChangePassword: false });
  if (!updated) throw new NotFoundError('员工不存在');
  return updated;
}

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

  await deleteUserSessionsFromSession(id);
  return row;
}

export async function countActiveSuperAdmins(): Promise<number> {
  const rows = getDb()
    .select({ value: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, 'super_admin'), eq(users.status, 'active')))
    .all();
  return Number(rows[0]?.value ?? 0);
}

export async function deleteUserSessions(userId: string): Promise<void> {
  return deleteUserSessionsFromSession(userId);
}
