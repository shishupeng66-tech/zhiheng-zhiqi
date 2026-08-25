export type ServiceStatus = 'online' | 'offline' | 'starting' | 'error';

export interface ServiceHealth {
  status: ServiceStatus;
  latencyMs: number | null;
  metrics?: Record<string, string | number | boolean | null>;
  error?: string;
}

/**
 * 服务定义：V1 只满足 Voice Service 闭环。
 * 字段全部按未来扩展设计：新增视频/AI/知识库服务只需新增 ServiceDefinition 对象即可。
 */
export interface ServiceDefinition {
  id: string;
  displayName: string;
  /** 异常时显示给用户的功能名称，比如"语音能力"而不是"Voice Service" */
  capabilityName: string;
  description?: string;
  icon?: string;

  health: {
    endpoint: string;
    timeoutMs?: number;
    extractMetrics?: (res: Response) => Promise<Record<string, unknown>>;
  };

  start: {
    method: 'ps1-file';
    scriptFile: string;
    startTimeoutMs?: number;
    port?: number;
  };

  developerCommands: {
    manualStart: string;
    process?: string;
  };
}
