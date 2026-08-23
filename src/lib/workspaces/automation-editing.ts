import { desc, eq, and, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import {
  automationVideoAssets,
  automationVideoTasks,
  users,
  type AutomationVideoAsset,
  type AutomationVideoTask,
  type AutomationVideoTaskStatus
} from '@/lib/db/schema';

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
