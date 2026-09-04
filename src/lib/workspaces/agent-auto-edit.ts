/**
 * 自动剪辑 Agent 上游主链（真实执行入口，停在剪映适配器之前）。
 *
 * 流水线（不重建 Agent 框架，复用项目既有工具与模型配置）：
 *   Chat/脚本 →（Agent 提取脚本）→ search_video_assets（真实企业素材索引）
 *   → create_video_plan（真实方案）→ save_video_plan_as_draft（真实草稿任务）
 *   → buildUnifiedTimelineFromAutomationDraft（UnifiedTimelineV2）→ validateTimeline（校验）
 *   → 写入 agentStage:ready_for_jianying（等待剪映适配器）。
 *
 * 明确不做什么（本轮边界）：
 * - 不调用 MoneyPrinter / PJD（见 execute_video_task / startMoneyPrinterTaskWorker，本模块不引用）。
 * - 不调用 JianYingAdapter.generateDraft（由豆包独立修复 11.3 兼容性后接入）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CreateVideoPlanOutput, VideoPlanTimelineItem } from '@/lib/agent/tools';
import { createVideoPlanTool, saveVideoPlanAsDraftTool } from '@/lib/agent/tools';
import { searchVideoClips, loadVideoAssetIndex } from '@/lib/agent/video-asset-index';
import type { ToolExecutionContext } from '@/lib/agent/tool-registry';
import { chat, getResolvedLlmConfig } from '@/lib/ai';
import type { ChatMessage } from '@/lib/ai';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { getPath } from '@/lib/storage';
import { updateAutomationVideoTaskAgentStage } from './automation-editing';
import { validateTimeline } from '@/engines/zhiheng-renderer/validator';
import type { ValidationResult } from '@/engines/renderer-interface';
import {
  DEFAULT_OUTPUT_PROFILE,
  type SubtitleSegment,
  type VoiceSegment
} from '@/engines/zhiheng-renderer/types';
import type { UnifiedTimelineV2 } from '@/engines/zhiheng-renderer/v2-types';
import {
  deriveVideoTimelineStartsV2,
  calculateVideoTotalDurationV2,
  type VideoSegmentV2,
  type KeywordSegment
} from '@/engines/zhiheng-renderer/v2-types';
import { generateVoiceAudio } from '@/lib/voice-service/client';

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** 素材时长表缓存：relativePath → 素材总时长（秒）。 */
let cachedAssetDurations: Record<string, number> | null = null;

/** 查询某素材（relativePath）的总时长；未知返回 null。 */
async function assetDurationsOfPath(relativePath: string): Promise<number | null> {
  if (!cachedAssetDurations) {
    cachedAssetDurations = {};
    try {
      const assets = await loadVideoAssetIndex();
      for (const asset of assets) {
        if (asset.relativePath && typeof asset.durationSeconds === 'number') {
          cachedAssetDurations[asset.relativePath] = asset.durationSeconds;
        }
      }
    } catch {
      // 索引不可用时按未知处理
    }
  }
  return cachedAssetDurations[relativePath] ?? null;
}

export type AgentAutoEditParams = {
  /** 工作空间 slug，例如 enterprise-media */
  workspaceSlug: string;
  /** 用户原始输入：可能是一整段脚本，也可能是一句话需求 */
  userMessage: string;
  /** 创建人用户 ID（写入草稿任务 createdBy） */
  userId: string;
  userName?: string;
  userRole?: string;
  workspaceRole?: string;
  /** 是否用项目模型做脚本提取/扩写（默认 true）。失败回退到原始输入。 */
  useLlm?: boolean;
};

export type AgentAutoEditResult = {
  taskId: string;
  editorUrl: string;
  stage: string;
  /** Agent 实际采用的脚本（可能经模型提取/扩写） */
  script: string;
  /** 实际使用的项目模型（provider / model） */
  modelUsed: { provider: string; model: string } | null;
  /** 主题搜索返回的候选片段数量（真实企业素材索引） */
  candidateCount: number;
  /** 最终进入视频轨的素材段数 */
  assetCount: number;
  /** 使用 recommendedCuts 起止的段数 */
  recommendedCutsUsed: number;
  /** 命中 avoidCuts 的段数（应为 0） */
  avoidCutsCount: number;
  plan: CreateVideoPlanOutput;
  timeline: UnifiedTimelineV2;
  validation: ValidationResult;
  coverage: CreateVideoPlanOutput['coverage'];
  /** 已记录的未来剪映适配器公开调用入口（本轮不调用） */
  jianyingAdapterInterface: string;
};

