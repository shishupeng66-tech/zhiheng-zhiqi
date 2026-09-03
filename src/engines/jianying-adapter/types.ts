/**
 * JianYing Adapter —— Job / Result Contract 类型。
 *
 * 版本契约（Phase C 已确认）：
 * - contractVersion: '0.1.0'（字符串，Job 与 Result 共用）
 * - timelineSchemaVersion: 2（对应的 UnifiedTimelineV2）
 *
 * 本文件是 TS 侧契约类型；Python Worker 侧（zhiheng_jianying_worker.contract）保持一致，
 * 由共享 Contract Fixtures 交叉验证。
 */
import type { UnifiedTimelineV2 } from '../zhiheng-renderer/v2-types';
import type { ErrorCode } from './errors';

// ============================================================================
// 常量
// ============================================================================

/** Job/Result 契约版本（字符串） */
export const CONTRACT_VERSION = '0.1.0';
/** 支持的 Timeline schema 版本 */
export const SUPPORTED_TIMELINE_SCHEMA_VERSION = 2;
/** Worker Python 模块入口 */
export const WORKER_PYTHON_MODULE = 'zhiheng_jianying_worker';

// ============================================================================
// PJD 版本锁定元数据（Phase C.1）
// ============================================================================

/** PJD 上游仓库（高版本 fork：aoguai/pyJianYingDraft，基于上游 c3318066 后 4 个提交） */
export const PJD_REPOSITORY = 'aoguai/pyJianYingDraft';
/** PJD 锁定完整 40 位 commit（本地锁定 fdd9c04；上游 fork commit = 4a7730c9，Phase C.2 起必须全量比较） */
export const PJD_EXPECTED_COMMIT = 'fdd9c04fd44257222aa1af45fdd7c4ac029e652e';
/** PJD 包版本（fork-v0 @ 4a7730c9） */
export const PJD_PACKAGE_VERSION = 'fork-v0@4a7730c9';
/** PJD 根目录环境变量（统一拼写，不再使用 ZHIJING_PJD_ROOT） */
export const PJD_ROOT_ENV = 'ZHIHENG_PJD_ROOT';
/** Python Worker 解释器环境变量 */
export const PYTHON_ENV = 'ZHIJING_PYTHON';

// ============================================================================
// Job Contract
// ============================================================================

/** 草稿基础信息 */
export interface DraftSpec {
  /** 剪映草稿名称（目录名） */
  name: string;
  /** 画布宽度（px） */
  width: number;
  /** 画布高度（px） */
  height: number;
  /** 帧率 */
  fps: number;
}

/** Job 选项 */
export interface JianYingJobOptions {
  /** 是否备份明文草稿（保留 draft_content.json 明文副本） */
  backupPlaintext: boolean;
  /** 出现 warning 时是否直接失败 */
  failOnWarning: boolean;
}

/** Job Contract V0.1.0 */
export interface JianYingJob {
  contractVersion: '0.1.0';
  /** 任务唯一 ID */
  jobId: string;
  timelineSchemaVersion: 2;
  /** 草稿基础信息 */
  draft: DraftSpec;
  /** UnifiedTimelineV2 */
  timeline: UnifiedTimelineV2;
  /** ResourceMap 版本引用，如 'zhiheng-resource-map.v0.1.0' */
  resourceMapRef: string;
  /** 允许的素材根目录（素材必须位于其下） */
  assetRoot: string;
  /** 目标草稿输出目录（必须为 draft root 下） */
  outputDraftDir: string;
  /** staging 目录（生成期间使用，核验后原子发布） */
  stagingRoot: string;
  /** 备份根目录（Phase C.2 起独立于 staging；backupPlaintext=true 时必填）。
   *  实际备份目录为 <backupRoot>/<jobId>/<draftName>/。 */
  backupRoot?: string;
  /** 剪映官方草稿根目录（可选）。若提供，backupRoot / outputDraftDir 不得位于其内。 */
  officialDraftRoot?: string;
  /** 日志根目录（每 job 在 <logDir>/<jobId>/ 下写日志） */
  logDir: string;
  options: JianYingJobOptions;
}

// ============================================================================
// Result Contract
// ============================================================================

/** 生成草稿的轨道摘要 */
export interface TrackSummary {
  /** 轨道类型：video / voice / subtitle / title / overlay / bgm / sfx / keyword */
  type: string;
  /** 轨道内片段数量 */
  count: number;
}

/** PJD 来源核验结果（Phase C.2 起写入 validationReport） */
export interface PjdSourceInfo {
  expectedCommit: string;
  actualCommit: string;
  repositoryRemote: string;
  /** 实际导入的 pyJianYingDraft 模块 __file__（须位于 ZHIHENG_PJD_ROOT 内） */
  moduleFile: string;
  sourceDirty: boolean;
  packageVersion: string;
  pythonVersion: string;
}

/** 草稿验证报告 */
export interface ValidationReport {
  /** 草稿目录内文件数 */
  fileCount: number;
  /** draft_content.json 是否存在 */
  hasDraftContent: boolean;
  /** draft_meta_info.json 是否存在 */
  hasDraftMetaInfo: boolean;
  /** draft_info.json 是否存在 */
  hasDraftInfo: boolean;
  /** 视频时长（秒） */
  duration: number;
  /** 验证通过 */
  passed: boolean;
  /** 验证明细 */
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  /** 实际加载的 PJD commit（Phase C.1 起写入） */
  pjdCommit?: string;
  /** 实际加载的 PJD 包版本 */
  pjdVersion?: string;
  /** PJD 来源核验明细（Phase C.2 起写入） */
  pjdSource?: PjdSourceInfo;
  /** 本次任务日志文件路径（Worker 写入） */
  logFile?: string;
  /** 明文备份 manifest 路径（backupPlaintext=true 且成功时） */
  backupManifest?: string;
}

/** Result Contract V0.1.0（成功或失败统一结构） */
export interface JianYingResult {
  contractVersion: '0.1.0';
  jobId: string;
  ok: boolean;
  /** 成功时：最终草稿目录（发布后） */
  draftDir?: string;
  /** 成功时：视频总时长（秒） */
  duration?: number;
  /** 成功时：轨道摘要 */
  tracks?: TrackSummary[];
  /** 警告列表（跳过/替换资源等） */
  warnings: string[];
  /** 是否存在需要人工复核的情况（如资源替换/跳过） */
  manualReviewRequired: boolean;
  /** 草稿验证报告 */
  validationReport: ValidationReport;
  /** 失败时：错误信息 */
  error?: { code: ErrorCode; message: string };
}

// ============================================================================
// Worker 协议
// ============================================================================

/** Worker 进程退出信息 */
export interface WorkerExitInfo {
  exitCode: number | null;
  timedOut: boolean;
  stderrTail: string;
}
