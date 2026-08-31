/**
 * Per-Segment Preprocess —— 单片段标准化预处理。
 *
 * 输入：Timeline video segment + ResolvedAsset + AssetProbeResult + OutputProfile + 工作目录
 * 输出：NormalizedSegment（FFV1 + yuv420p10le + .mkv）
 *
 * 处理步骤：
 * 1. 裁剪：sourceStart + duration（-ss fast seek + -t）
 * 2. 旋转：如果 probe 检测到 displaymatrix rotation，应用 transpose
 * 3. scale/crop：cover 填满 1080x1920，center crop，禁止 stretch
 * 4. HDR/HLG → SDR：
 *    - SDR：不做 tone mapping
 *    - HLG/PQ：zscale(linear) → tonemap(hable) → zscale(bt709)
 *    - UNKNOWN：不擅自 tone map，warning
 * 5. fps：统一到 targetFps
 * 6. format：yuv420p10le
 * 7. 编码：FFV1 level 3，Matroska .mkv
 *
 * 失败处理：重试 1 次，第二次仍失败则该 segment 失败。
 * 禁止：自动换素材、自动缩短 segment、自动跳过 segment、静默输出残缺视频。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { OutputProfile, VideoSegment } from './types';
import type { ResolvedAsset } from './asset-resolver';
import type { AssetProbeResult, ColorClass } from './ingest';
import type { RenderLogger } from './logger';

// ============================================================================
// 类型定义
// ============================================================================

export type ColorPipeline = 'none_sdr' | 'hlg_to_sdr' | 'pq_to_sdr' | 'unknown_passthrough';

export interface NormalizedSegment {
  segmentIndex: number;
  assetId: string;
  outputPath: string;
  requestedSourceStart: number;
  requestedDuration: number;
  actualSourceStart: number;
  actualDuration: number;
  sourceColorClass: ColorClass;
  appliedColorPipeline: ColorPipeline;
  width: number;
  height: number;
  fps: number;
  pixelFormat: string;
  codec: string;
  /** 源素材的 display matrix 旋转角度（度），null 表示无 rotation metadata */
  sourceRotation: number | null;
  /** FFmpeg autorotate 是否已禁用。正式方案始终禁用（-noautorotate），由 Renderer 显式旋转 */
  ffmpegAutorotate: boolean;
  /** Renderer 实际应用的手动旋转角度（度），0 表示未应用 */
  manualRotationApplied: number;
  ffmpegExitCode: number;
  elapsedMs: number;
  warnings: string[];
}

export interface PreprocessOptions {
  ffmpegPath: string;
  outputProfile: OutputProfile;
  segmentsDir: string;
  logger: RenderLogger;
  maxRetries: number; // 默认 1
}

// ============================================================================
// 主入口：preprocessSegment
// ============================================================================

/**
 * 预处理单个视频片段，输出标准化的 FFV1 segment。
 */
