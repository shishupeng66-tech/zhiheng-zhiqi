// 对话式「自动剪辑」任务流 —— 集中式状态映射。
//
// 后端会以一套细粒度状态机推进任务（queued → preparing_script → ... → completed / failed）。
// 本模块是「原始后端状态 → 面向普通用户的友好中文文案 + UI 阶段元数据」的唯一来源，
// 所有组件都从这里读取，绝不在组件里散落硬编码的状态/文案。
//
// 设计约束（来自需求）：
// - 普通用户看不到任何技术黑话：不出现 Python / PJD / Timeline / Renderer 等字眼。
// - 同时兼容当前真实后端返回的粗粒度状态（draft / generating / pending_review /
//   approved / failed / deleted），在 Orchestrator 尚未接入时给出合理的降级展示。

export type AutoEditStageKey =
  | 'queued'
  | 'preparing_script'
  | 'generating_voice'
  | 'speeding_voice'
  | 'building_timing'
  | 'loading_assets'
  | 'planning_edit'
  | 'validating_timeline'
  | 'generating_jianying_draft'
  | 'ready_for_jianying'
  | 'completed'
  | 'failed';

export type AutoEditPhase = 'queued' | 'running' | 'completed' | 'failed';

export type AutoEditTone = 'neutral' | 'active' | 'success' | 'error';

export type AutoEditStageView = {
  key: AutoEditStageKey;
  /** 面向用户的阶段文案（无技术黑话）。 */
  label: string;
  /** 流水线中的顺序下标（0 起）。 */
  index: number;
  /** 0–100 的进度百分比。 */
  progressPercent: number;
  phase: AutoEditPhase;
  isTerminal: boolean;
  isFailed: boolean;
  tone: AutoEditTone;
};

/** 流水线中的进行中阶段（不含两个终态），UI 用其渲染步骤条。 */
export const AUTO_EDIT_STAGES: ReadonlyArray<{
  key: Exclude<AutoEditStageKey, 'completed' | 'failed'>;
  label: string;
}> = [
  { key: 'queued', label: '准备任务' },
  { key: 'preparing_script', label: '正在整理脚本' },
  { key: 'generating_voice', label: '正在生成配音' },
  { key: 'speeding_voice', label: '正在调整语速' },
  { key: 'building_timing', label: '正在同步音频时间' },
  { key: 'loading_assets', label: '正在读取企业素材' },
  { key: 'planning_edit', label: 'AI 正在设计剪辑方案' },
  { key: 'validating_timeline', label: '正在检查剪辑方案' },
  { key: 'generating_jianying_draft', label: '正在生成剪映草稿' }
];

const STAGE_ORDER: AutoEditStageKey[] = [
  ...AUTO_EDIT_STAGES.map((stage) => stage.key),
  'ready_for_jianying',
  'completed',
  'failed'
];

/** 细粒度状态机 → 友好文案。 */
const FRIENDLY_LABELS: Record<AutoEditStageKey, string> = {
  queued: '准备任务',
  preparing_script: '正在整理脚本',
  generating_voice: '正在生成配音',
  speeding_voice: '正在调整语速',
  building_timing: '正在同步音频时间',
  loading_assets: '正在读取企业素材',
  planning_edit: 'AI 正在设计剪辑方案',
  validating_timeline: '正在检查剪辑方案',
  generating_jianying_draft: '正在生成剪映草稿',
  ready_for_jianying: '方案已就绪，等待剪映生成',
  completed: '剪映草稿已生成',
  failed: '生成失败'
};

const TOTAL_STAGES = AUTO_EDIT_STAGES.length;

function buildStageView(key: AutoEditStageKey): AutoEditStageView {
  const index = STAGE_ORDER.indexOf(key);
  const isReady = key === 'ready_for_jianying';
  const phase: AutoEditPhase =
    key === 'completed' || isReady
      ? 'completed'
      : key === 'failed'
        ? 'failed'
        : index === 0
          ? 'queued'
          : 'running';
  const progressPercent =
    key === 'completed' || isReady
      ? 100
      : key === 'failed'
        ? Math.max(8, Math.round((index / (TOTAL_STAGES + 1)) * 100))
        : Math.round((index / TOTAL_STAGES) * 100);
  const tone: AutoEditTone =
    key === 'completed' || isReady
      ? 'success'
      : key === 'failed'
        ? 'error'
        : index === 0
          ? 'neutral'
          : 'active';
  return {
    key,
    label: FRIENDLY_LABELS[key],
    index,
    progressPercent,
    phase,
    isTerminal: key === 'completed' || key === 'failed' || isReady,
    isFailed: key === 'failed',
    tone
  };
}

/** 当前真实后端（粗粒度）状态 → 友好视图的降级映射。 */
function mapCoarseStatus(status: string): AutoEditStageView {
  switch (status) {
    case 'draft':
      return buildStageView('queued');
    case 'generating':
      return buildStageView('preparing_script');
    case 'pending_review':
    case 'approved':
      return buildStageView('completed');
    case 'failed':
    case 'deleted':
      return buildStageView('failed');
    default:
      return buildStageView('preparing_script');
  }
}

/**
 * 把任意后端返回的状态归一化成 UI 视图。
 * - 命中细粒度状态机：直接用其文案与顺序。
 * - 否则：按粗粒度状态降级展示。
 */
export function mapAutoEditStatus(rawStatus: string | undefined | null): AutoEditStageView {
  if (!rawStatus) return buildStageView('preparing_script');
  if (rawStatus in FRIENDLY_LABELS) {
    return buildStageView(rawStatus as AutoEditStageKey);
  }
  return mapCoarseStatus(rawStatus);
}

/**
 * 失败时的友好原因映射。绝不把原始报错 / Python traceback 暴露给普通用户。
 * 命中关键词给针对性提示，否则给通用重试提示。
 */
const FRIENDLY_FAIL_RULES: ReadonlyArray<{ test: RegExp; reason: string }> = [
  {
    test: /时长|EXCEEDS_TOTAL|校验|时间线|timeline|秒，但/i,
    reason: '脚本文案或配音时长与素材不匹配，请缩短脚本、更换脚本风格或重新生成。'
  },
  { test: /voice|配音|tts|语音|音色/i, reason: '配音生成失败，请稍后重试，或换一个音色再试。' },
  {
    test: /素材|asset|material|企业素材|库存/i,
    reason: '企业素材暂时不可用，已为你保留任务，可稍后重试。'
  },
  {
    test: /plan|方案|剪辑方案|edit[\s_-]?plan|草稿方案/i,
    reason: 'AI 剪辑方案生成失败，请调整一下描述后重试。'
  },
  { test: /jianying|剪映|draft|草稿/i, reason: '剪映草稿生成失败，请稍后重试。' }
];

export function friendlyFailureReason(errorMessage?: string | null): string {
  if (!errorMessage) return '生成失败，请稍后重试。';
  for (const rule of FRIENDLY_FAIL_RULES) {
    if (rule.test.test(errorMessage)) return rule.reason;
  }
  return '生成失败，请稍后重试。';
}
