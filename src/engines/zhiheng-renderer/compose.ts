/**
 * Compose —— 最终合成层。
 *
 * 职责：
 * 1. concat normalized FFV1 segments（已统一 codec/resolution/fps/pix_fmt/color）
 * 2. ASS 字幕烧录
 * 3. voice + BGM + SFX 多轨混音
 * 4. 最终 H.264/AAC 编码
 * 5. 显式 BT.709 SDR metadata
 * 6. 输出 final.mp4
 *
 * Phase 2D：增加 BGM 循环 + SFX 时间点多轨混音
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { NormalizedSegment } from './preprocess';
import type { OutputProfile } from './types';
import type { RenderLogger } from './logger';

// ============================================================================
// 类型定义
// ============================================================================

export interface OverlayInput {
  imagePath: string;
  x: number;
  y: number;
  start: number;
  end: number;
  layer: number;
  id: string;
  opacity?: number;
}

export interface BgmTrackInput {
  path: string;
  start: number;
  duration: number;
  volume: number;
  loop: boolean;
}

export interface SfxTrackInput {
  path: string;
  start: number;
  duration: number;
  volume: number;
}

export interface ComposeOptions {
  ffmpegPath: string;
  outputProfile: OutputProfile;
  workDir: string;
  outputPath: string;
  assPath?: string;
  voicePath?: string;
  voiceVolume?: number;
  overlays?: OverlayInput[];
  bgmTracks?: BgmTrackInput[];
  sfxTracks?: SfxTrackInput[];
  videoDuration: number;
  logger: RenderLogger;
}

export interface ComposeResult {
  success: boolean;
  outputPath: string;
  expectedDuration: number;
  actualVideoDuration: number;
  actualAudioDuration: number;
  finalDuration: number;
  durationDiff: number;
  ffmpegExitCode: number;
  elapsedMs: number;
  warnings: string[];
  errors: string[];
}

// ============================================================================
// Compose 主函数
// ============================================================================

export function composeFinal(
  normalizedSegments: NormalizedSegment[],
  options: ComposeOptions
): ComposeResult {
  const startTime = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [];
  const {
    ffmpegPath,
    outputProfile,
    workDir,
    outputPath,
    assPath,
    voicePath,
    voiceVolume = 1.0,
    overlays = [],
    bgmTracks = [],
    sfxTracks = [],
    videoDuration,
    logger
  } = options;

  logger.log(
    'info',
    `开始最终合成：${normalizedSegments.length} 个 segment，${overlays.length} 个 overlay，BGM=${bgmTracks.length}，SFX=${sfxTracks.length}，目标时长 ${videoDuration.toFixed(3)}s`
  );

  // 1. 构建 concat 文件列表
  const concatListPath = path.join(workDir, 'concat-list.txt');
  const concatLines: string[] = [];
  for (const seg of normalizedSegments) {
    const safePath = seg.outputPath.replace(/\\/g, '/');
    concatLines.push(`file '${safePath}'`);
  }
  fs.writeFileSync(concatListPath, concatLines.join('\n'), 'utf8');
  logger.log('info', `concat list 已生成：${concatListPath}`);

  // 2. 按 layer 排序 overlays
  const sortedOverlays = [...overlays].sort((a, b) => a.layer - b.layer);

  // 3. 构建视频 filter_complex
  const filterComplexParts: string[] = [];
  let currentLabel = 'base';

  filterComplexParts.push(`[0:v]format=yuv420p10le[${currentLabel}]`);

  sortedOverlays.forEach((ov, idx) => {
    const inputIdx = idx + 1;
    const nextLabel = idx === sortedOverlays.length - 1 ? 'preass' : `v${idx + 1}`;
    const enableExpr = `between(t,${ov.start.toFixed(3)},${ov.end.toFixed(3)})`;
    let overlayFilter = `[${currentLabel}][${inputIdx}:v]overlay=x=${ov.x}:y=${ov.y}:enable='${enableExpr}':format=auto[${nextLabel}]`;

    if (ov.opacity !== undefined && ov.opacity < 1.0) {
      const alphaLabel = `alpha${idx}`;
      filterComplexParts.push(`[${inputIdx}:v]colorchannelmixer=aa=${ov.opacity}[${alphaLabel}]`);
      overlayFilter = `[${currentLabel}][${alphaLabel}]overlay=x=${ov.x}:y=${ov.y}:enable='${enableExpr}':format=auto[${nextLabel}]`;
    }

    filterComplexParts.push(overlayFilter);
    logger.log(
      'info',
      `overlay ${ov.id}: x=${ov.x}, y=${ov.y}, t=${ov.start.toFixed(2)}-${ov.end.toFixed(2)}s, layer=${ov.layer}`
    );
    currentLabel = nextLabel;
  });

  // 4. ASS 字幕烧录
  const postAssParts: string[] = [];
  if (assPath && fs.existsSync(assPath)) {
    const assSafePath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    postAssParts.push(`[${currentLabel}]ass='${assSafePath}',format=yuv420p[outv]`);
    logger.log('info', `ASS 字幕烧录：${assPath}`);
  } else {
    postAssParts.push(`[${currentLabel}]format=yuv420p[outv]`);
    if (assPath) {
      warnings.push(`ASS 文件不存在，跳过字幕烧录：${assPath}`);
    }
  }
  filterComplexParts.push(...postAssParts);

  // 5. 构建多轨音频 filter_complex（voice + BGM + SFX）
  const audioFilterParts: string[] = [];
  const audioInputLabels: string[] = [];
  let audioInputIdx = 1 + sortedOverlays.length;

  // 5.1 voice 音轨
  const hasVoice = !!(voicePath && fs.existsSync(voicePath));
  if (hasVoice) {
    const voiceLabel = 'voice_in';
    if (Math.abs(voiceVolume - 1.0) > 0.01) {
      audioFilterParts.push(`[${audioInputIdx}:a]volume=${voiceVolume}[${voiceLabel}]`);
    } else {
      audioFilterParts.push(`[${audioInputIdx}:a]anull[${voiceLabel}]`);
    }
    audioInputLabels.push(voiceLabel);
    logger.log('info', `voice 音轨：input=${audioInputIdx}, volume=${voiceVolume}`);
    audioInputIdx++;
  } else if (voicePath) {
    warnings.push(`voice 文件不存在，跳过：${voicePath}`);
  }

  // 5.2 BGM 音轨
  for (let i = 0; i < bgmTracks.length; i++) {
    const bgm = bgmTracks[i];
    if (!fs.existsSync(bgm.path)) {
      warnings.push(`BGM 文件不存在，跳过：${bgm.path}`);
      continue;
    }
    const bgmLabel = `bgm${i}`;
    const bgmDuration = Math.min(bgm.duration, videoDuration - bgm.start);
    const fadeOutStart = Math.max(0, bgmDuration - 1.0);
    let bgmFilter = `[${audioInputIdx}:a]volume=${bgm.volume},atrim=0:${bgmDuration.toFixed(3)},asetpts=PTS-STARTPTS`;
    bgmFilter += `,afade=t=in:st=0:d=0.5`;
    if (fadeOutStart > 0) {
      bgmFilter += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1.0`;
    }
    bgmFilter += `[${bgmLabel}]`;
    audioFilterParts.push(bgmFilter);
    audioInputLabels.push(bgmLabel);
    logger.log(
      'info',
      `BGM 音轨：input=${audioInputIdx}, volume=${bgm.volume}, loop=${bgm.loop}, duration=${bgmDuration.toFixed(2)}s`
    );
    audioInputIdx++;
  }

  // 5.3 SFX 音效音轨
  for (let i = 0; i < sfxTracks.length; i++) {
    const sfx = sfxTracks[i];
    if (!fs.existsSync(sfx.path)) {
      warnings.push(`SFX 文件不存在，跳过：${sfx.path}`);
      continue;
    }
    const sfxLabel = `sfx${i}`;
    const delayMs = Math.round(sfx.start * 1000);
    audioFilterParts.push(
      `[${audioInputIdx}:a]adelay=${delayMs}|${delayMs},volume=${sfx.volume}[${sfxLabel}]`
    );
    audioInputLabels.push(sfxLabel);
    logger.log(
      'info',
      `SFX 音轨：input=${audioInputIdx}, start=${sfx.start}s (delay=${delayMs}ms), volume=${sfx.volume}`
    );
    audioInputIdx++;
  }

  // 5.4 混合所有音轨
  const hasAudio = audioInputLabels.length > 0;
  if (hasAudio) {
    const mixInputs = audioInputLabels.map((l) => `[${l}]`).join('');
    audioFilterParts.push(
      `${mixInputs}amix=inputs=${audioInputLabels.length}:duration=first:dropout_transition=0:normalize=0[outa]`
    );
    logger.log('info', `音频混合：${audioInputLabels.length} 轨 -> [outa]`);
  }

  // 把音频 filter 加入 filter_complex
  if (audioFilterParts.length > 0) {
    filterComplexParts.push(...audioFilterParts);
  }

  // 构建最终 filter_complex 字符串（视频+音频）
  const filterComplexStr = filterComplexParts.join(';');
  logger.log(
    'info',
    `filter_complex 已构建（${filterComplexParts.length} 段，含音频 ${audioFilterParts.length} 段）`
  );

  // 6. 构建 ffmpeg 命令
  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'info',
    // 输入 0：concat demuxer（视频）
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListPath
  ];

  // overlay 图片输入
  for (const ov of sortedOverlays) {
    args.push('-loop', '1', '-i', ov.imagePath);
  }

  // voice 输入
  if (hasVoice) {
    args.push('-i', voicePath);
  }

  // BGM 输入
  for (let i = 0; i < bgmTracks.length; i++) {
    const bgm = bgmTracks[i];
    if (fs.existsSync(bgm.path)) {
      if (bgm.loop) {
        args.push('-stream_loop', '-1', '-i', bgm.path);
      } else {
        args.push('-i', bgm.path);
      }
    }
  }

  // SFX 输入
  for (let i = 0; i < sfxTracks.length; i++) {
    const sfx = sfxTracks[i];
    if (fs.existsSync(sfx.path)) {
      args.push('-i', sfx.path);
    }
  }

  // filter_complex
  args.push('-filter_complex', filterComplexStr);
  // 视频输出映射
  args.push('-map', '[outv]');

  // 音频输出映射
  if (hasAudio) {
    args.push('-map', '[outa]');
  }

  // 视频编码：H.264
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
    '-g',
    String(Math.round(outputProfile.targetFps * 2)),
    '-r',
    String(outputProfile.targetFps)
  );

  // 音频编码：AAC
  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  } else {
    args.push('-an');
  }

  // 时长控制
  args.push('-t', videoDuration.toFixed(3));

  // 输出格式
  args.push('-f', 'mp4', '-movflags', '+faststart', '-y', outputPath);

  // 7. 执行 ffmpeg
  logger.log('info', `执行最终合成 ffmpeg（${args.length} 个参数）...`);
  const result = spawnSync(ffmpegPath, args, { encoding: 'utf8' });
  const exitCode = result.status ?? -1;

  if (exitCode !== 0) {
    const errMsg = result.stderr?.slice(-800) || '未知错误';
    errors.push(`ffmpeg 最终合成失败（exit=${exitCode}）：${errMsg}`);
    logger.log('error', `最终合成失败：exit=${exitCode}`);
    return {
      success: false,
      outputPath,
      expectedDuration: videoDuration,
      actualVideoDuration: 0,
      actualAudioDuration: 0,
      finalDuration: 0,
      durationDiff: 0,
      ffmpegExitCode: exitCode,
      elapsedMs: Date.now() - startTime,
      warnings,
      errors
    };
  }

  logger.log('info', `最终合成完成：${outputPath}`);

  // 8. 校验输出文件
  if (!fs.existsSync(outputPath)) {
    errors.push('输出文件不存在');
    return {
      success: false,
      outputPath,
      expectedDuration: videoDuration,
      actualVideoDuration: 0,
      actualAudioDuration: 0,
      finalDuration: 0,
      durationDiff: 0,
      ffmpegExitCode: exitCode,
      elapsedMs: Date.now() - startTime,
      warnings,
      errors
    };
  }

  const fileSize = fs.statSync(outputPath).size;
  logger.log('info', `输出文件大小：${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  // 9. 用 ffmpeg -i 探测输出时长
  const probeResult = spawnSync(ffmpegPath, ['-hide_banner', '-i', outputPath], {
    encoding: 'utf8'
  });
  const probeOutput = probeResult.stderr || '';

  const durationMatch = probeOutput.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
  let finalDuration = 0;
  if (durationMatch) {
    finalDuration =
      parseInt(durationMatch[1]) * 3600 +
      parseInt(durationMatch[2]) * 60 +
      parseFloat(durationMatch[3]);
  }

  const actualVideoDuration = finalDuration;
  const actualAudioDuration = hasAudio ? finalDuration : 0;

  const durationDiff = Math.abs(finalDuration - videoDuration);
  if (durationDiff > 0.1) {
    warnings.push(
      `最终时长 ${finalDuration.toFixed(3)}s 与期望 ${videoDuration.toFixed(3)}s 差异 ${durationDiff.toFixed(3)}s`
    );
  }

  logger.log(
    'info',
    `时长校验：expected=${videoDuration.toFixed(3)}s, final=${finalDuration.toFixed(3)}s, diff=${durationDiff.toFixed(3)}s`
  );

  return {
    success: true,
    outputPath,
    expectedDuration: videoDuration,
    actualVideoDuration,
    actualAudioDuration,
    finalDuration,
    durationDiff,
    ffmpegExitCode: exitCode,
    elapsedMs: Date.now() - startTime,
    warnings,
    errors
  };
}
