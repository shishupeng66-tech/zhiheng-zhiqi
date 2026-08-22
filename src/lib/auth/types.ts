import type { Role, Status } from '../db/schema';

/**
 * 发送给客户端的当前用户信息（刻意剔除 passwordHash / createdAt / updatedAt 等敏感与服务端字段）。
 * 本文件只含类型，不引入任何服务端 / 原生模块，可被客户端组件安全做 `import type`。
 */
export type PublicUser = {
  id: string;
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
  /** 账号创建时间（timestamp_ms 模式，由 SQLite 映射为 Date；用于管理后台展示） */
  createdAt: Date | null;
};

/** 登录失败原因（用于前端文案） */
export type LoginError = 'not_found' | 'invalid_password' | 'disabled';
