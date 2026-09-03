/**
 * JianYing Adapter —— 主流程。
 *
 * 链路（Phase C 已确认，方案 A）：
 *   TS JianYingAdapter
 *     → JSON Contract（stdin，UTF-8）
 *     → Python CLI Worker（python -m zhiheng_jianying_worker）
 *     → PJD
 *     → 剪映草稿目录
 *
 * Adapter 职责：
 * - 接收 UnifiedTimelineV2
 * - 静态校验（schema / capability / ResourceMap / 路径）
 * - 组装 Job Contract
 * - 通过 stdin 调用 Python Worker
 * - 解析唯一 Result JSON
 * - 处理超时与进程退出
 *
 * 不直接 import 或操作 PJD。
 * 不直接调用剪映 GUI。
 * 不在正式草稿目录留下半成品（staging → 原子发布由 Worker 保证）。
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { UnifiedTimelineV2Schema } from '../zhiheng-renderer/v2-types';
import { ErrorCode } from './errors';
import type { AdapterCapabilities } from './capabilities';
import { JIANYING_ADAPTER_CAPABILITIES } from './capabilities';
import { RESOURCE_MAP_REF } from './resource-map-data';
import { validateForGeneration, checkRootPaths, validateDraftPaths } from './validator';
import { callWorker, defaultLogDir, type WorkerClientOptions } from './worker-client';
import { parseJob } from './contract';
import * as contractTypes from './types';
import type { JianYingJob, JianYingJobOptions, JianYingResult } from './types';
import type { UnifiedTimelineV2 } from '../zhiheng-renderer/v2-types';

const CONTRACT_VERSION = contractTypes.CONTRACT_VERSION;
const SUPPORTED_TIMELINE_SCHEMA_VERSION = contractTypes.SUPPORTED_TIMELINE_SCHEMA_VERSION;

/** Adapter 配置 */
export interface JianYingAdapterOptions extends WorkerClientOptions {
  /** 允许的素材根目录（素材必须位于其下） */
  assetRoot: string;
  /** 草稿输出根目录（剪映草稿父目录；staging 也在其下） */
  draftRoot: string;
  /** 备份根目录（Phase C.2：backupPlaintext=true 时必填；独立于 staging） */
  backupRoot?: string;
  /** 剪映官方草稿根目录（可选；backupRoot / outputDraftDir 不得位于其内） */
  officialDraftRoot?: string;
}

/** 生成草稿请求 */
export interface GenerateDraftRequest {
  /** 剪映草稿名称（目录名；不能与现有草稿重名） */
  draftName: string;
  /** UnifiedTimelineV2 */
  timeline: UnifiedTimelineV2;
  /** 任务 ID；缺省自动生成 */
  jobId?: string;
  /** ResourceMap 版本引用；缺省用 RESOURCE_MAP_REF */
  resourceMapRef?: string;
  /** Job 选项 */
  options?: Partial<JianYingJobOptions>;
}

/** 空 Result（错误路径通用） */
function errorResult(jobId: string, code: ErrorCode, message: string): JianYingResult {
  return {
    contractVersion: CONTRACT_VERSION,
    jobId,
    ok: false,
    warnings: [],
    manualReviewRequired: false,
    validationReport: {
      fileCount: 0,
      hasDraftContent: false,
      hasDraftMetaInfo: false,
      hasDraftInfo: false,
      duration: 0,
      passed: false,
      checks: []
    },
    error: { code, message }
  };
}

/** JianYing Adapter */
export class JianYingAdapter {
  private readonly options: JianYingAdapterOptions;

  constructor(options: JianYingAdapterOptions) {
    this.options = { ...options };
  }

  /** 能力声明（剪映执行器能力） */
  getCapabilities(): AdapterCapabilities {
    return JIANYING_ADAPTER_CAPABILITIES;
  }

