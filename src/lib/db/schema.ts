import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * 角色：企业本地部署，一套给企业一家。
 * - super_admin：系统超级管理员（首个由 init-admin 脚本创建，拥有员工管理与系统设置权限）
 * - manager：部门/业务管理员
 * - employee：普通员工
 */
export const roles = ['super_admin', 'manager', 'employee'] as const;
export type Role = (typeof roles)[number];

/** 账号状态：active 可用 / disabled 停用 / deleted 已删除（软删除） */
export const statuses = ['active', 'disabled', 'deleted'] as const;
export type Status = (typeof statuses)[number];

export const workspaceStatuses = ['active', 'disabled', 'archived'] as const;
export type WorkspaceStatus = (typeof workspaceStatuses)[number];

export const workspaceTypes = [
  'enterprise-media',
  'ai-content',
  'video-production',
  'sales',
  'customer-service',
  'knowledge',
  'production-management'
] as const;
export type WorkspaceType = (typeof workspaceTypes)[number];

export const workspaceMemberRoles = ['owner', 'admin', 'editor', 'member', 'viewer'] as const;
export type WorkspaceMemberRole = (typeof workspaceMemberRoles)[number];

export const automationVideoTaskStatuses = [
  'draft',
  'generating',
  'pending_review',
  'approved',
  'failed',
  'deleted'
] as const;
export type AutomationVideoTaskStatus = (typeof automationVideoTaskStatuses)[number];

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

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    icon: text('icon'),
    workspaceType: text('workspace_type', { enum: workspaceTypes }).notNull(),
    status: text('status', { enum: workspaceStatuses }).notNull().default('active'),
    enabledModules: text('enabled_modules', { mode: 'json' }).$type<string[]>().notNull(),
    moduleConfig: text('module_config', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    slugUnique: uniqueIndex('workspaces_slug_unique').on(table.slug)
  })
);

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: workspaceMemberRoles }).notNull().default('member'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    workspaceMemberUnique: uniqueIndex('workspace_members_workspace_user_unique').on(
      table.workspaceId,
      table.userId
    )
  })
);

/**
 * 用户-工作空间关系表（user_workspaces）【预留】
 * 本轮不实现完整 Workspace 权限逻辑；仅建立与未来本地工作空间兼容的数据结构。
 * 当前 Workspace 仍依赖 Clerk Organization，不强行重写其数据模型。
 */
export const automationVideoAssets = sqliteTable('automation_video_assets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileType: text('file_type').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  status: text('status').notNull().default('available'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const automationVideoTasks = sqliteTable('automation_video_tasks', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  scriptLanguage: text('script_language').notNull(),
  keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull(),
  scriptText: text('script_text'),
  materialSource: text('material_source').notNull(),
  materialAssetIds: text('material_asset_ids', { mode: 'json' }).$type<string[]>().notNull(),
  stitchMode: text('stitch_mode').notNull(),
  transitionMode: text('transition_mode').notNull(),
  videoRatio: text('video_ratio').notNull(),
  clipDuration: text('clip_duration').notNull(),
  matchByScript: integer('match_by_script', { mode: 'boolean' }).notNull().default(true),
  voiceMode: text('voice_mode').notNull(),
  voiceService: text('voice_service').notNull(),
  voiceName: text('voice_name').notNull(),
  voiceVolume: text('voice_volume').notNull(),
  voiceSpeed: text('voice_speed').notNull(),
  musicSource: text('music_source').notNull(),
  musicVolume: integer('music_volume').notNull(),
  subtitleEnabled: integer('subtitle_enabled', { mode: 'boolean' }).notNull().default(true),
  subtitleFont: text('subtitle_font').notNull(),
  subtitlePosition: text('subtitle_position').notNull(),
  subtitleStyle: text('subtitle_style').notNull(),
  subtitleSize: text('subtitle_size').notNull(),
  subtitleColor: text('subtitle_color').notNull(),
  subtitleBackground: integer('subtitle_background', { mode: 'boolean' }).notNull().default(true),
  packagingOptions: text('packaging_options', { mode: 'json' }).$type<string[]>().notNull(),
  status: text('status', { enum: automationVideoTaskStatuses }).notNull().default('pending_review'),
  resultSummary: text('result_summary'),
  engineTaskId: text('engine_task_id'),
  engineLogPath: text('engine_log_path'),
  outputVideos: text('output_videos', { mode: 'json' }).$type<string[]>(),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

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
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
export type AutomationVideoAsset = typeof automationVideoAssets.$inferSelect;
export type NewAutomationVideoAsset = typeof automationVideoAssets.$inferInsert;
export type AutomationVideoTask = typeof automationVideoTasks.$inferSelect;
export type NewAutomationVideoTask = typeof automationVideoTasks.$inferInsert;
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

/**
 * 统一模型与接口设置中心 —— Provider 画像表
 * 每个 (module, provider) 一行，承载「是否启用 / 是否默认」等 Provider 级状态。
 * 具体键值（API Key / Base URL / Model 等）放在 provider_settings 子表。
 * secret 类值永远以加密形态入库（AES-256-GCM），绝不明文。
 */
export const settingModules = ['llm', 'voice', 'material', 'video_engine'] as const;
export type SettingModule = (typeof settingModules)[number];

export const providerProfiles = sqliteTable(
  'provider_profiles',
  {
    id: text('id').primaryKey(),
    module: text('module', { enum: settingModules }).notNull(),
    provider: text('provider').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    providerProfileUnique: uniqueIndex('provider_profiles_module_provider_unique').on(
      table.module,
      table.provider
    )
  })
);

export const providerSettings = sqliteTable(
  'provider_settings',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => providerProfiles.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** secret 类为加密后的密文；非 secret 类为明文 */
    value: text('value'),
    isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    providerSettingUnique: uniqueIndex('provider_settings_profile_key_unique').on(
      table.profileId,
      table.key
    )
  })
);

export type ProviderProfile = typeof providerProfiles.$inferSelect;
export type NewProviderProfile = typeof providerProfiles.$inferInsert;
export type ProviderSetting = typeof providerSettings.$inferSelect;
export type NewProviderSetting = typeof providerSettings.$inferInsert;
