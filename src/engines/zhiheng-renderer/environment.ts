/**
 * Environment Preflight —— 渲染环境预检。
 *
 * 在第一次执行媒体处理前检测渲染环境是否满足要求。
 * 缺少必需能力时不进入 preprocess，返回 ENVIRONMENT_CHECK_FAILED。
 *
 * 检测项：
 * - ffmpeg executable（必需）
 * - ffprobe executable（推荐，缺失时使用 ffmpeg -i fallback 并记录 warning）
 * - ffmpeg version
 * - zscale filter（必需，HDR→SDR 依赖）
 * - tonemap filter（必需，HDR→SDR 依赖）
 * - ass filter（V0.1 必需依赖，提前检测）
 * - ffv1 encoder（必需，中间无损格式）
 * - libx264 encoder（V0.1 最终输出依赖，提前检测）
 *
 * 规则：
 * - 不自动安装软件
 * - 不改系统 PATH
 * - 不擅自下载 FFmpeg
 * - V0.1 先使用当前机器真实可用的 FFmpeg，记录 source: system_fallback / configured_binary
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// 类型定义
// ============================================================================

export type EnvironmentDependencySource =
  | 'configured_binary' // 通过配置指定的路径
  | 'system_path' // 系统 PATH 中找到
  | 'hermes_imageio' // hermes-agent imageio-ffmpeg 打包
  | 'not_found';

export interface EnvironmentFilterInfo {
  name: string;
  available: boolean;
}

export interface EnvironmentEncoderInfo {
  name: string;
  available: boolean;
}

export interface RendererEnvironmentReport {
  ready: boolean;
  ffmpegPath: string | null;
  ffmpegSource: EnvironmentDependencySource;
  ffprobePath: string | null;
  ffprobeSource: EnvironmentDependencySource;
  ffmpegVersion: string | null;
  filters: EnvironmentFilterInfo[];
  encoders: EnvironmentEncoderInfo[];
  warnings: string[];
  errors: string[];
  checkedAt: string;
}

// 必需能力（缺失则 ready=false）
const REQUIRED_FILTERS = ['zscale', 'tonemap'];
const REQUIRED_ENCODERS = ['ffv1'];
// 推荐能力（缺失则 warning，但 V0.1 仍需提前检测）
const RECOMMENDED_FILTERS = ['ass'];
const RECOMMENDED_ENCODERS = ['libx264'];

// ============================================================================
// ffmpeg / ffprobe 路径解析
// ============================================================================

/**
 * 解析 ffmpeg 可执行文件路径。
 * 优先级：
 * 1. 环境变量 FFMPEG_PATH
 * 2. 系统 PATH 中的 ffmpeg
 * 3. hermes-agent imageio-ffmpeg 打包的 ffmpeg（开发环境常见）
 */
function resolveFfmpegPath(): { path: string | null; source: EnvironmentDependencySource } {
  // 1. 环境变量
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return { path: process.env.FFMPEG_PATH, source: 'configured_binary' };
  }

  // 2. 系统 PATH
  const systemResult = spawnSync('where', ['ffmpeg'], { encoding: 'utf8', shell: true });
  if (systemResult.status === 0 && systemResult.stdout) {
    const firstLine = systemResult.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    if (firstLine && fs.existsSync(firstLine)) {
      return { path: firstLine, source: 'system_path' };
    }
  }

  // 3. hermes-agent imageio-ffmpeg
  const hermesFfmpeg = path.join(
    process.env.LOCALAPPDATA || '',
    'hermes',
    'hermes-agent',
    'venv',
    'Lib',
    'site-packages',
    'imageio_ffmpeg',
    'binaries',
    'ffmpeg-win-x86_64-v7.1.exe'
  );
  if (fs.existsSync(hermesFfmpeg)) {
    return { path: hermesFfmpeg, source: 'hermes_imageio' };
  }

  return { path: null, source: 'not_found' };
}

/**
 * 解析 ffprobe 可执行文件路径。
 * 优先级：
 * 1. 环境变量 FFPROBE_PATH
 * 2. 系统 PATH 中的 ffprobe
 * 3. ffmpeg 同目录下的 ffprobe
 */
function resolveFfprobePath(ffmpegPath: string | null): {
  path: string | null;
  source: EnvironmentDependencySource;
} {
  // 1. 环境变量
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return { path: process.env.FFPROBE_PATH, source: 'configured_binary' };
  }

  // 2. 系统 PATH
  const systemResult = spawnSync('where', ['ffprobe'], { encoding: 'utf8', shell: true });
  if (systemResult.status === 0 && systemResult.stdout) {
    const firstLine = systemResult.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    if (firstLine && fs.existsSync(firstLine)) {
      return { path: firstLine, source: 'system_path' };
    }
  }

  // 3. ffmpeg 同目录
  if (ffmpegPath) {
    const ffprobeInSameDir = path.join(path.dirname(ffmpegPath), 'ffprobe.exe');
    if (fs.existsSync(ffprobeInSameDir)) {
      return { path: ffprobeInSameDir, source: 'system_path' };
    }
  }

  return { path: null, source: 'not_found' };
}