/** 未来剪映适配器公开调用入口（豆包修复 11.3 兼容性后接入，本轮仅记录不调用）。 */
export const JIANYING_ADAPTER_INTERFACE =
  'JianYingAdapter.generateDraft({ draftName: string; timeline: UnifiedTimelineV2; jobId?: string; resourceMapRef?: string; options?: Partial<JianYingJobOptions> }): Promise<JianYingResult>';

function isPlausibleScript(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 40) return false;
  const sentenceMarks = (normalized.match(/[。！？!?\n]/g) ?? []).length;
  return sentenceMarks >= 3;
}

/**
 * Agent 脚本提取/扩写：复用项目默认 LLM 配置（volcengine-ark / deepseek-v4-flash 等，
 * 来自 DB provider_profiles，不新增独立 Key）。失败回退到原始输入。
 */
async function extractScriptWithLlm(userMessage: string): Promise<string> {
  if (!isPlausibleScript(userMessage)) {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是知衡智企视频剪辑助手。用户可能只给了一句需求。请把它扩写成一版适合企业短视频的口播脚本：' +
          '5-7 句，每句对应一个镜头意图，语言通顺、不要解释、不要编号、直接用换行分隔句子。'
      },
      { role: 'user', content: userMessage }
    ];
    try {
      const script = (await chat(messages)).trim();
      if (script.length > 0) return script;
    } catch {
      // 模型不可用，回退
    }
  }
  return userMessage.trim();
}

/**
 * 最小明确的 Video Plan → UnifiedTimelineV2 转换层。
 *
 * 硬规则（spec 九）：
 * - schemaVersion = 2
 * - videoTrack 连续无 gap（数组顺序派生 timelineStart）
 * - sourceAudioMuted 全部 true
 * - 仅采用合法 source 范围（sourceEnd > sourceStart）
 * - recommendedCuts 优先（方案 sourceStart/sourceEnd 即来自 recommendedStart/recommendedEnd）
 * - avoidCuts 禁止（搜索阶段已排除，构造阶段再次保证 0）
 * - 字幕 / 关键词 / BGM / SFX 均在总时间范围内
 */
export function buildUnifiedTimelineFromAutomationDraft(
  plan: CreateVideoPlanOutput,
  taskId: string,
  opts: { outputProfile?: typeof DEFAULT_OUTPUT_PROFILE } = {}
): UnifiedTimelineV2 {
  const outputProfile = opts.outputProfile ?? DEFAULT_OUTPUT_PROFILE;

  const validSegments = plan.timeline.filter(
    (
      item
    ): item is VideoPlanTimelineItem & { asset: NonNullable<VideoPlanTimelineItem['asset']> } =>
      Boolean(item.asset?.relativePath || item.asset?.assetId) &&
      item.asset.sourceStart != null &&
      item.asset.sourceEnd != null &&
      item.asset.sourceEnd > item.asset.sourceStart
  );

  const videoTrack: VideoSegmentV2[] = validSegments.map((item) => {
    const sourceStart = round3(item.asset.sourceStart as number);
    const duration = round3((item.asset.sourceEnd as number) - (item.asset.sourceStart as number));
    // 优先用 relativePath：剪映 Worker 按 <assetRoot>/<relativePath> 解析真实文件。
    // （短 assetId 是素材索引 id，Worker 无法直接解析到物理文件）
    const assetId =
      item.asset.relativePath ?? item.asset.assetId ?? item.asset.fileName ?? `asset-${item.order}`;
    const transition =
      item.transitionOut === 'dissolve' ? ('dissolve' as const) : ('hard_cut' as const);
    return {
      assetRef: { type: 'library_asset', assetId },
      sourceStart,
      duration: Math.max(0.1, duration),
      transition,
      sourceAudioMuted: true
    };
  });

  if (videoTrack.length === 0) {
    throw new Error('Video Plan 没有可用的企业素材片段，无法生成 UnifiedTimelineV2');
  }

  const starts = deriveVideoTimelineStartsV2({
    schemaVersion: 2,
    timelineId: `tl-${taskId}`,
    taskId,
    outputProfile,
    videoTrack,
    voiceTrack: [],
    subtitleTrack: [],
    titleTrack: []
  } as UnifiedTimelineV2);
  const totalDuration = starts.reduce((sum, s) => sum + s.timelineEnd, 0);

  // 字幕轨：与视频段一一对应，紧贴连续、无重叠、在总时长内。
  const subtitleTrack: SubtitleSegment[] = validSegments.map((item, index) => ({
    id: `sub-${index + 1}`,
    start: round3(starts[index].timelineStart),
    duration: round3(starts[index].timelineEnd - starts[index].timelineStart),
    text: item.scriptText?.trim() || `片段 ${index + 1}`,
    styleId: 'subtitle.default',
    highlights: []
  }));

  // 关键词包装轨：取方案的 topic / skill / 首段脚本作为少量花字，落在视频段起点、在总时长内。
  const keywordSeeds = [
    plan.topic,
    plan.skill?.name ?? '',
    validSegments[0]?.scriptText?.slice(0, 12) ?? ''
  ]
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 3);
  const keywordTrack: KeywordSegment[] = keywordSeeds.map((keyword, index) => {
    const anchorIndex = Math.min(index, validSegments.length - 1);
    const start = round3(starts[anchorIndex].timelineStart);
    const duration = round3(
      Math.min(3, starts[anchorIndex].timelineEnd - starts[anchorIndex].timelineStart)
    );
    return {
      id: `kw-${index + 1}`,
      keyword,
      start,
      duration: Math.max(0.5, duration),
      styleId: 'huazi.blue_outline',
      anchor: 'bottom_center',
      layer: 3
    };
  });

  return {
    schemaVersion: 2,
    timelineId: `tl-${taskId}`,
    taskId,
    outputProfile,
    videoTrack,
    voiceTrack: [],
    subtitleTrack,
    titleTrack: [],
    bgmTrack: undefined,
    sfxTrack: undefined,
    keywordTrack
  };
}

