import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * 角色：企业本地部署，一套给企业一家。
 * - super_admin：系统超级管理员（首个由 init-admin 脚本创建，拥有员工管理与系统设置权限）
 * - manager：部门/业务管理员
 * - employee：普通员工
 */
export const roles = ['super_admin', 'manager', 'employee'] as const;
export type Role = (typeof roles)[number];

/** 账号状态：active 可用 / disabled 已禁用 */
export const statuses = ['active', 'disabled'] as const;
export type Status = (typeof statuses)[number];

/**
 * 系统账号表（users）
 * 企业员工账号体系的核心表，本地 SQLite 存储，绝不依赖公网。
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    name: text('name').notNull(),
    employeeNo: text('employee_no').notNull(),
    phone: text('phone'),
    department: text('department'),
    position: text('position'),
    avatar: text('avatar'),
    /** 仅保存 bcrypt 哈希结果，禁止明文/可逆加密 */
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: roles }).notNull().default('employee'),
    status: text('status', { enum: statuses }).notNull().default('active'),
    /** 首次登录是否必须修改初始密码 */
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    usernameUnique: uniqueIndex('users_username_unique').on(table.username),
    employeeNoUnique: uniqueIndex('users_employee_no_unique').on(table.employeeNo)
  })
);

/**
 * 用户-工作空间关系表（user_workspaces）【预留】
 * 本轮不实现完整 Workspace 权限逻辑；仅建立与未来本地工作空间兼容的数据结构。
 * 当前 Workspace 仍依赖 Clerk Organization，不强行重写其数据模型。
 */
export const userWorkspaces = sqliteTable(
  'user_workspaces',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    workspaceId: text('workspace_id').notNull(),
    /** 在工作空间内的角色，例如 owner / admin / member */
    workspaceRole: text('workspace_role').notNull().default('member'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    userWorkspaceUnique: uniqueIndex('user_workspaces_user_ws_unique').on(
      table.userId,
      table.workspaceId
    )
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserWorkspace = typeof userWorkspaces.$inferSelect;
export type NewUserWorkspace = typeof userWorkspaces.$inferInsert;

/**
 * 登录会话表（sessions）
 * 本地 Session 体系：每次成功登录生成随机且不可预测的 session_token，
 * 写入 HttpOnly Cookie；中间件 / 服务端据此识别当前用户。
 * expires_at 过期即视为无效；destroySession 删除该行即完成登出。
 * session_token 使用 256bit 随机十六进制（crypto.randomBytes(32)），不可被猜测。
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    /** 随机不可预测的会话令牌，全局唯一 */
    sessionToken: text('session_token').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 会话过期时间（毫秒时间戳） */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    sessionTokenUnique: uniqueIndex('sessions_token_unique').on(table.sessionToken)
  })
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
