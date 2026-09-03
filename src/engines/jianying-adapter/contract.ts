/**
 * JianYing Adapter —— Contract 解析与共享 Fixtures。
 *
 * Job/Result 用 zod 校验，保证 TS 侧结构完整性。
 * 共享 Contract Fixtures 放在 __fixtures__/ 下，TS 与 Python Worker 交叉验证用。
 */
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { UnifiedTimelineV2Schema } from '../zhiheng-renderer/v2-types';
import { ErrorCode, ERROR_CODE_LIST, type ContractError } from './errors';
// 使用 namespace import + 显式取值，避免 esbuild/tsx 将命名导入值绑定转为 undefined
import * as contractTypes from './types';
import type { JianYingJob, JianYingResult } from './types';

// 常量统一来自 types.ts（单一事实源），这里显式取值并 re-export
export const CONTRACT_VERSION = contractTypes.CONTRACT_VERSION;
export const SUPPORTED_TIMELINE_SCHEMA_VERSION = contractTypes.SUPPORTED_TIMELINE_SCHEMA_VERSION;
export const WORKER_PYTHON_MODULE = contractTypes.WORKER_PYTHON_MODULE;

// ============================================================================
// Job zod schema
// ============================================================================

const DraftSpecSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive()
});

const JobOptionsSchema = z.object({
  backupPlaintext: z.boolean().default(false),
  failOnWarning: z.boolean().default(false)
});

/** Job Contract 校验 schema */
export const JianYingJobSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    jobId: z.string().min(1),
    timelineSchemaVersion: z.literal(SUPPORTED_TIMELINE_SCHEMA_VERSION),
    draft: DraftSpecSchema,
    timeline: UnifiedTimelineV2Schema,
    resourceMapRef: z.string().min(1),
    assetRoot: z.string().min(1),
    outputDraftDir: z.string().min(1),
    stagingRoot: z.string().min(1),
    backupRoot: z.string().min(1).optional(),
    officialDraftRoot: z.string().min(1).optional(),
    logDir: z.string().min(1),
    options: JobOptionsSchema
  })
  // Phase C.2：backupPlaintext=true 时 backupRoot 必填
  .refine((j) => !j.options.backupPlaintext || !!j.backupRoot, {
    path: ['backupRoot'],
    message: 'backupPlaintext=true 时 backupRoot 必填'
  });

/** Result Contract 校验 schema */
export const JianYingResultSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  jobId: z.string().min(1),
  ok: z.boolean(),
  draftDir: z.string().optional(),
  duration: z.number().optional(),
  tracks: z.array(z.object({ type: z.string(), count: z.number() })).optional(),
  warnings: z.array(z.string()).default([]),
  manualReviewRequired: z.boolean().default(false),
  validationReport: z.object({
    fileCount: z.number(),
    hasDraftContent: z.boolean(),
    hasDraftMetaInfo: z.boolean(),
    hasDraftInfo: z.boolean(),
    duration: z.number(),
    passed: z.boolean(),
    checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().optional() })),
    pjdCommit: z.string().optional(),
    pjdVersion: z.string().optional(),
    pjdSource: z
      .object({
        expectedCommit: z.string(),
        actualCommit: z.string(),
        repositoryRemote: z.string(),
        moduleFile: z.string(),
        sourceDirty: z.boolean(),
        packageVersion: z.string(),
        pythonVersion: z.string()
      })
      .optional(),
    logFile: z.string().optional(),
    backupManifest: z.string().optional()
  }),
  error: z
    .object({
      code: z.enum(ERROR_CODE_LIST as [string, ...string[]]),
      message: z.string()
    })
    .optional()
});

/** 解析并校验 Job JSON（返回错误码而非抛未知异常） */
export function parseJob(input: unknown): { job: JianYingJob } | { error: ContractError } {
  if (typeof input !== 'object' || input === null) {
    return { error: { code: ErrorCode.JOB_INVALID, message: 'Job 必须是 JSON 对象' } };
  }
  const raw = input as Record<string, unknown>;
  // 版本错误优先于结构错误（仅当版本字段存在但不被支持时；缺失字段归 JOB_INVALID）
  if (raw.contractVersion !== undefined && raw.contractVersion !== CONTRACT_VERSION) {
    return {
      error: {
        code: ErrorCode.UNSUPPORTED_CONTRACT_VERSION,
        message: `不支持的 contractVersion: ${String(raw.contractVersion)}（期望 ${CONTRACT_VERSION}）`
      }
    };
  }
  if (
    raw.timelineSchemaVersion !== undefined &&
    raw.timelineSchemaVersion !== SUPPORTED_TIMELINE_SCHEMA_VERSION
  ) {
    return {
      error: {
        code: ErrorCode.UNSUPPORTED_TIMELINE_VERSION,
        message: `不支持的 timelineSchemaVersion: ${String(raw.timelineSchemaVersion)}（期望 ${SUPPORTED_TIMELINE_SCHEMA_VERSION}）`
      }
    };
  }
  const parsed = JianYingJobSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: {
        code: ErrorCode.JOB_INVALID,
        message: `Job 无效：${first ? first.path.join('.') + ': ' + first.message : '未知结构错误'}`
      }
    };
  }
  return { job: parsed.data as JianYingJob };
}

/** 解析并校验 Result JSON（Worker 输出） */
export function parseResult(input: unknown): { result: JianYingResult } | { error: ContractError } {
  const parsed = JianYingResultSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: {
        code: ErrorCode.WORKER_PROTOCOL_ERROR,
        message: `Result 无效：${first ? first.path.join('.') + ': ' + first.message : '未知结构错误'}`
      }
    };
  }
  return { result: parsed.data as JianYingResult };
}

// ============================================================================
// 共享 Contract Fixtures（TS 与 Python 交叉验证）
// ============================================================================

/** __fixtures__ 目录绝对路径（Next.js 打包下 __dirname 为虚拟 \ROOT\，回退到项目相对路径） */
export function fixturesDir(): string {
  const viaDirname = path.join(__dirname, '__fixtures__');
  if (fs.existsSync(viaDirname)) return viaDirname;
  return path.join(process.cwd(), 'src', 'engines', 'jianying-adapter', '__fixtures__');
}

/** 读取共享 fixture 文件 */
export function loadFixture<T = unknown>(name: string): T {
  const p = path.join(fixturesDir(), name);
  if (!fs.existsSync(p)) {
    throw new Error(`Fixture 不存在: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

/** fixture 文件名列表（供 Python 侧对照） */
export const SHARED_FIXTURE_FILES = [
  'job-minimal.json',
  'job-dissolve.json',
  'job-keyword.json',
  'result-ok.json',
  'result-error.json',
  'error-codes.json'
] as const;