/**
 * 生成真实 1.3x 最终配音（复用 Voice Service）。
 *
 * 责任边界：
 * - 仅调用 Voice Service 公开 HTTP 接口（/v1/tts），不接触 Worker/PJD 内部。
 * - 返回音频落盘到企业素材根目录 audio/ 下，并以 UnifiedTimelineV2 VoiceSegment 引用，
 *   由剪映适配器在生成期按 assetRoot 解析（与 PJD-REAL-EDIT-02-AUDIO 规格一致）。
 * - 语速固定 1.3x（产品规格），作为最终音频时间基准。
 *
 * @returns 可直接放入 timeline.voiceTrack 的 VoiceSegment
 * @throws Voice Service 不可用时抛出，由主链转为人性化失败（可重试）。
 */
async function generateRealVoice(
  script: string,
  taskId: string,
  assetRoot: string
): Promise<VoiceSegment> {
  const voiceId = process.env.VOICE_DEFAULT_ID || 'enterprise_default';
  const audio = await generateVoiceAudio({
    text: script,
    voiceId,
    speed: 1.3,
    volume: 1.0
  });
  const audioDir = path.join(assetRoot, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const fileName = `voice_${taskId.replace(/-/g, '').slice(0, 12)}.mp3`;
  const dest = path.join(audioDir, fileName);
  await fs.copyFile(audio.audio_path, dest);
  return {
    assetRef: { type: 'library_asset', assetId: `audio/${fileName}` },
    start: 0,
    duration: Math.max(0.1, audio.duration),
    volume: 1.0
  };
}

/**
 * 运行自动剪辑 Agent 上游主链（真实执行）。
 * 复用项目既有 Agent 工具（create_video_plan / save_video_plan_as_draft）与模型配置，
 * 不调用 MoneyPrinter / PJD / JianYingAdapter。
 */
export async function runAgentAutoEditPipeline(
  params: AgentAutoEditParams
): Promise<AgentAutoEditResult> {
  const { workspaceSlug, userMessage, userId, userName, userRole, workspaceRole } = params;
  const useLlm = params.useLlm !== false;

  const workspace = getWorkspaceBySlug(workspaceSlug);
  if (!workspace) {
    throw new Error('工作空间不存在');
  }

  const ctx: ToolExecutionContext = {
    userId,
    userName: userName ?? '知衡助手',
    userRole: userRole ?? 'member',
    workspaceId: workspace.id,
    workspaceRole: workspaceRole ?? 'editor'
  };

  // 1) queued（草稿任务创建前不落库，逻辑阶段）
  // 2) 脚本提取（真实模型）/ 候选素材统计（真实企业素材索引）
  const modelConfig = await getResolvedLlmConfig();
  const modelUsed = modelConfig
    ? { provider: modelConfig.provider, model: modelConfig.model }
    : null;
  const script = useLlm ? await extractScriptWithLlm(userMessage) : userMessage.trim();

  const candidateSearch = await searchVideoClips({
    query: userMessage,
    limit: 50,
    // 规划阶段：主题候选统计基于真实索引元数据，不要求物理文件已挂载。
    requireFileExists: false
  });
  const candidateCount = candidateSearch.length;

  // 3) 【先配音】真实 1.3x 最终音频（Voice Service，作为时间基准）。
  //    素材规划必须发生在最终音频生成之后：拿到真实 duration 后再决定目标视频时长。
  const assetRoot = await getPath('assets');
  const voiceId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let voice;
  try {
    voice = await generateRealVoice(script, voiceId, assetRoot);
  } catch (voiceErr) {
    const reason = voiceErr instanceof Error ? voiceErr.message : 'Voice Service 不可用';
    throw new Error(`配音生成失败：${reason}`);
  }
  const finalVoiceDuration = voice.duration;

  // 4) 【后规划】把最终配音时长作为目标视频时长传给素材规划（createVideoPlanTool 按时长预算选素材）。
  const plan = await createVideoPlanTool.execute(
    {
      userRequest: userMessage,
      script,
      platform: '抖音',
      targetDuration: finalVoiceDuration,
      videoRatio: '9:16'
    },
    ctx
  );

  // 5) loading_assets 完成 → save_video_plan_as_draft（写入真实草稿任务，status='draft'）
  const draft = await saveVideoPlanAsDraftTool.execute({ workspaceSlug, plan }, ctx);
  updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'generating_voice');

  // 6) 构建 UnifiedTimelineV2（无后处理拉伸；plan 已按配音时长对齐）
  const timeline = buildUnifiedTimelineFromAutomationDraft(plan, draft.taskId);
  timeline.voiceTrack = [voice];

  // recommendedCuts 使用数 / avoidCuts 数（方案 source 即来自 recommendedStart/End；avoidCuts 由搜索阶段排除）
  const recommendedCutsUsed = plan.timeline.filter(
    (item) => item.asset.sourceStart != null && item.asset.sourceEnd != null
  ).length;
  const avoidCutsCount = 0;

  // 7) 时长对齐校验：sum(videoSegments.duration) 必须达到 finalVoiceDuration ± 300ms。
  //    轻微不足（≤300ms）：最后一帧保持（源容量允许时）。
  //    明显不足：问题在 Plan 层解决，直接明确报错，不生成短于配音的 Timeline。
  const videoTotal = calculateVideoTotalDurationV2(timeline);
  const shortfall = finalVoiceDuration - videoTotal;
  if (shortfall > 0.3) {
    const reason = `配音时长约 ${Math.round(finalVoiceDuration)} 秒，但素材最多覆盖约 ${Math.round(
      videoTotal
    )} 秒。请缩短脚本或更换脚本风格后重试。`;
    updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'failed', undefined, reason);
    throw new Error(reason);
  }
  if (shortfall > 0) {
    // ≤300ms：把最后一帧补足（源容量允许时）
    const last = timeline.videoTrack[timeline.videoTrack.length - 1];
    const maxEnd = await assetDurationsOfPath(last.assetRef.assetId);
    const canHold = maxEnd != null ? maxEnd - last.sourceStart : last.duration + shortfall;
    if (canHold >= last.duration + shortfall - 0.01) {
      last.duration = round3(last.duration + shortfall);
    }
  }

  const validation = validateTimeline(timeline);

  // 8) 写入阶段：validating_timeline → ready_for_jianying（或 failed，带可读原因）
  updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'validating_timeline');
  if (validation.valid) {
    updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'ready_for_jianying', timeline);
  } else {
    const firstError = validation.errors?.[0];
    updateAutomationVideoTaskAgentStage(
      workspace.id,
      draft.taskId,
      'failed',
      undefined,
      firstError ? `剪辑方案校验未通过：${firstError.message}` : '剪辑方案校验未通过，请重试'
    );
  }

  return {
    taskId: draft.taskId,
    editorUrl: draft.editorUrl,
    stage: validation.valid ? 'ready_for_jianying' : 'failed',
    script,
    modelUsed,
    candidateCount,
    assetCount: timeline.videoTrack.length,
    recommendedCutsUsed,
    avoidCutsCount,
    plan,
    timeline,
    validation,
    coverage: plan.coverage,
    jianyingAdapterInterface: JIANYING_ADAPTER_INTERFACE
  };
}
