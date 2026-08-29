import { desc, eq, and, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db';
import {
  automationVideoAssets,
  automationVideoTasks,
  users,
  type AutomationVideoAsset,
  type AutomationVideoTask,
  type AutomationVideoTaskStatus
} from '@/lib/db/schema';
import type { CreateVideoPlanOutput } from '@/lib/agent/tools';
import { getPath } from '@/lib/storage';

export type AutomationVideoTaskInput = {
  title?: string;
  prompt: string;
  scriptLanguage: string;
  keywords: string[];
  scriptText?: string;
  materialSource: string;
  materialAssetIds: string[];
  stitchMode: string;
  transitionMode: string;
  videoRatio: string;
  clipDuration: string;
  matchByScript: boolean;
  voiceMode: string;
  voiceService: string;
  voiceName: string;
  voiceVolume: string;
  voiceSpeed: string;
  musicSource: string;
  musicVolume: number;
  subtitleEnabled: boolean;
  subtitleFont: string;
  subtitlePosition: string;
  subtitleStyle: string;
  subtitleSize: string;
  subtitleColor: string;
  subtitleBackground: boolean;
  packagingOptions: string[];
};

export type AutomationVideoTaskRow = AutomationVideoTask & {
  creatorName: string;
};

const AGENT_PLAN_OPTION_PREFIX = 'agentPlan:';
const CURRENT_CONFIG_OPTION_PREFIX = 'currentTaskConfig:';
const EXECUTION_SNAPSHOT_OPTION_PREFIX = 'executionSnapshot:';

export type AutomationMaterialTimeline = Array<{
  order: number;
  timelineStart: number;
  timelineEnd: number;
  scriptText: string;
  fileName: string | null;
  relativePath: string | null;
  sourceStart: number | null;
  sourceEnd: number | null;
  usageRole: string;
  matchLevel: string;
  matchScore: number;
}>;

export type AutomationDraftTaskConfig = AutomationVideoTaskInput & {
  materialTimeline?: AutomationMaterialTimeline;
};

export type AutomationEditTimelineItem = {
  order: number;
  timelineStart: number;
  timelineEnd: number;
  sourceFile: string;
  relativePath: string;
  fileName: string;
  sourceStart: number;
  sourceEnd: number;
  scriptText: string;
  usageRole: string;
  matchLevel: string;
  matchScore: number;
  targetDuration: number;
  videoRatio: string;
  cropSafety: string | null;
  transitionIn: string;
  transitionOut: string;
  warnings: string[];
};

export type AutomationExecutionSnapshot = {
  version: 1;
  taskId: string;
  workspaceId: string;
  createdAt: string;
  videoRatio: string;
  scriptText: string;
  voice: {
    mode: string;
    voiceName: string;
    volume: string;
    speed: string;
  };
  subtitle: {
    enabled: boolean;
    font: string;
    position: string;
    style: string;
    size: string;
    color: string;
    background: boolean;
  };
  bgm: {
    source: string;
    volume: number;
  };
  editTimeline: AutomationEditTimelineItem[];
  warnings: string[];
};

function now() {
  return new Date();
}

function normalizeText(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeKeywords(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\s，、]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function buildTaskTitle(input: AutomationVideoTaskInput) {
  if (input.title?.trim()) return input.title.trim();
  const prompt = input.prompt.trim();
  return prompt.length > 28 ? `${prompt.slice(0, 28)}...` : prompt || '未命名视频任务';
}

function buildResultSummary(input: AutomationVideoTaskInput) {
  const keywords = input.keywords.length > 0 ? input.keywords.join('、') : 'AI 自动补全关键词';
  return [
    `脚本：${input.scriptText?.trim() ? '使用手动脚本' : 'AI 自动生成脚本'}`,
    `素材：${input.materialSource}，${input.matchByScript ? '按文案匹配画面' : '手动顺序'}`,
    `配音：${input.voiceMode} / ${input.voiceName}`,
    `画幅：${input.videoRatio}，片段：${input.clipDuration}`,
    `包装：${input.subtitleEnabled ? '启用字幕' : '不启用字幕'}，关键词：${keywords}`
  ].join('；');
}

function encodeOption(prefix: string, value: unknown) {
  return `${prefix}${JSON.stringify(value)}`;
}

function decodeOption<T>(
  task: Pick<AutomationVideoTask, 'packagingOptions'>,
  prefix: string
): T | null {
  const raw = task.packagingOptions.find((option) => option.startsWith(prefix));
  if (!raw) return null;
  try {
    return JSON.parse(raw.slice(prefix.length)) as T;
  } catch {
    return null;
  }
}

function withoutEncodedOptions(options: string[]) {
  return options.filter(
    (option) =>
      !option.startsWith(AGENT_PLAN_OPTION_PREFIX) &&
      !option.startsWith(CURRENT_CONFIG_OPTION_PREFIX) &&
      !option.startsWith(EXECUTION_SNAPSHOT_OPTION_PREFIX)
  );
}

export function getTaskAgentPlan(task: Pick<AutomationVideoTask, 'packagingOptions'>) {
  return decodeOption<CreateVideoPlanOutput>(task, AGENT_PLAN_OPTION_PREFIX);
}

export function getTaskCurrentConfig(task: Pick<AutomationVideoTask, 'packagingOptions'>) {
  return decodeOption<AutomationDraftTaskConfig>(task, CURRENT_CONFIG_OPTION_PREFIX);
}

export function getTaskExecutionSnapshot(task: Pick<AutomationVideoTask, 'packagingOptions'>) {
  return decodeOption<AutomationExecutionSnapshot>(task, EXECUTION_SNAPSHOT_OPTION_PREFIX);
}

function normalizeVideoRatio(value: string) {
  if (value.includes('16:9')) return '横屏 16:9';
  if (value.includes('1:1')) return '方屏 1:1';
  return '竖屏 9:16（抖音视频）';
}

function buildMaterialTimeline(plan: CreateVideoPlanOutput): AutomationMaterialTimeline {
  return plan.timeline.map((item) => ({
    order: item.order,
    timelineStart: item.timelineStart,
    timelineEnd: item.timelineEnd,
    scriptText: item.scriptText,
    fileName: item.asset.fileName,
    relativePath: item.asset.relativePath,
    sourceStart: item.asset.sourceStart,
    sourceEnd: item.asset.sourceEnd,
    usageRole: item.usageRole,
    matchLevel: item.matchLevel,
    matchScore: item.matchScore
  }));
}

export function mapVideoPlanToDraftInput(plan: CreateVideoPlanOutput): AutomationDraftTaskConfig {
  return {
    title: plan.title,
    prompt: plan.topic,
    scriptLanguage: '简体中文',
    keywords: [],
    scriptText: plan.script,
    materialSource: '企业素材库',
    materialAssetIds: [],
    stitchMode: '按方案顺序匹配画面',
    transitionMode: '无转场',
    videoRatio: normalizeVideoRatio(plan.videoRatio),
    clipDuration: '3',
    matchByScript: true,
    voiceMode: '自动配音',
    voiceService: 'enterprise-voice',
    voiceName: 'auto',
    voiceVolume: '100%',
    voiceSpeed: '1.0x',
    musicSource: plan.bgm.style || '随机背景音乐',
    musicVolume: 30,
    subtitleEnabled: plan.subtitle.enabled,
    subtitleFont: 'STHeitiMedium.ttc',
    subtitlePosition: '底部（推荐）',
    subtitleStyle: plan.subtitle.style || '简洁商务字幕',
    subtitleSize: '30',
    subtitleColor: '#F3EDED',
    subtitleBackground: false,
    packagingOptions: [
      'title',
      'description',
      'tags',
      'cover',
      'count:1',
      'clipSpeed:1',
      'videoEncoder:默认（推荐）',
      'stopAt:完整视频',
      'workerThreads:2',
      `agentSkill:${plan.skill.id ?? ''}`,
      `agentSkillName:${plan.skill.name ?? ''}`
    ],
    materialTimeline: buildMaterialTimeline(plan)
  };
}

export function parseAutomationVideoTaskInput(
  body: Record<string, unknown>
): AutomationVideoTaskInput {
  const prompt = normalizeText(body.prompt, '');
  if (!prompt) {
    throw new Error('请先输入视频主题或需求');
  }

  const musicVolume = Number(body.musicVolume);

  return {
    title: typeof body.title === 'string' ? body.title : undefined,
    prompt,
    scriptLanguage: normalizeText(body.scriptLanguage, '自动检测'),
    keywords: normalizeKeywords(body.keywords),
    scriptText: typeof body.scriptText === 'string' ? body.scriptText.trim() : '',
    materialSource: normalizeText(body.materialSource, '企业素材库'),
    materialAssetIds: Array.isArray(body.materialAssetIds)
      ? body.materialAssetIds.filter((item): item is string => typeof item === 'string')
      : [],
    stitchMode: normalizeText(body.stitchMode, '按顺序拼接'),
    transitionMode: normalizeText(body.transitionMode, '无转场'),
    videoRatio: normalizeText(body.videoRatio, '竖屏 9:16'),
    clipDuration: normalizeText(body.clipDuration, '3 秒'),
    matchByScript: body.matchByScript !== false,
    voiceMode: normalizeText(body.voiceMode, '自动配音'),
    voiceService: normalizeText(body.voiceService, 'enterprise-voice'),
    voiceName: normalizeText(body.voiceName, 'auto'),
    voiceVolume: normalizeText(body.voiceVolume, '100%'),
    voiceSpeed: normalizeText(body.voiceSpeed, '1.0x'),
    musicSource: normalizeText(body.musicSource, 'AI 自动匹配音乐'),
    musicVolume: Number.isFinite(musicVolume) ? Math.max(0, Math.min(100, musicVolume)) : 30,
    subtitleEnabled: body.subtitleEnabled !== false,
    subtitleFont: normalizeText(body.subtitleFont, '企业默认字体'),
    subtitlePosition: normalizeText(body.subtitlePosition, '底部（推荐）'),
    subtitleStyle: normalizeText(body.subtitleStyle, '简洁商务字幕'),
    subtitleSize: normalizeText(body.subtitleSize, '30'),
    subtitleColor: normalizeText(body.subtitleColor, '白色'),
    subtitleBackground: body.subtitleBackground !== false,
    packagingOptions: Array.isArray(body.packagingOptions)
      ? body.packagingOptions.filter((item): item is string => typeof item === 'string')
      : ['title', 'description', 'tags', 'cover']
  };
}

export function createAutomationVideoTask(
  workspaceId: string,
  createdBy: string,
  input: AutomationVideoTaskInput
) {
  const timestamp = now();
  const taskId = randomUUID();
  const task = {
    id: taskId,
    workspaceId,
    createdBy,
    title: buildTaskTitle(input),
    prompt: input.prompt,
    scriptLanguage: input.scriptLanguage,
    keywords: input.keywords,
    scriptText: input.scriptText || null,
    materialSource: input.materialSource,
    materialAssetIds: input.materialAssetIds,
    stitchMode: input.stitchMode,
    transitionMode: input.transitionMode,
    videoRatio: input.videoRatio,
    clipDuration: input.clipDuration,
    matchByScript: input.matchByScript,
    voiceMode: input.voiceMode,
    voiceService: input.voiceService,
    voiceName: input.voiceName,
    voiceVolume: input.voiceVolume,
    voiceSpeed: input.voiceSpeed,
    musicSource: input.musicSource,
    musicVolume: input.musicVolume,
    subtitleEnabled: input.subtitleEnabled,
    subtitleFont: input.subtitleFont,
    subtitlePosition: input.subtitlePosition,
    subtitleStyle: input.subtitleStyle,
    subtitleSize: input.subtitleSize,
    subtitleColor: input.subtitleColor,
    subtitleBackground: input.subtitleBackground,
    packagingOptions: input.packagingOptions,
    status: 'generating' as AutomationVideoTaskStatus,
    resultSummary: `${buildResultSummary(input)}；已提交内置自动化剪辑引擎。`,
    engineTaskId: taskId,
    engineLogPath: null,
    outputVideos: [],
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(automationVideoTasks).values(task).run();
  return task;
}

export function createDraftTaskFromVideoPlan(
  workspaceId: string,
  createdBy: string,
  plan: CreateVideoPlanOutput
) {
  const input = mapVideoPlanToDraftInput(plan);
  const timestamp = now();
  const taskId = randomUUID();
  const task = {
    id: taskId,
    workspaceId,
    createdBy,
    title: buildTaskTitle(input),
    prompt: input.prompt,
    scriptLanguage: input.scriptLanguage,
    keywords: input.keywords,
    scriptText: input.scriptText || null,
    materialSource: input.materialSource,
    materialAssetIds: input.materialAssetIds,
    stitchMode: input.stitchMode,
    transitionMode: input.transitionMode,
    videoRatio: input.videoRatio,
    clipDuration: input.clipDuration,
    matchByScript: input.matchByScript,
    voiceMode: input.voiceMode,
    voiceService: input.voiceService,
    voiceName: input.voiceName,
    voiceVolume: input.voiceVolume,
    voiceSpeed: input.voiceSpeed,
    musicSource: input.musicSource,
    musicVolume: input.musicVolume,
    subtitleEnabled: input.subtitleEnabled,
    subtitleFont: input.subtitleFont,
    subtitlePosition: input.subtitlePosition,
    subtitleStyle: input.subtitleStyle,
    subtitleSize: input.subtitleSize,
    subtitleColor: input.subtitleColor,
    subtitleBackground: input.subtitleBackground,
    packagingOptions: [
      ...input.packagingOptions,
      encodeOption(AGENT_PLAN_OPTION_PREFIX, plan),
      encodeOption(CURRENT_CONFIG_OPTION_PREFIX, input)
    ],
    status: 'draft' as AutomationVideoTaskStatus,
    resultSummary: `知衡助手已生成初始剪辑草稿；素材覆盖率 ${plan.coverage.highQualityCoverageRate}%；警告 ${plan.warnings.length} 条。`,
    engineTaskId: null,
    engineLogPath: null,
    outputVideos: [],
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(automationVideoTasks).values(task).run();
  return task;
}

export function listAutomationVideoTasks(workspaceId: string): AutomationVideoTaskRow[] {
  return getDb()
    .select({
      id: automationVideoTasks.id,
      workspaceId: automationVideoTasks.workspaceId,
      createdBy: automationVideoTasks.createdBy,
      title: automationVideoTasks.title,
      prompt: automationVideoTasks.prompt,
      scriptLanguage: automationVideoTasks.scriptLanguage,
      keywords: automationVideoTasks.keywords,
      scriptText: automationVideoTasks.scriptText,
      materialSource: automationVideoTasks.materialSource,
      materialAssetIds: automationVideoTasks.materialAssetIds,
      stitchMode: automationVideoTasks.stitchMode,
      transitionMode: automationVideoTasks.transitionMode,
      videoRatio: automationVideoTasks.videoRatio,
      clipDuration: automationVideoTasks.clipDuration,
      matchByScript: automationVideoTasks.matchByScript,
      voiceMode: automationVideoTasks.voiceMode,
      voiceService: automationVideoTasks.voiceService,
      voiceName: automationVideoTasks.voiceName,
      voiceVolume: automationVideoTasks.voiceVolume,
      voiceSpeed: automationVideoTasks.voiceSpeed,
      musicSource: automationVideoTasks.musicSource,
      musicVolume: automationVideoTasks.musicVolume,
      subtitleEnabled: automationVideoTasks.subtitleEnabled,
      subtitleFont: automationVideoTasks.subtitleFont,
      subtitlePosition: automationVideoTasks.subtitlePosition,
      subtitleStyle: automationVideoTasks.subtitleStyle,
      subtitleSize: automationVideoTasks.subtitleSize,
      subtitleColor: automationVideoTasks.subtitleColor,
      subtitleBackground: automationVideoTasks.subtitleBackground,
      packagingOptions: automationVideoTasks.packagingOptions,
      status: automationVideoTasks.status,
      resultSummary: automationVideoTasks.resultSummary,
      engineTaskId: automationVideoTasks.engineTaskId,
      engineLogPath: automationVideoTasks.engineLogPath,
      outputVideos: automationVideoTasks.outputVideos,
      errorMessage: automationVideoTasks.errorMessage,
      createdAt: automationVideoTasks.createdAt,
      updatedAt: automationVideoTasks.updatedAt,
      creatorName: users.name
    })
    .from(automationVideoTasks)
    .innerJoin(users, eq(automationVideoTasks.createdBy, users.id))
    .where(
      and(
        eq(automationVideoTasks.workspaceId, workspaceId),
        ne(automationVideoTasks.status, 'deleted')
      )
    )
    .orderBy(desc(automationVideoTasks.createdAt))
    .all();
}

export function getAutomationVideoTask(workspaceId: string, taskId: string) {
  return getDb()
    .select()
    .from(automationVideoTasks)
    .where(
      and(eq(automationVideoTasks.workspaceId, workspaceId), eq(automationVideoTasks.id, taskId))
    )
    .get();
}

function parseTimelineNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${label} is required`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} is not a valid number`);
  }
  return Math.round(parsed * 10) / 10;
}

function findPlanTimelineItem(plan: CreateVideoPlanOutput | null, order: number) {
  return plan?.timeline.find((item) => item.order === order) ?? null;
}

function assertInsideDirectory(rootDir: string, filePath: string) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`素材路径越界：${filePath}`);
  }
}

