/**
 * 自动剪辑 → 剪映 总装边界（JianYing Assembly）。
 *
 * 这是「真正把草稿交给剪映生成」的唯一总装入口，职责非常窄：
 *
 *   load Draft Task
 *     → load UnifiedTimelineV2（来自 task.packagingOptions 的 unifiedTimelineV2: 前缀）
 *     → Execution Asset Preflight（validateAutomationExecutionAssets）
 *     → JianYingAdapter.generateDraft(...)   ← 唯一对外执行调用（本申请已正式接入）
 *     → 回写剪映草稿结果（jianyingResult:）+ 推进细粒度阶段
 *
 * 明确边界（见任务收口规范）：
 * - 总装代码不得 import Python Worker / pjd_bridge / 直接调用 PJD / 读取 ResourceMap 内部实现。
 * - 只通过已记录的公开接口接入剪映：JianYingAdapter.generateDraft({ draftName, timeline, jobId?, resourceMapRef?, options? })。
 * - 业务层（agent-run 等）只调用本文件导出的 executeJianYingDraftTask，不直接接触 Worker/PJD 内部。
 */
import os from 'node:os';
import path from 'node:path';
import type { AutomationVideoTask } from '@/lib/db/schema';
import {
  getAutomationVideoTask,
  getTaskAgentStage,
  getTaskUnifiedTimelineV2,
  updateJianYingAssemblyResult
} from './automation-editing';
import {
  validateAutomationExecutionAssets,
  type ExecutionAssetCheck
} from './automation-execution-preflight';
import { JIANYING_ADAPTER_INTERFACE } from './agent-auto-edit';
import { JianYingAdapter } from '@/engines/jianying-adapter';
import { getPath } from '@/lib/storage';
import type { UnifiedTimelineV2 } from '@/engines/zhiheng-renderer/v2-types';

/** 默认 Python 解释器环境变量（与 Adapter 内部一致）。 */
const PYTHON_ENV = 'ZHIJING_PYTHON';

/** 总装结果。 */
export type JianYingAssemblyResult =
  | {
      status: 'ok';
      taskId: string;
      stage: string;
      draftName: string;
      draftPath: string;
      duration: number;
      tracks: Array<{ type: string; count: number }>;
      pjdCommit?: string;
      warnings: string[];
      manualReviewRequired: boolean;
    }
  | { status: 'preflight_failed'; taskId: string; stage: string; preflight: ExecutionAssetCheck }
  | { status: 'not_ready'; taskId: string; stage: string }
  | { status: 'no_timeline'; taskId: string; stage: string }
  | {
      status: 'adapter_error';
      taskId: string;
      stage: string;
      code: string;
      message: string;
    };

/**
 * 根据任务派生剪映草稿目录名（唯一、不含剪映非法字符）。
 *
 * 命名：<prefix>-<yyyymmdd-hhmmss>；prefix 默认 ZHIHENG-PRODUCT-E2E-V1，
 * 可通过环境变量 ZHIHENG_DRAFT_NAME_PREFIX 覆盖（如黄金链路验证 ZHIHENG-GOLDEN-EDIT-TEST）。
 */