export function preprocessSegment(
  segmentIndex: number,
  videoSegment: VideoSegment,
  resolvedAsset: ResolvedAsset,
  probeResult: AssetProbeResult,
  options: PreprocessOptions
): NormalizedSegment {
  const startTime = Date.now();
  const warnings: string[] = [];
  const { outputProfile, segmentsDir, logger, ffmpegPath } = options;

  // 1. 启动 segment 日志
  logger.startSegment(
    segmentIndex,
    videoSegment.assetRef.assetId,
    videoSegment.sourceStart,
    videoSegment.duration
  );
  logger.updateSegment(segmentIndex, {
    resolvedPath: resolvedAsset.resolvedPath,
    probeSource: probeResult.probeSource,
    sourceColorClass: probeResult.colorClass,
    sourceWidth: probeResult.video?.width || null,
    sourceHeight: probeResult.video?.height || null,
    sourceFps: probeResult.video?.avgFrameRate || probeResult.video?.rFrameRate || null,
    sourcePixFmt: probeResult.video?.pixFmt || null
  });

  // 2. 检查素材是否存在
  if (!resolvedAsset.resolvedPath || !resolvedAsset.exists) {
    const msg = `素材文件不存在：assetId=${resolvedAsset.assetId}, resolvedPath=${resolvedAsset.resolvedPath}`;
    logger.addSegmentError(segmentIndex, msg);
    logger.finishSegment(segmentIndex, 'failed', Date.now() - startTime);
    throw new Error(msg);
  }

  // 3. 检查 sourceStart + duration 是否超出素材时长
  if (probeResult.duration != null) {
    const sourceEnd = videoSegment.sourceStart + videoSegment.duration;
    if (sourceEnd > probeResult.duration + 0.05) {
      const msg = `segment 超出素材时长：requestedEnd=${sourceEnd.toFixed(3)}s, sourceDuration=${probeResult.duration.toFixed(3)}s`;
      logger.addSegmentWarning(segmentIndex, msg);
      warnings.push(msg);
    }
  }

  // 4. 确定色彩处理管线
  const colorPipeline = determineColorPipeline(
    probeResult.colorClass,
    warnings,
    segmentIndex,
    logger
  );

  // 5. 构建输出路径
  const outputPath = path.join(
    segmentsDir,
    `segment-${String(segmentIndex + 1).padStart(2, '0')}.mkv`
  );
  fs.mkdirSync(segmentsDir, { recursive: true });

  // 6. 构建 FFmpeg 命令
  const { args, filterChain } = buildFfmpegCommand(
    resolvedAsset.resolvedPath,
    videoSegment.sourceStart,
    videoSegment.duration,
    outputProfile,
    probeResult,
    colorPipeline,
    outputPath
  );

  logger.updateSegment(segmentIndex, {
    colorPipeline,
    outputPath,
    outputCodec: 'ffv1',
    outputPixFmt: 'yuv420p10le',
    ffmpegCommand: `${ffmpegPath} ${args.join(' ')}`
  });
  logger.log('debug', `[segment ${segmentIndex}] filter chain: ${filterChain}`);

  // 7. 执行 FFmpeg（带重试）
  let lastExitCode = -1;
  let lastError = '';
  const maxRetries = options.maxRetries ?? 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      logger.log('info', `[segment ${segmentIndex}] 重试第 ${attempt} 次...`);
    }

    const result = spawnSync(ffmpegPath, args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      shell: ffmpegPath.toLowerCase().endsWith('.cmd')
    });

    lastExitCode = result.status ?? -1;

    if (lastExitCode === 0 && fs.existsSync(outputPath)) {
      break;
    }

    lastError = result.stderr || result.stdout || 'unknown error';
    if (attempt < maxRetries) {
      // 清理可能的残缺输出文件
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }
  }

  const elapsedMs = Date.now() - startTime;

  // 8. 检查输出
  if (lastExitCode !== 0 || !fs.existsSync(outputPath)) {
    const msg = `FFmpeg 执行失败（exit code=${lastExitCode}）：${lastError.slice(0, 500)}`;
    logger.addSegmentError(segmentIndex, msg);
    logger.finishSegment(segmentIndex, 'failed', elapsedMs);
    throw new Error(msg);
  }

  // 9. 记录实际参数（V0.1 假设 requested = actual，后续可用 ffprobe 验证输出）
  const sourceRotation = probeResult.video?.rotation ?? null;
  // 使用 FFmpeg 默认 autorotate，Renderer 不手动旋转
  const manualRotationApplied = 0;
  const normalized: NormalizedSegment = {
    segmentIndex,
    assetId: videoSegment.assetRef.assetId,
    outputPath,
    requestedSourceStart: videoSegment.sourceStart,
    requestedDuration: videoSegment.duration,
    actualSourceStart: videoSegment.sourceStart, // V0.1 假设准确，后续验证
    actualDuration: videoSegment.duration, // V0.1 假设准确，后续验证
    sourceColorClass: probeResult.colorClass,
    appliedColorPipeline: colorPipeline,
    width: outputProfile.width,
    height: outputProfile.height,
    fps: outputProfile.targetFps,
    pixelFormat: 'yuv420p10le',
    codec: 'ffv1',
    sourceRotation,
    ffmpegAutorotate: true, // 正式方案使用 FFmpeg 默认 autorotate
    manualRotationApplied,
    ffmpegExitCode: lastExitCode,
    elapsedMs,
    warnings
  };

  logger.updateSegment(segmentIndex, {
    actualSourceStart: normalized.actualSourceStart,
    actualDuration: normalized.actualDuration,
    ffmpegExitCode: lastExitCode
  });
  logger.log(
    'info',
    `[segment ${segmentIndex}] rotation: sourceRotation=${sourceRotation}°, ffmpegAutorotate=true, manualRotationApplied=0°`
  );
  logger.finishSegment(segmentIndex, 'success', elapsedMs);

  return normalized;
}

