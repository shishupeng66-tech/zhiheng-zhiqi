/**
 * 服务层通用错误类型（纯逻辑，不依赖 Next.js，可被 CLI 脚本 / Route Handler 复用）。
 * 路由层通过 serviceErrorResponse（src/lib/api/error-response.ts）将其映射为对应的 HTTP 状态码。
 *
 * 设计约束：本文件严禁 import 'next/server'，否则 init-admin 等纯 Node 脚本会因加载 Next 运行时而失败。
 */

/** 资源不存在（→ 404） */
export class NotFoundError extends Error {
  constructor(message = '资源不存在') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** 操作被禁止 / 安全策略拒绝（→ 403） */
export class ForbiddenError extends Error {
  constructor(message = '操作被禁止') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** 唯一约束 / 资源冲突（→ 409），code 用于前端区分冲突类型 */
export class ConflictError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
  }
}

/** 参数校验失败（→ 400） */
export class ValidationError extends Error {
  constructor(message = '参数校验失败') {
    super(message);
    this.name = 'ValidationError';
  }
}
