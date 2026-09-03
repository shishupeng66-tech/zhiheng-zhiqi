/**
 * JianYing Adapter —— 知衡智企剪映执行器模块入口（Phase C 最小闭环）。
 *
 * 链路：
 *   TS JianYingAdapter → JSON Contract（stdin）→ Python CLI Worker → PJD → 剪映草稿
 *
 * 本模块不直接 import PJD，不直接操作剪映 GUI。
 * PJD 为外部 clone（不提交 Git），通过 PYTHONPATH / ZHIJING_PJD_ROOT 注入 Worker。
 */

// 契约
export {
  CONTRACT_VERSION,
  SUPPORTED_TIMELINE_SCHEMA_VERSION,
  WORKER_PYTHON_MODULE,
  JianYingJobSchema,
  JianYingResultSchema,
  parseJob,
  parseResult,
  fixturesDir,
  loadFixture,
  SHARED_FIXTURE_FILES
} from './contract';
export type {
  DraftSpec,
  JianYingJob,
  JianYingJobOptions,
  JianYingResult,
  TrackSummary,
  ValidationReport,
  WorkerExitInfo
} from './types';

// 错误
export { ErrorCode, ERROR_CODE_LIST, JianYingAdapterError, type ContractError } from './errors';

// 能力
export {
  JIANYING_ADAPTER_CAPABILITIES,
  validateTimelineCapabilities,
  type AdapterCapabilities
} from './capabilities';

// ResourceMap
export {
  RESOURCE_MAP_REF,
  RESOURCE_MAP_V0,
  getResourceEntry,
  getResourceEntriesByType,
  getAllResourceEntries
} from './resource-map-data';
export {
  resolveResource,
  collectTimelineStyleIds,
  type ResourceMap,
  type ResourceMapEntry,
  type ResourceResolveResult,
  type ResourceType
} from './resource-map';

// Adapter 静态校验
export {
  validateForGeneration,
  checkRootPaths,
  validateDraftPaths,
  isPathWithin,
  type AdapterValidationResult
} from './validator';

// Worker 客户端
export { callWorker, type WorkerCallResult, type WorkerClientOptions } from './worker-client';

// Adapter 主流程
export { JianYingAdapter, type JianYingAdapterOptions, type GenerateDraftRequest } from './adapter';