  /**
   * 生成剪映草稿（最小闭环）。
   * 全程不写剪映官方草稿目录（outputDraftDir 由调用方指定为安全测试根）不启动剪映。
   */
  async generateDraft(request: GenerateDraftRequest): Promise<JianYingResult> {
    const jobId = request.jobId ?? `pjd-${Date.now()}-${randomUUID().slice(0, 8)}`;

    // 1. Timeline schema 校验（V2）
    const tlParse = UnifiedTimelineV2Schema.safeParse(request.timeline);
    if (!tlParse.success) {
      const first = tlParse.error.issues[0];
      return errorResult(
        jobId,
        ErrorCode.JOB_INVALID,
        `Timeline 无效：${first ? first.path.join('.') + ': ' + first.message : '未知结构错误'}`
      );
    }
    const timeline = tlParse.data;

    // 2. 静态校验（capability / ResourceMap / 素材引用）
    const v = validateForGeneration(timeline);
    if (v.errors.length > 0) {
      return errorResult(jobId, v.errors[0].code, v.errors.map((e) => e.message).join('; '));
    }

    // 3. 路径存在性 / 边界校验
    const rootErr = checkRootPaths(this.options.assetRoot, this.options.draftRoot);
    if (rootErr) return errorResult(jobId, rootErr.code, rootErr.message);

    const draftName = request.draftName;
    const outputDraftDir = path.join(this.options.draftRoot, draftName);
    const stagingRoot = path.join(this.options.draftRoot, '.staging', jobId);
    const pathErr = validateDraftPaths(this.options.draftRoot, outputDraftDir, stagingRoot);
    if (pathErr) return errorResult(jobId, pathErr.code, pathErr.message);

    const wantBackup = request.options?.backupPlaintext ?? true;
    const backupRoot = this.options.backupRoot;
    if (wantBackup && !backupRoot) {
      return errorResult(
        jobId,
        ErrorCode.PATH_OUTSIDE_ALLOWED_ROOT,
        'backupPlaintext=true 时必须在 Adapter options 中配置 backupRoot（独立于 staging）'
      );
    }
    // Phase C.2：backupRoot 不得位于 stagingRoot 内、不得位于官方草稿目录内
    if (backupRoot) {
      const br = path.resolve(backupRoot);
      const sr = path.resolve(stagingRoot);
      if (br === sr || br.startsWith(sr + path.sep) || sr.startsWith(br + path.sep)) {
        return errorResult(
          jobId,
          ErrorCode.PATH_OUTSIDE_ALLOWED_ROOT,
          'backupRoot 不得位于 stagingRoot 内或与之重合'
        );
      }
      if (this.options.officialDraftRoot) {
        const odr = path.resolve(this.options.officialDraftRoot);
        if (br === odr || br.startsWith(odr + path.sep)) {
          return errorResult(
            jobId,
            ErrorCode.PATH_OUTSIDE_ALLOWED_ROOT,
            'backupRoot 不得位于剪映官方草稿目录内'
          );
        }
      }
    }

    // 4. 组装 Job
    const job: JianYingJob = {
      contractVersion: CONTRACT_VERSION,
      jobId,
      timelineSchemaVersion: SUPPORTED_TIMELINE_SCHEMA_VERSION,
      draft: {
        name: draftName,
        width: timeline.outputProfile.width,
        height: timeline.outputProfile.height,
        fps: timeline.outputProfile.targetFps
      },
      timeline,
      resourceMapRef: request.resourceMapRef ?? RESOURCE_MAP_REF,
      assetRoot: this.options.assetRoot,
      outputDraftDir,
      stagingRoot,
      ...(backupRoot ? { backupRoot } : {}),
      ...(this.options.officialDraftRoot
        ? { officialDraftRoot: this.options.officialDraftRoot }
        : {}),
      logDir: this.options.logDir ?? defaultLogDir(),
      options: {
        backupPlaintext: wantBackup,
        failOnWarning: request.options?.failOnWarning ?? false
      }
    };

    // 5. Job Contract 双重校验
    const parsed = parseJob(job);
    if ('error' in parsed) {
      return errorResult(jobId, parsed.error.code, parsed.error.message);
    }

    // 6. 调用 Python Worker
    const { result } = await callWorker(job, this.options);
    return result;
  }
}
