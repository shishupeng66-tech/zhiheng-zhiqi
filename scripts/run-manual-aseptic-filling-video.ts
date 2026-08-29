/**
 * Manual automation-editing smoke run.
 *
 * This intentionally does not call the Agent, create_video_plan, LLM, or
 * search_video_assets. It builds a confirmed draft from a hand-written timeline
 * and runs the existing Voice Service + MoneyPrinterTurbo execution chain.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/db';
import { automationVideoTasks, users, workspaces } from '../src/lib/db/schema';
import {
  executeAutomationVideoDraftTask,
  getTaskExecutionSnapshot,
  type AutomationDraftTaskConfig,
  type AutomationMaterialTimeline
} from '../src/lib/workspaces/automation-editing';
import { runMoneyPrinterTask } from '../src/lib/workspaces/moneyprinter-engine';

const CURRENT_CONFIG_OPTION_PREFIX = 'currentTaskConfig:';

const scriptText = [
  '为什么饮料代工厂要重视无菌灌装？因为它直接关系到产品稳定和消费者安全。',
  '原料验收、车间消杀、设备状态和人员规范，每一步都会影响最终品质。',
  '无菌灌装不是一个单独设备，而是一套从研发、生产到品控的流程管理。',
  '把这些细节做好，企业才能减少风险，也让客户更放心，这也是客户选择合作时会重点关注的能力。'
].join('\n');

const timelineRows = [
  {
    relativePath: '08-工厂环境/02_公司环境_1.mp4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '开场展示工厂环境，引出饮料代工的生产场景。'
  },
  {
    relativePath: '03-研发操作/02_原材料验收_1.mp4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '原料进入工厂后，先进行验收和基础检查。'
  },
  {
    relativePath: '03-研发操作/06_原材料验收_2.mp4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '用原材料验收画面承接过程控制。'
  },
  {
    relativePath: '08-工厂环境/06_进车间消杀流程_1.mp4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '进入车间前的消杀流程，对应洁净生产要求。'
  },
  {
    relativePath: '07-生产线·灌装/01_无菌_1.MP4',
    sourceStart: 0,
    sourceEnd: 3.2,
    scriptText: '无菌灌装设备运行，说明灌装环节的重要性。'
  },
  {
    relativePath: '07-生产线·灌装/07_无菌_2.MP4',
    sourceStart: 0,
    sourceEnd: 3.2,
    scriptText: '继续展示灌装线细节，强调稳定生产。'
  },
  {
    relativePath: '07-生产线·灌装/03_生产线大景_1.MP4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '生产线大景，体现生产流程的连续性。'
  },
  {
    relativePath: '07-生产线·灌装/09_生产线大景_2.MP4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '不同生产线角度，避免镜头重复。'
  },
  {
    relativePath: '03-研发操作/03_品控_1.MP4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '品控画面，对应过程检查。'
  },
  {
    relativePath: '03-研发操作/07_品控_2.mp4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '补充品控细节，说明检查贯穿生产过程。'
  },
  {
    relativePath: '06-包材特写/01_贴标_1.mp4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '包装和贴标画面，衔接最终交付。'
  },
  {
    relativePath: '08-工厂环境/05_超洁净设备安装_1.mp4',
    sourceStart: 0,
    sourceEnd: 3,
    scriptText: '洁净设备画面收束，强调长期信任。'
  }
];

function encodeOption(prefix: string, value: unknown) {
  return `${prefix}${JSON.stringify(value)}`;
}

function durationFromFfmpeg(filePath: string) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', filePath], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null;
}

async function main() {
  const db = getDb();
  const workspace = db.select().from(workspaces).where(eq(workspaces.slug, 'enterprise-media')).get();
  const user = db.select().from(users).where(eq(users.role, 'super_admin')).get();
  if (!workspace) throw new Error('enterprise-media workspace not found');
  if (!user) throw new Error('super_admin user not found');

  const materialTimeline: AutomationMaterialTimeline = timelineRows.map((item, index) => {
    const timelineStart = Math.round(
      timelineRows.slice(0, index).reduce((sum, row) => sum + (row.sourceEnd - row.sourceStart), 0) * 10
    ) / 10;
    const duration = item.sourceEnd - item.sourceStart;
    return {
      order: index + 1,
      timelineStart,
      timelineEnd: Math.round((timelineStart + duration) * 10) / 10,
      scriptText: item.scriptText,
      fileName: item.relativePath.split('/').pop() ?? item.relativePath,
      relativePath: item.relativePath,
      sourceStart: item.sourceStart,
      sourceEnd: item.sourceEnd,
      usageRole: index === 0 ? 'Hook' : '正文B-roll',
      matchLevel: 'manual',
      matchScore: 1
    };
  });

  const input: AutomationDraftTaskConfig = {
    title: '为什么饮料代工厂一定要重视无菌灌装',
    prompt: '为什么饮料代工厂一定要重视无菌灌装',
    scriptLanguage: '简体中文',
    keywords: ['无菌灌装', '饮料代工', '食品安全', '品控', '生产流程'],
    scriptText,
    materialSource: '企业素材库',
    materialAssetIds: [],
    stitchMode: '按方案顺序匹配画面',
    transitionMode: '无转场',
    videoRatio: '竖屏 9:16（抖音视频）',
    clipDuration: '3',
    matchByScript: true,
    voiceMode: '自动配音',
    voiceService: 'enterprise-voice',
    voiceName: 'auto',
    voiceVolume: '100%',
    voiceSpeed: '1.0x',
    musicSource: '随机背景音乐',
    musicVolume: 20,
    subtitleEnabled: true,
    subtitleFont: 'STHeitiMedium.ttc',
    subtitlePosition: '底部（推荐）',
    subtitleStyle: '简洁商务字幕',
    subtitleSize: '30',
    subtitleColor: '#FFFFFF',
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
      'workerThreads:2'
    ],
    materialTimeline
  };

  const now = new Date();
  const taskId = randomUUID();
  const task = {
    id: taskId,
    workspaceId: workspace.id,
    createdBy: user.id,
    title: input.title!,
    prompt: input.prompt,
    scriptLanguage: input.scriptLanguage,
    keywords: input.keywords,
    scriptText: input.scriptText,
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
    packagingOptions: [...input.packagingOptions, encodeOption(CURRENT_CONFIG_OPTION_PREFIX, input)],
    status: 'draft' as const,
    resultSummary: '人工制定剪辑方案，未调用 Agent/LLM/素材搜索工具。',
    engineTaskId: null,
    engineLogPath: null,
    outputVideos: [],
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  };

  db.insert(automationVideoTasks).values(task).run();
  await executeAutomationVideoDraftTask(workspace.id, taskId);
  await runMoneyPrinterTask(taskId);

  const finished = db.select().from(automationVideoTasks).where(eq(automationVideoTasks.id, taskId)).get();
  if (!finished) throw new Error(`task not found: ${taskId}`);
  const snapshot = getTaskExecutionSnapshot(finished);
  const clipDir = `D:\\知衡智企\\engines\\moneyprinterturbo\\storage\\tasks\\${taskId}\\zhiheng-clips`;
  const clips = fs.existsSync(clipDir)
    ? fs
        .readdirSync(clipDir)
        .filter((name) => name.toLowerCase().endsWith('.mp4'))
        .sort()
        .map((name) => `${clipDir}\\${name}`)
    : [];

  console.log(
    JSON.stringify(
      {
        taskId,
        status: finished.status,
        errorMessage: finished.errorMessage,
        outputVideos: finished.outputVideos ?? [],
        outputEvidence: (finished.outputVideos ?? []).map((filePath) => ({
          filePath,
          exists: fs.existsSync(filePath),
          size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
          duration: fs.existsSync(filePath) ? durationFromFfmpeg(filePath) : null
        })),
        engineLogPath: finished.engineLogPath,
        distinctSourceSegments: new Set(timelineRows.map((row) => `${row.relativePath}:${row.sourceStart}-${row.sourceEnd}`)).size,
        requestedTimelineDuration: materialTimeline.at(-1)?.timelineEnd ?? 0,
        snapshotWarnings: snapshot?.warnings ?? [],
        clippedEvidence: clips.map((filePath, index) => ({
          order: index + 1,
          filePath,
          size: fs.statSync(filePath).size,
          duration: durationFromFfmpeg(filePath)
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