export async function buildExecutionSnapshotForTask(
  task: AutomationVideoTask
): Promise<AutomationExecutionSnapshot> {
  const currentConfig = getTaskCurrentConfig(task);
  const agentPlan = getTaskAgentPlan(task);
  const savedTimeline = currentConfig?.materialTimeline;
  const materialTimeline: AutomationMaterialTimeline =
    Array.isArray(savedTimeline) && savedTimeline.length > 0
      ? savedTimeline
      : agentPlan
        ? buildMaterialTimeline(agentPlan)
        : [];
  if (materialTimeline.length === 0) {
    throw new Error('任务缺少知衡助手剪辑方案，无法按秒级素材方案执行');
  }

  const assetRoot = await getPath('assets');
  const resolvedAssetRoot = path.resolve(assetRoot);
  const seenFiles = new Set<string>();
  const warnings: string[] = [];
  const editTimeline = materialTimeline.map((item) => {
    if (!item.relativePath) {
      throw new Error(`第 ${item.order} 段缺少素材 relativePath`);
    }
    const sourceStart = parseTimelineNumber(item.sourceStart, `第 ${item.order} 段 sourceStart`);
    const sourceEnd = parseTimelineNumber(item.sourceEnd, `第 ${item.order} 段 sourceEnd`);
    if (sourceEnd <= sourceStart) {
      throw new Error(`第 ${item.order} 段 sourceEnd 必须大于 sourceStart`);
    }

    const sourceFile = path.resolve(resolvedAssetRoot, item.relativePath);
    assertInsideDirectory(resolvedAssetRoot, sourceFile);
    fs.accessSync(sourceFile, fs.constants.R_OK);

    const planItem = findPlanTimelineItem(agentPlan, item.order);
    const targetDuration = Math.max(0.1, item.timelineEnd - item.timelineStart);
    const sourceDuration = sourceEnd - sourceStart;
    const itemWarnings: string[] = [];
    if (Math.abs(sourceDuration - targetDuration) > 1) {
      itemWarnings.push(
        `第 ${item.order} 段源片段 ${sourceDuration.toFixed(1)}s 与时间线 ${targetDuration.toFixed(1)}s 差异较大，执行优先使用源片段起止时间`
      );
    }
    if (seenFiles.has(item.relativePath)) {
      itemWarnings.push(`第 ${item.order} 段重复使用素材：${item.relativePath}`);
    }
    seenFiles.add(item.relativePath);
    if (planItem?.cropSafety && task.videoRatio.includes('9:16')) {
      itemWarnings.push(`第 ${item.order} 段竖屏裁切提示：${planItem.cropSafety}`);
    }
    warnings.push(...itemWarnings);

    return {
      order: item.order,
      timelineStart: item.timelineStart,
      timelineEnd: item.timelineEnd,
      sourceFile,
      relativePath: item.relativePath,
      fileName: item.fileName ?? path.basename(item.relativePath),
      sourceStart,
      sourceEnd,
      scriptText: item.scriptText,
      usageRole: item.usageRole,
      matchLevel: item.matchLevel,
      matchScore: item.matchScore,
      targetDuration,
      videoRatio: task.videoRatio,
      cropSafety: planItem?.cropSafety ?? null,
      transitionIn: item.order === 1 ? 'none' : 'cut',
      transitionOut: planItem?.transitionOut ?? 'cut',
      warnings: itemWarnings
    };
  });

  return {
    version: 1,
    taskId: task.id,
    workspaceId: task.workspaceId,
    createdAt: new Date().toISOString(),
    videoRatio: task.videoRatio,
    scriptText: task.scriptText?.trim() || agentPlan?.script || '',
    voice: {
      mode: task.voiceMode,
      voiceName: task.voiceName,
      volume: task.voiceVolume,
      speed: task.voiceSpeed
    },
    subtitle: {
      enabled: task.subtitleEnabled,
      font: task.subtitleFont,
      position: task.subtitlePosition,
      style: task.subtitleStyle,
      size: task.subtitleSize,
      color: task.subtitleColor,
      background: task.subtitleBackground
    },
    bgm: {
      source: task.musicSource,
      volume: Math.min(task.musicVolume, 30)
    },
    editTimeline,
    warnings
  };
}

