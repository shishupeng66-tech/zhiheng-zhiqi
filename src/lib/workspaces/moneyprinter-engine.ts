import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  automationVideoAssets,
  automationVideoTasks,
  type AutomationVideoAsset,
  type AutomationVideoTask,
  type AutomationVideoTaskStatus
} from '@/lib/db/schema';

type EngineRunResult = {
  task_id?: string;
  result?: {
    videos?: string[];
    combined_videos?: string[];
    script?: string;
    terms?: string[] | string;
    state?: number | string;
    error?: string;
  };
};

const repoRoot = /* turbopackIgnore: true */ process.cwd();

export function getMoneyPrinterEngineDir() {
  return path.resolve(
    process.env.MONEYPRINTER_ENGINE_DIR ||
      path.join(/* turbopackIgnore: true */ repoRoot, 'engines/moneyprinterturbo')
  );
}

function commandExists(command: string) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
    shell: false
  });
  return result.status === 0;
}

function getPythonCommand() {
  if (process.env.MONEYPRINTER_PYTHON) {
    return { command: process.env.MONEYPRINTER_PYTHON, argsPrefix: [] as string[] };
  }

  const venvPython = path.join(getMoneyPrinterEngineDir(), '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    return { command: venvPython, argsPrefix: [] as string[] };
  }

  const python312 = 'C:\\Python312\\python.exe';
  if (process.platform === 'win32' && fs.existsSync(python312)) {
    return { command: python312, argsPrefix: [] as string[] };
  }

  if (commandExists('uv')) {
    return { command: 'uv', argsPrefix: ['run', 'python'] };
  }

  return {
    command: process.platform === 'win32' ? 'python' : 'python3',
    argsPrefix: [] as string[]
  };
}

export function getMoneyPrinterEngineStatus() {
  const engineDir = getMoneyPrinterEngineDir();
  const python = getPythonCommand();
  const cliPath = path.join(engineDir, 'cli.py');
  return {
    engineDir,
    cliPath,
    enginePresent: fs.existsSync(cliPath),
    configPresent: fs.existsSync(path.join(engineDir, 'config.toml')),
    configExamplePresent: fs.existsSync(path.join(engineDir, 'config.example.toml')),
    storageDir: path.join(engineDir, 'storage'),
    command: [python.command, ...python.argsPrefix, 'cli.py'].join(' ')
  };
}

function parseSeconds(value: string) {
  const match = value.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 3;
}

function mapAspect(value: string) {
  if (value.includes('16:9')) return '16:9';
  if (value.includes('1:1')) return '1:1';
  return '9:16';
}

function mapConcatMode(value: string) {
  return value.includes('顺序') || value.toLowerCase().includes('sequential')
    ? 'sequential'
    : 'random';
}

function mapTransition(value: string) {
  if (value.includes('淡入') || value.includes('淡出')) return 'fade-in';
  if (value.includes('AI') || value.includes('随机')) return 'shuffle';
  return 'none';
}

function mapSubtitlePosition(value: string) {
  if (value.includes('顶部')) return 'top';
  if (value.includes('中')) return 'center';
  return 'bottom';
}

function mapTextColor(value: string) {
  if (value.includes('品牌')) return '#14B8A6';
  if (value.includes('深')) return '#111827';
  return '#FFFFFF';
}

function mapVoiceName(task: AutomationVideoTask) {
  const voiceMode = task.voiceMode.toLowerCase();
  if (task.voiceMode.includes('无') || voiceMode.includes('no') || voiceMode.includes('silent')) {
    return 'no-voice';
  }
  return 'zh-CN-XiaoxiaoNeural-Female';
}

