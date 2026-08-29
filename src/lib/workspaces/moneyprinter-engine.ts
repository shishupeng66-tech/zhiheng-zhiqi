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
import { generateVoiceAudio } from '@/lib/voice-service/client';
import { resolveSpeechVoiceId } from '@/lib/voice-service/speech-voice-catalog';
import {
  getTaskExecutionSnapshot,
  type AutomationExecutionSnapshot
} from '@/lib/workspaces/automation-editing';

type EngineRunResult = {
  task_id?: string;
  result?: {
    videos?: string[];
    combined_videos?: string[];
    script?: string;
    terms?: string[] | string;
    audio_file?: string;
    state?: number | string;
    error?: string;
  };
};

type PythonCommand = ReturnType<typeof getPythonCommand>;

type CliRunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type BuildCliArgsOptions = {
  stopAt?: string;
  videoScript?: string;
  customAudioPath?: string;
  forceNoVoice?: boolean;
  materialPathsOverride?: string[];
  bgmVolumeOverride?: number;
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

function parseCount(value: string) {
  const match = value.match(/\d+/);
  return match ? Math.max(1, Math.min(5, Number(match[0]))) : 1;
}

function mapAspect(value: string) {
  if (value.includes('16:9')) return '16:9';
  if (value.includes('1:1')) return '1:1';
  return '9:16';
}

function videoScaleFilter(value: string) {
  const aspect = mapAspect(value);
  if (aspect === '16:9') {
    return 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080';
  }
  if (aspect === '1:1') {
    return 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080';
  }
  return 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
}

function mapConcatMode(value: string) {
  return value.includes('顺序') || value.toLowerCase().includes('sequential')
    ? 'sequential'
    : 'random';
}

function mapTransition(value: string) {
  if (value.includes('随机') || value.includes('AI')) return 'shuffle';
  if (value.includes('淡入')) return 'fade-in';
  if (value.includes('淡出')) return 'fade-out';
  if (value.includes('滑入')) return 'slide-in';
  if (value.includes('滑出')) return 'slide-out';
  return 'none';
}

function mapSubtitlePosition(value: string) {
  if (value.includes('顶部')) return 'top';
  if (value.includes('中间')) return 'center';
  if (value.includes('自定义')) return 'custom';
  return 'bottom';
}

function mapTextColor(value: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (value.includes('品牌')) return '#14B8A6';
  if (value.includes('深')) return '#111827';
  return '#FFFFFF';
}

function mapVoiceName(task: AutomationVideoTask) {
  const voiceMode = task.voiceMode.toLowerCase();
  const voiceName = task.voiceName.toLowerCase();
  if (
    task.voiceMode.includes('无') ||
    task.voiceName.includes('无') ||
    voiceMode.includes('no') ||
    voiceMode.includes('silent') ||
    voiceName.includes('no') ||
    voiceName.includes('silent')
  ) {
    return 'no-voice';
  }
  return task.voiceName.trim() || 'auto';
}

function mapLanguage(value: string) {
  if (value.includes('英文')) return 'en-US';
  if (value.includes('中文') || value.includes('中英')) return 'zh-CN';
  return '';
}

function mapVoiceRate(value: string) {
  const parsed = Number(value.replace('x', ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function mapVoiceVolume(value: string) {
  const parsed = Number(value.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed / 100) : 1;
}

function readTaskOption(task: AutomationVideoTask, key: string) {
  const prefix = `${key}:`;
  return task.packagingOptions.find((option) => option.startsWith(prefix))?.slice(prefix.length);
}

function readNumberOption(task: AutomationVideoTask, key: string, fallback: number) {
  const parsed = Number(readTaskOption(task, key));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readAssetByOption(task: AutomationVideoTask, assets: AutomationVideoAsset[], key: string) {
  const assetId = readTaskOption(task, key);
  return assetId ? (assets.find((asset) => asset.id === assetId) ?? null) : null;
}

function resolveAssetPath(asset: AutomationVideoAsset | null) {
  if (!asset || !asset.fileUrl.startsWith('/uploads/')) return null;
  const filePath = path.join(repoRoot, 'public', asset.fileUrl.replace(/^\//, ''));
  return fs.existsSync(filePath) ? filePath : null;
}

function resolveAssetPaths(assets: AutomationVideoAsset[]) {
  return assets
    .map((asset) => resolveAssetPath(asset))
    .filter((filePath): filePath is string => Boolean(filePath));
}

function resolveMaterialAssetPaths(
  assets: AutomationVideoAsset[],
  customAudio: AutomationVideoAsset | null,
  customBgm: AutomationVideoAsset | null
) {
  const ignored = new Set([customAudio?.id, customBgm?.id].filter(Boolean));
  return resolveAssetPaths(assets.filter((asset) => !ignored.has(asset.id)));
}

function normalizeHexColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function mapStopAt(value: string | undefined) {
  if (!value) return 'video';
  if (value.includes('脚本')) return 'script';
  if (value.includes('关键词')) return 'terms';
  if (value.includes('音频')) return 'audio';
  if (value.includes('字幕')) return 'subtitle';
  if (value.includes('素材')) return 'materials';
  return 'video';
}

function mapVideoSource(value: string, hasLocalAssets: boolean) {
  const lowered = value.toLowerCase();
  if (hasLocalAssets || value.includes('本地')) return 'local';
  if (lowered.includes('pixabay')) return 'pixabay';
  if (lowered.includes('coverr')) return 'coverr';
  return 'pexels';
}

function mapBgmType(value: string, hasCustomFile: boolean) {
  const lowered = value.toLowerCase();
  if (hasCustomFile || value.includes('自定义') || value.includes('上传')) return 'custom';
  if (lowered.includes('sonilo')) return 'sonilo';
  if (value.includes('无') || lowered.includes('none')) return 'none';
  return 'random';
}

function ensureManagedBgmFile(engineDir: string, sourcePath: string | null, taskId: string) {
  if (!sourcePath) return null;
  const bgmDir = path.join(engineDir, 'storage', 'bgm');
  fs.mkdirSync(bgmDir, { recursive: true });
  const ext = path.extname(sourcePath) || '.mp3';
  const targetPath = path.join(bgmDir, `zhiheng-${taskId}${ext}`);
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  return targetPath;
}

function buildCliArgs(
  task: AutomationVideoTask,
  assets: AutomationVideoAsset[],
  engineDir: string,
  options: BuildCliArgsOptions = {}
) {
  const customAudioAsset = readAssetByOption(task, assets, 'customAudio');
  const customBgmAsset = readAssetByOption(task, assets, 'customBgm');
  const customAudioPath = options.customAudioPath ?? resolveAssetPath(customAudioAsset);
  const customBgmPath = ensureManagedBgmFile(engineDir, resolveAssetPath(customBgmAsset), task.id);
  const assetPaths =
    options.materialPathsOverride ??
    resolveMaterialAssetPaths(assets, customAudioAsset, customBgmAsset);
  const videoSource = mapVideoSource(task.materialSource, assetPaths.length > 0);
  const bgmType = mapBgmType(task.musicSource, Boolean(customBgmPath));
  const args = [
    'cli.py',
    '--task-id',
    task.id,
    '--video-subject',
    task.prompt,
    '--video-count',
    parseCount(String(readNumberOption(task, 'count', 1))).toString(),
    '--video-aspect',
    mapAspect(task.videoRatio),
    '--video-concat-mode',
    mapConcatMode(task.stitchMode),
    '--video-transition-mode',
    mapTransition(task.transitionMode),
    '--video-clip-duration',
    String(parseSeconds(task.clipDuration)),
    '--video-clip-speed',
    String(readNumberOption(task, 'clipSpeed', 1)),
    '--n-threads',
    String(Math.max(1, Math.min(16, Math.floor(readNumberOption(task, 'workerThreads', 2))))),
    '--stop-at',
    options.stopAt ?? mapStopAt(readTaskOption(task, 'stopAt')),
    '--paragraph-number',
    String(Math.max(1, Math.min(10, Math.floor(readNumberOption(task, 'paragraph', 1))))),
    '--voice-volume',
    String(mapVoiceVolume(task.voiceVolume)),
    '--voice-rate',
    String(mapVoiceRate(task.voiceSpeed)),
    '--bgm-type',
    bgmType,
    '--bgm-volume',
    String(Math.max(0, Math.min(1, (options.bgmVolumeOverride ?? task.musicVolume) / 100))),
    '--font-name',
    task.subtitleFont || 'STHeitiMedium.ttc',
    '--subtitle-position',
    mapSubtitlePosition(task.subtitlePosition),
    '--font-size',
    task.subtitleSize || '30',
    '--text-fore-color',
    normalizeHexColor(task.subtitleColor, mapTextColor(task.subtitleColor)),
    '--stroke-color',
    normalizeHexColor(readTaskOption(task, 'strokeColor'), '#000000'),
    '--stroke-width',
    readTaskOption(task, 'strokeWidth') ?? (task.subtitleBackground ? '1.5' : '0'),
    task.subtitleEnabled ? '--subtitle-enabled' : '--no-subtitle-enabled'
  ];

  if (customAudioPath) {
    args.push('--custom-audio-file', customAudioPath);
  } else if (options.forceNoVoice) {
    args.push('--voice-name', 'no-voice');
  } else {
    args.push('--voice-name', mapVoiceName(task));
  }

  if (customBgmPath) {
    args.push('--bgm-file', customBgmPath);
  }

  const bgmPrompt = readTaskOption(task, 'bgmPrompt');
  if (bgmPrompt && bgmType === 'sonilo') {
    args.push('--sonilo-bgm-prompt', bgmPrompt);
  }

  const customPosition = readTaskOption(task, 'customPosition');
  if (task.subtitlePosition.includes('自定义')) {
    args.push('--custom-position', customPosition || '70');
  }

  if (task.subtitleBackground) {
    args.push(
      '--subtitle-background-enabled',
      '--subtitle-background-color',
      normalizeHexColor(readTaskOption(task, 'subtitleBgColor'), '#000000')
    );
    if (readTaskOption(task, 'roundedSubtitleBackground') === 'true') {
      args.push('--rounded-subtitle-background');
    }
  } else {
    args.push('--no-subtitle-background-enabled');
  }

  const language = mapLanguage(task.scriptLanguage);
  if (language) {
    args.push('--video-language', language);
  }

  const videoScript = options.videoScript ?? task.scriptText?.trim();
  if (videoScript) {
    args.push('--video-script', videoScript);
  }

  const scriptPrompt = readTaskOption(task, 'scriptPrompt');
  if (scriptPrompt) {
    args.push('--video-script-prompt', scriptPrompt);
  }

  const customSystemPrompt = readTaskOption(task, 'customSystemPrompt');
  if (customSystemPrompt) {
    args.push('--custom-system-prompt', customSystemPrompt);
  }

  if (Array.isArray(task.keywords) && task.keywords.length > 0 && videoSource !== 'local') {
    args.push('--video-terms', task.keywords.join(','));
  }

  if (task.matchByScript) {
    args.push('--match-materials-to-script');
  }

  if (videoSource === 'local') {
    args.push('--video-source', 'local', '--video-materials', assetPaths.join(','));
  } else {
    args.push('--video-source', videoSource);
  }

  return args;
}

function shouldUseVoiceService(task: AutomationVideoTask, assets: AutomationVideoAsset[]) {
  const customAudioAsset = readAssetByOption(task, assets, 'customAudio');
  const customAudioPath = resolveAssetPath(customAudioAsset);
  if (customAudioPath) return false;
  return mapVoiceName(task) !== 'no-voice';
}

function mapVoiceId(task: AutomationVideoTask) {
  return resolveSpeechVoiceId(task.voiceName.trim() || 'auto');
}

function appendLog(logPath: string, text: string) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, text);
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 80) || 'clip';
}

function getFfmpegCommand() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], {
    encoding: 'utf8',
    shell: true,
    windowsHide: true
  });
  const resolved = lookup.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (resolved && fs.existsSync(resolved)) {
    return resolved;
  }
  throw new Error('找不到 ffmpeg，请配置 FFMPEG_PATH 或把 ffmpeg 加入系统 PATH');
}

function prepareExecutionTimelineMaterials(input: {
  snapshot: AutomationExecutionSnapshot | null;
  engineDir: string;
  taskId: string;
  logPath: string;
}) {
  if (!input.snapshot) return null;
  if (input.snapshot.editTimeline.length === 0) {
    throw new Error('执行快照中没有可裁剪的时间线片段');
  }

  const clipDir = path.join(input.engineDir, 'storage', 'tasks', input.taskId, 'zhiheng-clips');
  fs.mkdirSync(clipDir, { recursive: true });
  const ffmpeg = getFfmpegCommand();
  const filter = videoScaleFilter(input.snapshot.videoRatio);
  const clippedPaths: string[] = [];

  appendLog(
    input.logPath,
    `[${new Date().toISOString()}] execution-snapshot version=${input.snapshot.version} clips=${input.snapshot.editTimeline.length}\n`
  );

  for (const item of input.snapshot.editTimeline) {
    const duration = Math.round((item.sourceEnd - item.sourceStart) * 1000) / 1000;
    if (duration <= 0) {
      throw new Error(`第 ${item.order} 段源片段时长无效`);
    }
    fs.accessSync(item.sourceFile, fs.constants.R_OK);
    const output = path.join(
      clipDir,
      `${String(item.order).padStart(2, '0')}-${sanitizeFileName(path.basename(item.sourceFile, path.extname(item.sourceFile)))}.mp4`
    );
    const args = [
      '-y',
      '-ss',
      String(item.sourceStart),
      '-i',
      item.sourceFile,
      '-t',
      String(duration),
      '-vf',
      filter,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      output
    ];

    appendLog(
      input.logPath,
      [
        `[${new Date().toISOString()}] timeline-clip order=${item.order}`,
        `timeline=${item.timelineStart}-${item.timelineEnd}`,
        `sourceStart=${item.sourceStart}`,
        `sourceEnd=${item.sourceEnd}`,
        `source="${item.sourceFile}"`,
        `output="${output}"`
      ].join(' ') + '\n'
    );
    for (const warning of item.warnings) {
      appendLog(input.logPath, `[timeline-warning] ${warning}\n`);
    }

    const result = spawnSync(ffmpeg, args, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(ffmpeg),
      windowsHide: true
    });
    if (result.stderr) {
      appendLog(input.logPath, result.stderr);
    }
    if (result.status !== 0 || !fs.existsSync(output)) {
      const message =
        result.error?.message ||
        result.stderr?.split(/\r?\n/).filter(Boolean).slice(-8).join('\n') ||
        `ffmpeg exited with ${result.status}`;
      throw new Error(`第 ${item.order} 段素材裁剪失败：${message}`);
    }
    clippedPaths.push(output);
  }

  return clippedPaths;
}