export async function executeAutomationVideoDraftTask(workspaceId: string, taskId: string) {
  const existing = getAutomationVideoTask(workspaceId, taskId);
  if (!existing) {
    throw new Error('任务不存在');
  }
  if (existing.status !== 'draft') {
    throw new Error('只有草稿任务可以确认执行');
  }

  const snapshot = await buildExecutionSnapshotForTask(existing);
  const packagingOptions = [
    ...withoutEncodedOptions(existing.packagingOptions),
    ...(getTaskAgentPlan(existing)
      ? [encodeOption(AGENT_PLAN_OPTION_PREFIX, getTaskAgentPlan(existing))]
      : []),
    ...(getTaskCurrentConfig(existing)
      ? [encodeOption(CURRENT_CONFIG_OPTION_PREFIX, getTaskCurrentConfig(existing))]
      : []),
    encodeOption(EXECUTION_SNAPSHOT_OPTION_PREFIX, snapshot)
  ];

  getDb()
    .update(automationVideoTasks)
    .set({
      status: 'generating',
      engineTaskId: taskId,
      outputVideos: [],
      errorMessage: null,
      packagingOptions,
      resultSummary: `已确认草稿并生成执行快照，准备按 ${snapshot.editTimeline.length} 个秒级片段执行。`,
      updatedAt: now()
    })
    .where(
      and(eq(automationVideoTasks.workspaceId, workspaceId), eq(automationVideoTasks.id, taskId))
    )
    .run();

  return {
    task: getAutomationVideoTask(workspaceId, taskId),
    snapshot
  };
}