function mapVoiceRate(value: string) {
  const parsed = Number(value.replace('x', ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function mapVoiceVolume(value: string) {
  const parsed = Number(value.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed / 100) : 1;
}

function resolveAssetPaths(assets: AutomationVideoAsset[]) {
  return assets
    .map((asset) => {
      if (!asset.fileUrl.startsWith('/uploads/')) return null;
      return path.join(repoRoot, 'public', asset.fileUrl.replace(/^\//, ''));
    })
    .filter((filePath): filePath is string => Boolean(filePath && fs.existsSync(filePath)));
}

function buildCliArgs(task: AutomationVideoTask, assets: AutomationVideoAsset[]) {
  const assetPaths = resolveAssetPaths(assets);
  const args = [
    'cli.py',
    '--task-id',
    task.id,
    '--video-subject',
    task.prompt,
    '--video-count',
    '1',
    '--video-aspect',
    mapAspect(task.videoRatio),
    '--video-concat-mode',
    mapConcatMode(task.stitchMode),
    '--video-transition-mode',
    mapTransition(task.transitionMode),
    '--video-clip-duration',
    String(parseSeconds(task.clipDuration)),
    '--n-threads',
    '2',
    '--voice-name',
    mapVoiceName(task),
    '--voice-volume',
    String(mapVoiceVolume(task.voiceVolume)),
    '--voice-rate',
    String(mapVoiceRate(task.voiceSpeed)),
    '--bgm-type',
    task.musicSource.includes('不使用') || task.musicSource.toLowerCase().includes('no')
      ? 'none'
      : 'random',
    '--bgm-volume',
    String(Math.max(0, Math.min(1, task.musicVolume / 100))),
    '--font-name',
    'STHeitiMedium.ttc',
    '--subtitle-position',
    mapSubtitlePosition(task.subtitlePosition),
    '--font-size',
    task.subtitleSize || '30',
    '--text-fore-color',
    mapTextColor(task.subtitleColor),
    '--stroke-color',
    '#000000',
    '--stroke-width',
    task.subtitleBackground ? '1.5' : '0',
    task.subtitleEnabled ? '--subtitle-enabled' : '--no-subtitle-enabled'
  ];

  if (task.scriptText?.trim()) {
    args.push('--video-script', task.scriptText.trim());
  }

  if (Array.isArray(task.keywords) && task.keywords.length > 0 && assetPaths.length === 0) {
    args.push('--video-terms', task.keywords.join(','));
  }

  if (task.matchByScript) {
    args.push('--match-materials-to-script');
  }

  if (assetPaths.length > 0) {
    args.push('--video-source', 'local', '--video-materials', assetPaths.join(','));
  } else {
    args.push('--video-source', 'pexels');
  }

  return args;
}

function getTaskAssets(task: AutomationVideoTask) {
  const assetIds = Array.isArray(task.materialAssetIds) ? task.materialAssetIds : [];
  if (assetIds.length === 0) return [];
  return getDb()
    .select()
    .from(automationVideoAssets)
    .where(
      and(
        eq(automationVideoAssets.workspaceId, task.workspaceId),
        inArray(automationVideoAssets.id, assetIds)
      )
    )
    .all();
}

function updateTask(
  taskId: string,
  values: Partial<{
    status: AutomationVideoTaskStatus;
    resultSummary: string | null;
    engineTaskId: string | null;
    engineLogPath: string | null;
    outputVideos: string[] | null;
    errorMessage: string | null;
  }>
) {
  getDb()
    .update(automationVideoTasks)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(automationVideoTasks.id, taskId))
    .run();
}

export function startMoneyPrinterTaskWorker(taskId: string) {
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(
    process.execPath,
    [tsxCli, 'scripts/run-moneyprinter-task.ts', '--task-id', taskId],
    {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      env: process.env
    }
  );
  child.unref();
}

export function getAutomationTaskForEngine(taskId: string) {
  return getDb()
    .select()
    .from(automationVideoTasks)
    .where(eq(automationVideoTasks.id, taskId))
    .get();
}

function extractJsonFromStdout(stdout: string): EngineRunResult | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]) as EngineRunResult;
    } catch {
      // Keep scanning; MoneyPrinterTurbo writes logs around the final JSON line.
    }
  }
  return null;
}

