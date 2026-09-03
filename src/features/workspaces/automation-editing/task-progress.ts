// 对话式「自动剪辑」任务流 —— 集中式进度适配层（mock / 真实 API 的唯一切换点）。
//
// 为什么存在这一层：
// 需求约定，当后端 Orchestrator 还未接入（细粒度状态机未落到任务 API）时，
// 前端用「集中式 mock」模拟执行进度；待真实 API 就绪后，仅需把 USE_MOCK_PROGRESS
// 置为 false 即可切到真实轮询，组件里无需任何改动。mock 逻辑只存在于本文件。
//
// 设计要点：
// - 进度由「任务创建时间」确定性推导，因此在刷新 / 重进页面后阶段可还原，不会跳变。
// - 真实 API 路径同样集中在这里：轮询 GET /api/workspaces/[slug]/automation/tasks，
//   命中终态即停止并回调。Codex 的 Orchestrator 一旦把细粒度状态写入任务，
//   mapAutoEditStatus 会自动识别，无需改组件。

import { AUTO_EDIT_STAGES, mapAutoEditStatus, type AutoEditStageKey } from './task-status';

/**
 * 是否使用集中式 mock 进度。
 * true  = Orchestrator 未接入，前端按创建时间模拟细粒度流水线（用于本地验收）。
 * false = 走真实后端：轮询任务 API，以真实状态为准。
 *
 * 自动剪辑 Agent 上游主链已落地（agentStage 写入任务 packagingOptions），
 * 因此默认关闭 mock，直接以真实后端状态为准。组件无需改动。
 */
export const USE_MOCK_PROGRESS = false;

/** 每个阶段在前端展示停留的时长（毫秒）。 */
const STAGE_INTERVAL_MS = 1500;
/** 真实 API 轮询间隔（毫秒）。 */
const REAL_POLL_MS = 2500;

const STAGE_KEYS: ReadonlyArray<string> = AUTO_EDIT_STAGES.map((stage) => stage.key);

export type AutoEditProgressCallback = (stageKey: string) => void;
export type AutoEditTerminalCallback = (
  result: AutoEditStageKey,
  errorMessage?: string | null
) => void;

export type SubscribeAutoEditProgressArgs = {
  workspaceSlug: string;
  taskId: string;
  /** 任务创建时间（epoch 毫秒），用于确定性推导当前阶段，保证刷新可还原。 */
  createdAt: number;
  /** 是否强制演示失败分支（用于验收错误 UI）。真实接入后由后端决定，无需前端传。 */
  forceFail?: boolean;
  onStage: AutoEditProgressCallback;
  onTerminal: AutoEditTerminalCallback;
};

/** 根据创建时间确定性计算当前应处阶段（含是否已终态）。供初始化 / 刷新还原使用。 */
export function computeAutoEditStage(
  createdAt: number,
  forceFail = false
): { stageKey: string; terminal?: AutoEditStageKey } {
  const elapsed = Date.now() - createdAt;
  const index = Math.floor(elapsed / STAGE_INTERVAL_MS);
  if (index >= STAGE_KEYS.length) {
    return forceFail
      ? { stageKey: 'failed', terminal: 'failed' }
      : { stageKey: 'completed', terminal: 'completed' };
  }
  return { stageKey: STAGE_KEYS[index] };
}

async function fetchRawTaskStatus(
  workspaceSlug: string,
  taskId: string
): Promise<{ status: string; errorMessage?: string | null; agentStage?: string | null } | null> {
  try {
    const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/tasks`, {
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as {
      tasks?: Array<{
        id: string;
        status?: string;
        errorMessage?: string | null;
        packagingOptions?: string[];
      }>;
    } | null;
    const found = payload?.tasks?.find((task) => task.id === taskId);
    if (!found) return null;
    const agentStage =
      found.packagingOptions
        ?.find((option) => option.startsWith('agentStage:'))
        ?.slice('agentStage:'.length) ?? null;
    return {
      status: found.status ?? 'generating',
      errorMessage: found.errorMessage ?? null,
      agentStage
    };
  } catch {
    return null;
  }
}

/**
 * 订阅某个自动剪辑任务的进度变化。
 * 返回一个取消订阅函数（组件卸载时调用，避免内存泄漏）。
 */
export function subscribeAutoEditProgress(args: SubscribeAutoEditProgressArgs): () => void {
  const { workspaceSlug, taskId, createdAt, forceFail = false, onStage, onTerminal } = args;
  let cancelled = false;
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stop() {
    cancelled = true;
    if (tickTimer) clearTimeout(tickTimer);
    if (pollTimer) clearInterval(pollTimer);
  }

  if (USE_MOCK_PROGRESS) {
    // 模拟模式：按创建时间推进流水线，终态前逐个阶段回调 onStage。
    const tick = () => {
      if (cancelled) return;
      const { stageKey, terminal } = computeAutoEditStage(createdAt, forceFail);
      if (terminal) {
        onTerminal(
          terminal,
          terminal === 'failed' ? 'AI 剪辑方案生成失败，请调整一下描述后重试。' : undefined
        );
        return;
      }
      onStage(stageKey);
      tickTimer = setTimeout(tick, STAGE_INTERVAL_MS);
    };
    tick();
    return stop;
  }

  // 真实模式：以任务 API 为准，定时轮询；命中终态即停止。
  const poll = async () => {
    if (cancelled) return;
    const raw = await fetchRawTaskStatus(workspaceSlug, taskId);
    if (!raw) return;
    // Agent 上游细粒度阶段（agentStage:）优先于 coarse status。
    const view = mapAutoEditStatus(raw.agentStage ?? raw.status);
    if (view.isTerminal) {
      stop();
      onTerminal(view.key, raw.errorMessage ?? undefined);
      return;
    }
    onStage(view.key);
  };

  void poll();
  pollTimer = setInterval(() => void poll(), REAL_POLL_MS);
  return stop;
}