function formatSrtTimestamp(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function getMediaDurationSeconds(filePath: string | null | undefined) {
  if (!filePath) return null;
  try {
    const ffmpeg = getFfmpegCommand();
    const result = spawnSync(ffmpeg, ['-i', filePath], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(ffmpeg),
      windowsHide: true
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const match = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } catch {
    return null;
  }
}

function splitSubtitleText(script: string, snapshot: AutomationExecutionSnapshot | null) {
  const timelineText = snapshot?.editTimeline.map((item) => item.scriptText.trim()).filter(Boolean);
  if (timelineText && timelineText.length > 0) return timelineText;
  return script
    .split(/[\n。！？!?]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function writePrebuiltSubtitle(input: {
  taskId: string;
  engineDir: string;
  snapshot: AutomationExecutionSnapshot | null;
  script: string;
  audioPath: string | null;
  audioDuration: number | null;
  logPath: string;
}) {
  if (!input.snapshot?.subtitle.enabled) return null;
  const lines = splitSubtitleText(input.script, input.snapshot);
  if (lines.length === 0) return null;
  const actualAudioDuration = getMediaDurationSeconds(input.audioPath);
  const duration = Math.max(
    actualAudioDuration ??
      input.audioDuration ??
      input.snapshot.editTimeline.at(-1)?.timelineEnd ??
      0,
    1
  );
  const segmentDuration = duration / lines.length;
  const taskDir = path.join(input.engineDir, 'storage', 'tasks', input.taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  const subtitlePath = path.join(taskDir, 'subtitle.srt');
  const content = lines
    .map((line, index) => {
      const start = index * segmentDuration;
      const end = index === lines.length - 1 ? duration : (index + 1) * segmentDuration;
      return `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${line}\n`;
    })
    .join('\n');
  fs.writeFileSync(subtitlePath, content, 'utf8');
  appendLog(
    input.logPath,
    `[${new Date().toISOString()}] prebuilt-subtitle path="${subtitlePath}" lines=${lines.length} duration=${duration}s audioDuration=${input.audioDuration ?? 'unknown'} actualAudioDuration=${actualAudioDuration ?? 'unknown'}\n`
  );
  return subtitlePath;
}

function runCliProcess(input: {
  python: PythonCommand;
  args: string[];
  engineDir: string;
  logPath: string;
  label: string;
}) {
  return new Promise<CliRunResult>((resolve) => {
    const startedAt = new Date();
    const fullArgs = [...input.python.argsPrefix, ...input.args];
    const child = spawn(input.python.command, fullArgs, {
      cwd: input.engineDir,
      env: process.env,
      windowsHide: true
    });
    const output: string[] = [];
    const errorOutput: string[] = [];
    const logStream = fs.createWriteStream(input.logPath, { flags: 'a' });
    logStream.write(
      `[${startedAt.toISOString()}] ${input.label}: ${input.python.command} ${fullArgs.join(' ')}\n`
    );

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
      logStream.end();
      resolve({ code: -1, stdout: output.join(''), stderr: error.message });
    });
    child.on('close', (code) => {
      logStream.write(`\n[${new Date().toISOString()}] ${input.label} exit=${code}\n`);
      logStream.end();
      resolve({ code, stdout: output.join(''), stderr: errorOutput.join('') });
    });
  });
}

async function prepareVoiceServiceAudio(input: {
  task: AutomationVideoTask;
  assets: AutomationVideoAsset[];
  engineDir: string;
  python: PythonCommand;
  logPath: string;
}) {
  const stopAt = mapStopAt(readTaskOption(input.task, 'stopAt'));
  if (stopAt === 'script' || stopAt === 'terms') {
    return { audioPath: null, script: input.task.scriptText?.trim() || '', duration: null };
  }
  if (!shouldUseVoiceService(input.task, input.assets)) {
    return { audioPath: null, script: input.task.scriptText?.trim() || '', duration: null };
  }

  let script = input.task.scriptText?.trim() || '';
  if (!script) {
    const scriptArgs = buildCliArgs(input.task, input.assets, input.engineDir, {
      stopAt: 'script',
      forceNoVoice: true
    });
    const scriptRun = await runCliProcess({
      python: input.python,
      args: scriptArgs,
      engineDir: input.engineDir,
      logPath: input.logPath,
      label: 'script-pass'
    });
    const parsed = extractJsonFromStdout(scriptRun.stdout);
    script = parsed?.result?.script?.trim() || '';
    if (scriptRun.code !== 0 || !script) {
      const message =
        parsed?.result?.error ||
        scriptRun.stderr.split(/\r?\n/).filter(Boolean).slice(-6).join('\n') ||
        'MoneyPrinterTurbo script generation failed before Voice Service synthesis.';
      throw new Error(message);
    }
  }

  appendLog(input.logPath, `[${new Date().toISOString()}] voice-service request started\n`);
  const voiceAudio = await generateVoiceAudio({
    text: script,
    voiceId: mapVoiceId(input.task),
    speed: mapVoiceRate(input.task.voiceSpeed),
    volume: mapVoiceVolume(input.task.voiceVolume),
    style: 'business'
  });
  appendLog(
    input.logPath,
    `[${new Date().toISOString()}] voice-service audio=${voiceAudio.audio_path} duration=${voiceAudio.duration}s\n`
  );
  return { audioPath: voiceAudio.audio_path, script, duration: voiceAudio.duration };
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
  const currentTask = task;

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
  const executionSnapshot = getTaskExecutionSnapshot(task);
  let executionMaterialPaths: string[] | null = null;
  const cliArgs = buildCliArgs(task, assets, status.engineDir);
  const args = [...python.argsPrefix, ...cliArgs];

  updateTask(taskId, {
    status: 'generating',
    engineTaskId: taskId,
    engineLogPath: logPath,
    errorMessage: null,
    resultSummary: '已进入知衡智企内置自动化剪辑引擎，正在生成视频。'
  });

  try {
    executionMaterialPaths = prepareExecutionTimelineMaterials({
      snapshot: executionSnapshot,
      engineDir: status.engineDir,
      taskId,
      logPath
    });
    const voiceAudio = await prepareVoiceServiceAudio({
      task,
      assets,
      engineDir: status.engineDir,
      python,
      logPath
    });
    writePrebuiltSubtitle({
      taskId,
      engineDir: status.engineDir,
      snapshot: executionSnapshot,
      script: executionSnapshot?.scriptText || voiceAudio.script || task.scriptText || '',
      audioPath: voiceAudio.audioPath,
      audioDuration: voiceAudio.duration,
      logPath
    });
    const nextCliArgs = buildCliArgs(task, assets, status.engineDir, {
      customAudioPath: voiceAudio.audioPath ?? undefined,
      videoScript: executionSnapshot?.scriptText || voiceAudio.script || undefined,
      materialPathsOverride: executionMaterialPaths ?? undefined,
      bgmVolumeOverride: executionSnapshot?.bgm.volume
    });
    const run = await runCliProcess({
      python,
      args: nextCliArgs,
      engineDir: status.engineDir,
      logPath,
      label: 'video-pass'
    });
    const parsed = extractJsonFromStdout(run.stdout);
    const videos = findGeneratedVideos(status.engineDir, taskId);
    const parsedVideos = parsed?.result?.videos ?? [];
    const script = parsed?.result?.script || voiceAudio.script || task.scriptText || '';
    const terms = parsed?.result?.terms;
    const termsText = Array.isArray(terms) ? terms.join(', ') : terms || task.keywords.join(', ');

    if (run.code === 0 && (videos.length > 0 || parsedVideos.length > 0)) {
      updateTask(taskId, {
        status: 'pending_review',
        outputVideos: videos.length > 0 ? videos : parsedVideos,
        errorMessage: null,
        resultSummary: [
          `Voice Service and automation engine generated ${videos.length || parsedVideos.length} video(s).`,
          executionSnapshot
            ? `Executed ${executionSnapshot.editTimeline.length} confirmed timeline clip(s).`
            : '',
          termsText ? `Keywords: ${termsText}` : '',
          script ? `Script: ${script.slice(0, 120)}${script.length > 120 ? '...' : ''}` : ''
        ]
          .filter(Boolean)
          .join(' ')
      });
    } else {
      const message =
        parsed?.result?.error ||
        run.stderr.split(/\r?\n/).filter(Boolean).slice(-6).join('\n') ||
        `Video engine exit code: ${run.code}`;
      updateTask(taskId, {
        status: 'failed',
        outputVideos: videos,
        errorMessage: message,
        resultSummary: 'Automation editing engine failed. Check the task log for details.'
      });
    }
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(logPath, `\n[${new Date().toISOString()}] automation-execution-error ${message}\n`);
    updateTask(taskId, {
      status: 'failed',
      errorMessage: message,
      resultSummary:
        'Automation execution failed. Check the task log for the exact stage and message.'
    });
    return;
  }

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
      const script = parsed?.result?.script || currentTask.scriptText || '';
      const terms = parsed?.result?.terms;
      const termsText = Array.isArray(terms)
        ? terms.join('、')
        : terms || currentTask.keywords.join('、');

      if (code === 0 && (videos.length > 0 || parsedVideos.length > 0)) {
        updateTask(taskId, {
          status: 'pending_review',
          outputVideos: videos.length > 0 ? videos : parsedVideos,
          errorMessage: null,
          resultSummary: [
            `内置自动化剪辑引擎已生成 ${videos.length || parsedVideos.length} 个视频。`,
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
