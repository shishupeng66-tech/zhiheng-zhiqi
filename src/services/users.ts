import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../lib/db';
import { users, type Role, type Status } from '../lib/db/schema';
import { hashPassword } from '../lib/auth/password';

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