function buildDraftName(task: Pick<AutomationVideoTask, 'title' | 'id'>): string {
  void task;
  const prefix = process.env.ZHIHENG_DRAFT_NAME_PREFIX || 'ZHIHENG-PRODUCT-E2E-V1';
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${ts}`;
}

/** 解析剪映适配器运行配置（仅来自环境变量与本地约定，不读取 Worker/PJD 内部）。 */
function resolveAdapterConfig(assetRoot: string) {
  const draftRoot = process.env.ZHIHENG_JIANYING_DRAFT_ROOT || 'D:\\JianyingPro Drafts';
  const backupRoot =
    process.env.ZHIHENG_JIANYING_BACKUP_ROOT || path.join(os.tmpdir(), 'zhiheng-jianying-backups');
  const officialDraftRoot =
    process.env.ZHIHENG_JIANYING_OFFICIAL_DRAFT_ROOT ||
    'C:\\Users\\Administrator\\AppData\\Local\\JianyingPro\\User Data\\Projects\\com.lveditor.draft';
  const logDir = path.join(os.tmpdir(), 'zhiheng-jianying-adapter', 'logs');
  const pythonCommand = process.env[PYTHON_ENV] || 'python';
  const timeoutMs = Number(process.env.ZHIHENG_JIANYING_TIMEOUT_MS) || 240_000;
  return { assetRoot, draftRoot, backupRoot, officialDraftRoot, logDir, pythonCommand, timeoutMs };
}

/**
 * 执行「草稿 → 剪映草稿」总装（正式入口）。
 *
 * 推进的细粒度状态机：
 *   ready_for_jianying / generating_jianying_draft → completed | failed
 * UI 优先读取 agentStage:（task-progress.ts），因此阶段推进对前端可见。
 *
 * @param workspaceId 工作空间 ID
 * @param taskId 草稿任务 ID（其 packagingOptions 含 agentStage: 与 unifiedTimelineV2:）
 */
export async function executeJianYingDraftTask(
  workspaceId: string,
  taskId: string
): Promise<JianYingAssemblyResult> {
  const task = await getAutomationVideoTask(workspaceId, taskId);
  if (!task) {
    throw new Error(`草稿任务不存在：${taskId}`);
  }

  const stage = getTaskAgentStage(task as Pick<AutomationVideoTask, 'packagingOptions'>);

  // 仅当上游已准备到「等待剪映生成」或「生成中」时才进入总装
  if (stage !== 'ready_for_jianying' && stage !== 'generating_jianying_draft') {
    return { status: 'not_ready', taskId, stage: stage ?? '(unknown)' };
  }

  const timeline = getTaskUnifiedTimelineV2(task as Pick<AutomationVideoTask, 'packagingOptions'>);
  if (!timeline) {
    updateJianYingAssemblyResult(
      workspaceId,
      taskId,
      'failed',
      undefined,
      '任务缺少 UnifiedTimelineV2，无法生成剪映草稿。'
    );
    return { status: 'no_timeline', taskId, stage: stage ?? 'ready_for_jianying' };
  }

  // Execution Asset Preflight：解析真实绝对路径并校验合法性（不重新分析视频）
  const preflight = await validateAutomationExecutionAssets(timeline);
  if (!preflight.ok) {
    // 门禁失败 → 不得继续调用 JianYing Adapter，标记失败（可重试）
    updateJianYingAssemblyResult(
      workspaceId,
      taskId,
      'failed',
      undefined,
      `执行期素材门禁未通过：${preflight.message}`
    );
    return { status: 'preflight_failed', taskId, stage: stage ?? 'ready_for_jianying', preflight };
  }

  // 标记「正在生成剪映草稿」，UI 立即显示「正在生成剪映草稿」
  updateJianYingAssemblyResult(workspaceId, taskId, 'generating_jianying_draft');

  // 仅通过 JianYingAdapter 公开接口接入剪映（方案 A：TS → stdin Contract → Python Worker → PJD → 剪映草稿目录）
  const assetRoot = await getPath('assets');
  const cfg = resolveAdapterConfig(assetRoot);
  const adapter = new JianYingAdapter(cfg);
  const draftName = buildDraftName(task);

  try {
    const result = await adapter.generateDraft({
      draftName,
      timeline,
      jobId: taskId,
      options: { backupPlaintext: true, failOnWarning: false }
    });

    if (!result.ok) {
      const message = result.error?.message ?? '剪映适配器生成失败（未知错误）';
      updateJianYingAssemblyResult(
        workspaceId,
        taskId,
        'failed',
        undefined,
        `剪映草稿生成失败：${message}`
      );
      return {
        status: 'adapter_error',
        taskId,
        stage: 'failed',
        code: result.error?.code ?? 'UNKNOWN',
        message
      };
    }

    const pjdCommit =
      result.validationReport?.pjdCommit ?? result.validationReport?.pjdSource?.actualCommit;
    const voiceCount = result.tracks?.find((t) => t.type === 'voice')?.count;
    const writeback = {
      draftName,
      draftPath: result.draftDir ?? path.join(cfg.draftRoot, draftName),
      duration: result.duration ?? 0,
      videoSegmentCount:
        result.tracks?.find((t) => t.type === 'video')?.count ?? timeline.videoTrack.length,
      subtitleCount:
        result.tracks?.find((t) => t.type === 'subtitle')?.count ??
        timeline.subtitleTrack?.length ??
        0,
      keywordCount:
        result.tracks?.find((t) => t.type === 'keyword')?.count ??
        timeline.keywordTrack?.length ??
        0,
      generatedAt: new Date().toISOString(),
      executionEngine: 'jianying' as const,
      pjdCommit,
      warnings: result.warnings,
      manualReviewRequired: result.manualReviewRequired
    };
    void voiceCount;

    updateJianYingAssemblyResult(workspaceId, taskId, 'completed', writeback);

    return {
      status: 'ok',
      taskId,
      stage: 'completed',
      draftName,
      draftPath: writeback.draftPath,
      duration: writeback.duration,
      tracks: result.tracks ?? [],
      pjdCommit,
      warnings: result.warnings,
      manualReviewRequired: result.manualReviewRequired
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '剪映适配器执行异常';
    updateJianYingAssemblyResult(
      workspaceId,
      taskId,
      'failed',
      undefined,
      `剪映草稿生成失败：${message}`
    );
    return { status: 'adapter_error', taskId, stage: 'failed', code: 'UNKNOWN', message };
  }
}