// ============================================================================
// 色彩管线决策
// ============================================================================

function determineColorPipeline(
  colorClass: ColorClass,
  warnings: string[],
  segmentIndex: number,
  logger: RenderLogger
): ColorPipeline {
  switch (colorClass) {
    case 'SDR':
      return 'none_sdr';
    case 'HLG':
      return 'hlg_to_sdr';
    case 'PQ_HDR10':
      return 'pq_to_sdr';
    case 'UNKNOWN':
    default: {
      const msg = '色彩分类为 UNKNOWN，不执行 tone mapping，直接透传。建议检查素材元数据。';
      warnings.push(msg);
      logger.addSegmentWarning(segmentIndex, msg);
      return 'unknown_passthrough';
    }
  }
}

// ============================================================================
// FFmpeg 命令构建
// ============================================================================

interface BuiltCommand {
  args: string[];
  filterChain: string;
}

function buildFfmpegCommand(
  inputPath: string,
  sourceStart: number,
  duration: number,
  outputProfile: OutputProfile,
  probeResult: AssetProbeResult,
  colorPipeline: ColorPipeline,
  outputPath: string
): BuiltCommand {
  const filters: string[] = [];

  // 旋转：使用 FFmpeg 默认 autorotate，不在 filter chain 中手动 transpose。
  // 原因：手动 transpose 后输出文件仍保留原始 displaymatrix side_data，
  // 播放器播放时会再次应用 rotation，导致二次旋转。
  // FFmpeg 默认 autorotate 会自动旋转画面并清除输出的 rotation metadata。
  // sourceRotation 仍记录在 NormalizedSegment 中用于日志和调试。

  // 1. scale + crop（cover 填满，center crop，禁止 stretch）
  const { width, height } = outputProfile;
  filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`);
  filters.push(`crop=${width}:${height}`);

  // 3. HDR → SDR 色彩处理（libplacebo 方案，2026-08-30 人工验收通过）
  // 旧方案 zscale→tonemap=hable:desat=0.5:peak=100→zscale bt709 已废弃：
  // peak 的语义是 signal peak override（非"目标100 nit"），在真实 HLG 素材上
  // 造成发灰、发白、对比度下降。经 A-F 对照实验人工确认 F-libplacebo-hable 最佳。
  if (colorPipeline === 'hlg_to_sdr' || colorPipeline === 'pq_to_sdr') {
    // libplacebo HDR→SDR：hable tonemapping + 动态峰值检测（peak_detect=1）
    // 直接输出 BT.709 SDR + yuv420p10le，参数与实验 F-libplacebo-hable 完全一致
    filters.push(
      `libplacebo=w=${width}:h=${height}:format=yuv420p10le:colorspace=bt709:color_primaries=bt709:color_trc=bt709:tonemapping=hable:peak_detect=1`
    );
  }

  // 4. 统一帧率
  filters.push(`fps=${outputProfile.targetFps}`);

  // 5. 统一像素格式
  filters.push('format=yuv420p10le');

  const filterChain = filters.join(',');

  // 构建完整参数
  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'info',
    // 裁剪：-ss 在 -i 之前做 fast seek
    '-ss',
    sourceStart.toFixed(3),
    // 使用 FFmpeg 默认 autorotate。
    // 正式方案：FFmpeg 自动应用 display matrix rotation，
    // 输出文件不保留 rotation metadata，避免播放时二次旋转。
    // 不使用 -noautorotate + 手动 transpose，因为手动 transpose 后
    // 输出文件仍会保留原始 displaymatrix side_data，导致播放器再次旋转。
    '-i',
    inputPath,
    // 持续时间
    '-t',
    duration.toFixed(3),
    // 滤镜
    '-vf',
    filterChain,
    // 视频编码：FFV1 level 3
    '-c:v',
    'ffv1',
    '-level',
    '3',
    '-g',
    '1', // 关键帧间隔 1，方便后续 concat 和精确裁剪
    // 不处理音频（Phase 2A 只处理视频）
    '-an',
    // 输出格式
    '-f',
    'matroska',
    '-y',
    outputPath
  ];

  return { args, filterChain };
}
