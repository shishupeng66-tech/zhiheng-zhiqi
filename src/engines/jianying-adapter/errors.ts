/**
 * JianYing Adapter —— 错误码与错误类型。
 *
 * 错误码与 Python Worker（zhiheng_jianying_worker.errors）保持一致，
 * 由共享 Contract Fixtures 交叉验证防止漂移。
 */

/** 统一错误码（TS 侧权威定义；Python 侧用相同字符串） */
export const ErrorCode = {
  /** Job JSON 结构无效 */
  JOB_INVALID: 'JOB_INVALID',
  /** contractVersion 不被支持 */
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  /** timelineSchemaVersion 不被支持 */
  UNSUPPORTED_TIMELINE_VERSION: 'UNSUPPORTED_TIMELINE_VERSION',
  /** Timeline 使用了执行器不支持的能力 */
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
  /** 素材文件不存在或无法定位 */
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  /** 路径超出允许的 asset root / draft root */
  PATH_OUTSIDE_ALLOWED_ROOT: 'PATH_OUTSIDE_ALLOWED_ROOT',
  /** 目标草稿目录已存在 */
  TARGET_ALREADY_EXISTS: 'TARGET_ALREADY_EXISTS',
  /** 必需包装资源缺失（ResourceMap） */
  RESOURCE_MISSING: 'RESOURCE_MISSING',
  /** 草稿写入失败 */
  DRAFT_WRITE_FAIL: 'DRAFT_WRITE_FAIL',
  /** PJD 内部错误 */
  PJD_ERROR: 'PJD_ERROR',
  /** 加载的 PJD 版本与锁定版本不匹配 */
  PJD_VERSION_MISMATCH: 'PJD_VERSION_MISMATCH',
  /** PJD 仓库存在已跟踪源码被修改/删除/新增到索引（Phase C.2） */
  PJD_SOURCE_DIRTY: 'PJD_SOURCE_DIRTY',
  /** Worker 执行超时 */
  TIMEOUT: 'TIMEOUT',
  /** Worker 协议错误（stdout 非单个 Result JSON / 进程异常退出） */
  WORKER_PROTOCOL_ERROR: 'WORKER_PROTOCOL_ERROR',
  /** failOnWarning 为 true 且出现 warning 时主动失败 */
  FAIL_ON_WARNING: 'FAIL_ON_WARNING',
  /** 未知错误 */
  UNKNOWN: 'UNKNOWN'
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 所有合法错误码列表（供校验） */
export const ERROR_CODE_LIST: readonly string[] = Object.values(ErrorCode);

/** Job/Result 错误对象 */
export interface ContractError {
  code: ErrorCode;
  message: string;
}

/** Adapter 抛出的业务异常 */
export class JianYingAdapterError extends Error {
  readonly code: ErrorCode;
  readonly jobId?: string;

  constructor(code: ErrorCode, message: string, jobId?: string) {
    super(message);
    this.name = 'JianYingAdapterError';
    this.code = code;
    this.jobId = jobId;
  }
}