export function updateAutomationVideoDraftTask(
  workspaceId: string,
  taskId: string,
  input: AutomationVideoTaskInput
) {
  const existing = getAutomationVideoTask(workspaceId, taskId);
  if (!existing) {
    throw new Error('任务不存在');
  }
  if (existing.status !== 'draft') {
    throw new Error('只有草稿任务可以在高级编辑工作台保存修改');
  }

  const currentConfig: AutomationDraftTaskConfig = {
    ...input,
    materialTimeline: getTaskCurrentConfig(existing)?.materialTimeline ?? []
  };
  const baseOptions = withoutEncodedOptions(input.packagingOptions);
  const originalPlan = getTaskAgentPlan(existing);
  const packagingOptions = [
    ...baseOptions,
    ...(originalPlan ? [encodeOption(AGENT_PLAN_OPTION_PREFIX, originalPlan)] : []),
    encodeOption(CURRENT_CONFIG_OPTION_PREFIX, currentConfig)
  ];
  const timestamp = now();

  getDb()
    .update(automationVideoTasks)
    .set({
      title: buildTaskTitle(input),
      prompt: input.prompt,
      scriptLanguage: input.scriptLanguage,
      keywords: input.keywords,
      scriptText: input.scriptText || null,
      materialSource: input.materialSource,
      materialAssetIds: input.materialAssetIds,
      stitchMode: input.stitchMode,
      transitionMode: input.transitionMode,
      videoRatio: input.videoRatio,
      clipDuration: input.clipDuration,
      matchByScript: input.matchByScript,
      voiceMode: input.voiceMode,
      voiceService: input.voiceService,
      voiceName: input.voiceName,
      voiceVolume: input.voiceVolume,
      voiceSpeed: input.voiceSpeed,
      musicSource: input.musicSource,
      musicVolume: input.musicVolume,
      subtitleEnabled: input.subtitleEnabled,
      subtitleFont: input.subtitleFont,
      subtitlePosition: input.subtitlePosition,
      subtitleStyle: input.subtitleStyle,
      subtitleSize: input.subtitleSize,
      subtitleColor: input.subtitleColor,
      subtitleBackground: input.subtitleBackground,
      packagingOptions,
      resultSummary: originalPlan
        ? `知衡助手草稿已更新；原始素材覆盖率 ${originalPlan.coverage.highQualityCoverageRate}%；警告 ${originalPlan.warnings.length} 条。`
        : buildResultSummary(input),
      updatedAt: timestamp
    })
    .where(
      and(eq(automationVideoTasks.workspaceId, workspaceId), eq(automationVideoTasks.id, taskId))
    )
    .run();

  return getAutomationVideoTask(workspaceId, taskId);
}

