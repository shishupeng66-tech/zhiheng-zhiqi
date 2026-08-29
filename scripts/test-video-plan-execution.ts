/**
 * Phase 3B-2 end-to-end execution test.
 *
 * It creates a real Agent video plan, saves it as a draft, confirms execution,
 * then runs the existing MoneyPrinterTurbo worker in-process so the test can
 * collect deterministic evidence for timeline clipping and final MP4 output.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import '../src/lib/agent/tools';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/db';
import { automationVideoTasks, users, workspaces } from '../src/lib/db/schema';
import { toolRegistry, type ToolExecutionContext } from '../src/lib/agent/tool-registry';
import type { CreateVideoPlanOutput } from '../src/lib/agent/tools';
import {
  createDraftTaskFromVideoPlan,
  executeAutomationVideoDraftTask,
  getTaskExecutionSnapshot
} from '../src/lib/workspaces/automation-editing';
import { getMoneyPrinterEngineDir, runMoneyPrinterTask } from '../src/lib/workspaces/moneyprinter-engine';

function ffprobeDuration(filePath: string) {
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffprobe'], {
    encoding: 'utf8',
    shell: true,
    windowsHide: true
  });
  const ffprobe =
    lookup.stdout
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || 'ffprobe';
  const result = spawnSync(
    ffprobe,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', filePath],
    {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(ffprobe),
      windowsHide: true
    }
  );
  if (result.error || !result.stdout) return null;
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null;
}

function ffmpegDuration(filePath: string) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', filePath], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const duration = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null;
}

function mediaDuration(filePath: string) {
  return ffprobeDuration(filePath) ?? ffmpegDuration(filePath);
}

async function main() {
  const db = getDb();
  const workspace = db.select().from(workspaces).where(eq(workspaces.slug, 'enterprise-media')).get();
  const user = db.select().from(users).where(eq(users.role, 'super_admin')).get();
  if (!workspace) throw new Error('enterprise-media workspace not found');
  if (!user) throw new Error('super_admin user not found');

  const tool = toolRegistry.get('create_video_plan');
  if (!tool) throw new Error('create_video_plan is not registered');

  const ctx: ToolExecutionContext = {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    workspaceId: workspace.id,
    workspaceRole: 'owner'
  };

  const plan = (await tool.execute(
    {
      userRequest: '为什么饮料代工厂一定要重视无菌灌装',
      contentType: '知识科普型',
      platform: '抖音',
      videoRatio: '9:16',
      targetDuration: 30
    },
    ctx
  )) as CreateVideoPlanOutput;

  const draft = createDraftTaskFromVideoPlan(workspace.id, user.id, plan);
  const { snapshot } = await executeAutomationVideoDraftTask(workspace.id, draft.id);
  await runMoneyPrinterTask(draft.id);

  const task = db.select().from(automationVideoTasks).where(eq(automationVideoTasks.id, draft.id)).get();
  if (!task) throw new Error(`task not found after execution: ${draft.id}`);
  const savedSnapshot = getTaskExecutionSnapshot(task) ?? snapshot;
  const engineDir = getMoneyPrinterEngineDir();
  const taskDir = `${engineDir}\\storage\\tasks\\${draft.id}`;
  const clipDir = `${taskDir}\\zhiheng-clips`;
  const clips = fs.existsSync(clipDir)
    ? fs
        .readdirSync(clipDir)
        .filter((name) => name.toLowerCase().endsWith('.mp4'))
        .map((name) => `${clipDir}\\${name}`)
    : [];

  console.log(
    JSON.stringify(
      {
        taskId: draft.id,
        status: task.status,
        title: task.title,
        outputVideos: task.outputVideos ?? [],
        errorMessage: task.errorMessage,
        engineLogPath: task.engineLogPath,
        snapshotClips: savedSnapshot.editTimeline.length,
        timelineEvidence: savedSnapshot.editTimeline.slice(0, 5).map((item, index) => ({
          order: item.order,
          relativePath: item.relativePath,
          sourceStart: item.sourceStart,
          sourceEnd: item.sourceEnd,
          expectedSourceDuration: Math.round((item.sourceEnd - item.sourceStart) * 100) / 100,
          clippedFile: clips[index] ?? null,
          clippedDuration: clips[index] ? mediaDuration(clips[index]) : null
        })),
        finalVideoEvidence: (task.outputVideos ?? []).map((filePath) => ({
          filePath,
          exists: fs.existsSync(filePath),
          duration: fs.existsSync(filePath) ? mediaDuration(filePath) : null,
          size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
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