// ============================================================================
// ffmpeg 版本和能力检测
// ============================================================================

function getFfmpegVersion(ffmpegPath: string): string | null {
  const result = spawnSync(ffmpegPath, ['-version'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0) return null;
  const firstLine = result.stdout?.split(/\r?\n/)[0]?.trim();
  return firstLine || null;
}

function checkFilter(ffmpegPath: string, filterName: string): boolean {
  const result = spawnSync(ffmpegPath, ['-filters'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0) return false;
  // 过滤行格式：" T... zscale            Convert to/from linear colorspace..."
  const regex = new RegExp(`^\\s+[A-Z.]+\\s+${filterName}\\s+`, 'm');
  return regex.test(result.stdout || '');
}

function checkEncoder(ffmpegPath: string, encoderName: string): boolean {
  const result = spawnSync(ffmpegPath, ['-encoders'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0) return false;
  // 编码器行格式：" V..... ffv1                 FFmpeg video codec #1 in FFV1..."
  const regex = new RegExp(`^\\s+[A-Z.]+\\s+${encoderName}\\s+`, 'm');
  return regex.test(result.stdout || '');
}

// ============================================================================
// 主入口：runEnvironmentPreflight
// ============================================================================

/**
 * 执行环境预检。
 *
 * @returns RendererEnvironmentReport
 */
export function runEnvironmentPreflight(): RendererEnvironmentReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. 解析 ffmpeg
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg.path) {
    errors.push(
      '未找到 ffmpeg 可执行文件。请配置 FFMPEG_PATH 环境变量，或将 ffmpeg 加入系统 PATH。'
    );
  }

  // 2. 解析 ffprobe
  const ffprobe = resolveFfprobePath(ffmpeg.path);
  if (!ffprobe.path) {
    warnings.push(
      '未找到 ffprobe。将使用 ffmpeg -i 作为媒体探测 fallback。建议安装完整 FFmpeg 发行版（包含 ffprobe）以获得结构化 JSON 输出。'
    );
  }

  // 3. ffmpeg 版本
  let ffmpegVersion: string | null = null;
  if (ffmpeg.path) {
    ffmpegVersion = getFfmpegVersion(ffmpeg.path);
    if (!ffmpegVersion) {
      errors.push('无法获取 ffmpeg 版本信息。ffmpeg 可能损坏或无法执行。');
    }
  }

  // 4. 滤镜检测
  const filters: EnvironmentFilterInfo[] = [];
  const allFilterNames = [...REQUIRED_FILTERS, ...RECOMMENDED_FILTERS];
  for (const filterName of allFilterNames) {
    const available = ffmpeg.path ? checkFilter(ffmpeg.path, filterName) : false;
    filters.push({ name: filterName, available });
    if (!available && REQUIRED_FILTERS.includes(filterName)) {
      errors.push(`必需滤镜 ${filterName} 不可用。当前 ffmpeg 构建未包含此滤镜。`);
    }
    if (!available && RECOMMENDED_FILTERS.includes(filterName)) {
      warnings.push(`推荐滤镜 ${filterName} 不可用。V0.1 最终合成需要此滤镜。`);
    }
  }

  // 5. 编码器检测
  const encoders: EnvironmentEncoderInfo[] = [];
  const allEncoderNames = [...REQUIRED_ENCODERS, ...RECOMMENDED_ENCODERS];
  for (const encoderName of allEncoderNames) {
    const available = ffmpeg.path ? checkEncoder(ffmpeg.path, encoderName) : false;
    encoders.push({ name: encoderName, available });
    if (!available && REQUIRED_ENCODERS.includes(encoderName)) {
      errors.push(`必需编码器 ${encoderName} 不可用。当前 ffmpeg 构建未包含此编码器。`);
    }
    if (!available && RECOMMENDED_ENCODERS.includes(encoderName)) {
      warnings.push(`推荐编码器 ${encoderName} 不可用。V0.1 最终输出需要此编码器。`);
    }
  }

  const ready = errors.length === 0;

  return {
    ready,
    ffmpegPath: ffmpeg.path,
    ffmpegSource: ffmpeg.source,
    ffprobePath: ffprobe.path,
    ffprobeSource: ffprobe.source,
    ffmpegVersion,
    filters,
    encoders,
    warnings,
    errors,
    checkedAt: new Date().toISOString()
  };
}

// ============================================================================
// 便捷函数：执行 ffmpeg 命令（统一处理 Windows .cmd 包装器）
// ============================================================================

/**
 * 执行 ffmpeg 命令，返回结果。
 * 统一处理 Windows 上 .cmd 包装器需要 shell 的问题。
 */
export function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  options: { timeout?: number; maxBuffer?: number } = {}
): { status: number | null; stdout: string; stderr: string; error?: Error } {
  const isCmd = ffmpegPath.toLowerCase().endsWith('.cmd');
  const result = spawnSync(ffmpegPath, args, {
    encoding: 'utf8',
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    timeout: options.timeout,
    windowsHide: true,
    shell: isCmd // .cmd 包装器需要 shell
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error
  };
}