function findGeneratedVideos(engineDir: string, taskId: string) {
  const taskDir = path.join(engineDir, 'storage', 'tasks', taskId);
  if (!fs.existsSync(taskDir)) return [];
  return fs
    .readdirSync(taskDir)
    .filter((fileName) => /^final-\d+\.mp4$/i.test(fileName))
    .sort()
    .map((fileName) => path.join(taskDir, fileName));
}

export async function runMoneyPrinterTask(taskId: string) {
  const task = getAutomationTaskForEngine(taskId);
  if (!task) {
    throw new Error(`automation video task not found: ${taskId}`);
  }

  const status = getMoneyPrinterEngineStatus();
  if (!status.enginePresent) {
    updateTask(taskId, {
      status: 'failed',
      errorMessage: `内置视频引擎不存在：${status.cliPath}`,
      resultSummary: '内置视频引擎未找到，任务无法开始。'
    });
    return;
  }

  const storageDir = path.join(status.engineDir, 'storage');
  const logsDir = path.join(storageDir, 'zhiheng-logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${taskId}.log`);
  const assets = getTaskAssets(task);
  const python = getPythonCommand();
  const cliArgs = buildCliArgs(task, assets);
  const args = [...python.argsPrefix, ...cliArgs];

  updateTask(taskId, {
    status: 'generating',
    engineTaskId: taskId,
    engineLogPath: logPath,
    errorMessage: null,
    resultSummary: '已进入知衡智企内置自动化剪辑引擎，正在生成视频。'
  });

  await new Promise<void>((resolve) => {
    const startedAt = new Date();
    const child = spawn(python.command, args, {
      cwd: status.engineDir,
      env: process.env,
      windowsHide: true
    });
    const output: string[] = [];
    const errorOutput: string[] = [];
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`[${startedAt.toISOString()}] ${python.command} ${args.join(' ')}\n`);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output.push(text);
      logStream.write(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      errorOutput.push(text);
      logStream.write(text);
    });
    child.on('error', (error) => {
      logStream.write(`\n[worker-error] ${error.message}\n`);
      updateTask(taskId, {
        status: 'failed',
        errorMessage: error.message,
        resultSummary: '自动化剪辑引擎启动失败，请检查 Python、uv 和 FFmpeg 运行环境。'
      });
      logStream.end();
      resolve();
    });
    child.on('close', (code) => {
      const stdout = output.join('');
      const stderr = errorOutput.join('');
      const parsed = extractJsonFromStdout(stdout);
      const videos = findGeneratedVideos(status.engineDir, taskId);
      const parsedVideos = parsed?.result?.videos ?? [];
      const script = parsed?.result?.script || task.scriptText || '';
      const terms = parsed?.result?.terms;
      const termsText = Array.isArray(terms) ? terms.join('、') : terms || task.keywords.join('、');

      if (code === 0 && (videos.length > 0 || parsedVideos.length > 0)) {
        updateTask(taskId, {
          status: 'pending_review',
          outputVideos: videos.length > 0 ? videos : parsedVideos,
          errorMessage: null,
          resultSummary: [
            `内置自动化剪辑引擎已生成 ${videos.length} 个视频。`,
            termsText ? `关键词：${termsText}` : '',
            script ? `脚本：${script.slice(0, 120)}${script.length > 120 ? '...' : ''}` : ''
          ]
            .filter(Boolean)
            .join(' ')
        });
      } else {
        const message =
          parsed?.result?.error ||
          stderr.split(/\r?\n/).filter(Boolean).slice(-6).join('\n') ||
          `视频引擎退出码：${code}`;
        updateTask(taskId, {
          status: 'failed',
          outputVideos: videos,
          errorMessage: message,
          resultSummary: '自动化剪辑引擎执行失败，详情请查看任务日志。'
        });
      }

      logStream.write(`\n[${new Date().toISOString()}] exit=${code}\n`);
      logStream.end();
      resolve();
    });
  });
}