export function createAutomationVideoAsset(input: {
  workspaceId: string;
  uploadedBy: string;
  name: string;
  fileUrl: string;
  fileType: string;
  mimeType: string;
  size: number;
}): AutomationVideoAsset {
  const timestamp = now();
  const asset = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    uploadedBy: input.uploadedBy,
    name: input.name,
    fileUrl: input.fileUrl,
    fileType: input.fileType,
    mimeType: input.mimeType,
    size: input.size,
    status: 'available',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(automationVideoAssets).values(asset).run();
  return asset;
}

export function listAutomationVideoAssets(workspaceId: string) {
  return getDb()
    .select()
    .from(automationVideoAssets)
    .where(
      and(
        eq(automationVideoAssets.workspaceId, workspaceId),
        eq(automationVideoAssets.status, 'available')
      )
    )
    .orderBy(desc(automationVideoAssets.createdAt))
    .all();
}

export function softDeleteAutomationVideoTask(workspaceId: string, taskId: string) {
  const timestamp = now();
  return getDb()
    .update(automationVideoTasks)
    .set({ status: 'deleted', updatedAt: timestamp })
    .where(
      and(eq(automationVideoTasks.workspaceId, workspaceId), eq(automationVideoTasks.id, taskId))
    )
    .run();
}

export function regenerateAutomationVideoTask(workspaceId: string, taskId: string) {
  const timestamp = now();
  return getDb()
    .update(automationVideoTasks)
    .set({
      status: 'generating',
      resultSummary: '已重新提交知衡智企内置自动化剪辑引擎，正在生成视频。',
      outputVideos: [],
      errorMessage: null,
      updatedAt: timestamp
    })
    .where(
      and(eq(automationVideoTasks.workspaceId, workspaceId), eq(automationVideoTasks.id, taskId))
    )
    .run();
}
