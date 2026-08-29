/**
 * Asset Ingest & Probe —— 素材摄取与探测。
 *
 * 正式使用 ffprobe 读取媒体元数据。
 * 当 ffprobe 不可用时，使用 ffmpeg -i 作为 fallback（不是手写 parser）。
 *
 * 读取的元数据：
 * - duration, width, height
 * - avg_frame_rate, r_frame_rate
 * - pix_fmt, color_space, color_transfer, color_primaries, color_range
 * - codec_name, bit_depth
 * - audio stream existence
 *
 * 色彩分类：
 * - color_transfer = arib-std-b67 → HLG
 * - color_transfer = smpte2084 → PQ_HDR10
 * - bt709 / 未发现HDR信号 → SDR
 * - metadata 缺失 → UNKNOWN + warning
 *
 * Probe 结果可缓存到工作目录。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// 类型定义
// ============================================================================

export type ColorClass = 'SDR' | 'HLG' | 'PQ_HDR10' | 'UNKNOWN';

export type ProbeSource = 'ffprobe' | 'ffmpeg_i_fallback';

export interface VideoStreamInfo {
  codecName: string;
  width: number;
  height: number;
  pixFmt: string;
  colorRange: string | null;
  colorSpace: string | null;
  colorTransfer: string | null;
  colorPrimaries: string | null;
  avgFrameRate: number | null;
  rFrameRate: number | null;
  bitDepth: number | null;
  rotation: number | null; // displaymatrix 旋转角度
}

export interface AudioStreamInfo {
  exists: boolean;
  codecName: string | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface AssetProbeResult {
  assetId: string;
  filePath: string;
  probeSource: ProbeSource;
  duration: number | null;
  video: VideoStreamInfo | null;
  audio: AudioStreamInfo;
  colorClass: ColorClass;
  warnings: string[];
  probedAt: string;
}

// ============================================================================
// ffprobe JSON 解析（优先方案）
// ============================================================================

interface FfprobeJson {
  streams?: Array<Record<string, unknown>>;
  format?: Record<string, unknown>;
}

function parseFfprobeJson(json: FfprobeJson, assetId: string, filePath: string): AssetProbeResult {
  const warnings: string[] = [];
  const videoStream = json.streams?.find((s) => s.codec_type === 'video');
  const audioStream = json.streams?.find((s) => s.codec_type === 'audio');

  // Duration：优先 format.duration，其次 video stream duration
  let duration: number | null = null;
  if (json.format?.duration) {
    duration = parseFloat(json.format.duration as string);
  }
  if (duration == null && videoStream?.duration) {
    duration = parseFloat(videoStream.duration as string);
  }

  // Video stream
  let video: VideoStreamInfo | null = null;
  if (videoStream) {
    const avgFrameRate = parseFrameRate(videoStream.avg_frame_rate as string | undefined);
    const rFrameRate = parseFrameRate(videoStream.r_frame_rate as string | undefined);

    // 旋转角度：side_data_list 中的 displaymatrix
    let rotation: number | null = null;
    const sideDataList = videoStream.side_data_list as Array<Record<string, unknown>> | undefined;
    if (sideDataList) {
      for (const sideData of sideDataList) {
        if (sideData.side_data_type === 'Display Matrix' && sideData.rotation != null) {
          rotation = parseFloat(sideData.rotation as string);
          break;
        }
      }
    }

    video = {
      codecName: (videoStream.codec_name as string) || 'unknown',
      width: parseInt(videoStream.width as string, 10) || 0,
      height: parseInt(videoStream.height as string, 10) || 0,
      pixFmt: (videoStream.pix_fmt as string) || 'unknown',
      colorRange: (videoStream.color_range as string) || null,
      colorSpace: (videoStream.color_space as string) || null,
      colorTransfer: (videoStream.color_transfer as string) || null,
      colorPrimaries: (videoStream.color_primaries as string) || null,
      avgFrameRate,
      rFrameRate,
      bitDepth: videoStream.bits_per_raw_sample
        ? parseInt(videoStream.bits_per_raw_sample as string, 10)
        : null,
      rotation
    };

    if (!video.colorTransfer) {
      warnings.push('video stream 缺少 color_transfer 元数据');
    }
    if (!video.colorSpace) {
      warnings.push('video stream 缺少 color_space 元数据');
    }
  } else {
    warnings.push('未找到 video stream');
  }

  // Audio stream
  const audio: AudioStreamInfo = {
    exists: !!audioStream,
    codecName: audioStream ? (audioStream.codec_name as string) || null : null,
    sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate as string, 10) : null,
    channels: audioStream?.channels ? parseInt(audioStream.channels as string, 10) : null
  };

  // 色彩分类
  const colorClass = classifyColor(video, warnings);

  return {
    assetId,
    filePath,
    probeSource: 'ffprobe',
    duration,
    video,
    audio,
    colorClass,
    warnings,
    probedAt: new Date().toISOString()
  };
}

// ============================================================================
// ffmpeg -i 文本解析（fallback 方案）
// ============================================================================

function parseFfmpegIOutput(stderr: string, assetId: string, filePath: string): AssetProbeResult {
  const warnings: string[] = [];

  // Duration: 00:00:13.64
  let duration: number | null = null;
  const durationMatch = stderr.match(/Duration:\s+(\d+):(\d+):([\d.]+)/);
  if (durationMatch) {
    duration =
      parseInt(durationMatch[1], 10) * 3600 +
      parseInt(durationMatch[2], 10) * 60 +
      parseFloat(durationMatch[3]);
  }

  // Video stream: Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67, progressive), 1920x1080, 25746 kb/s, 119.94 fps, 120 tbr, 90k tbn (default)
  let video: VideoStreamInfo | null = null;
  const videoLineMatch = stderr.match(
    /Stream #\d+:\d+[^\n]*Video:\s+([^,]+),\s+([a-z0-9]+(?:\([^)]+\))?),\s+(\d+)x(\d+),\s+[^,]+,\s+([\d.]+)\s+fps/
  );
  if (videoLineMatch) {
    const codecFull = videoLineMatch[1].trim();
    const codecName = codecFull.split(' ')[0]; // "hevc" from "hevc (Main 10)"
    const pixFmtFull = videoLineMatch[2].trim();
    const width = parseInt(videoLineMatch[3], 10);
    const height = parseInt(videoLineMatch[4], 10);
    const fps = parseFloat(videoLineMatch[5]);

    // 解析 pix_fmt 和色彩信息：yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67, progressive)
    const pixFmtMatch = pixFmtFull.match(/^([a-z0-9]+)(?:\(([^)]+)\))?/);
    const pixFmt = pixFmtMatch?.[1] || pixFmtFull;
    let colorRange: string | null = null;
    let colorSpace: string | null = null;
    let colorPrimaries: string | null = null;
    let colorTransfer: string | null = null;

    if (pixFmtMatch?.[2]) {
      const parts = pixFmtMatch[2].split(',').map((p) => p.trim());
      // 第一个部分通常是 color_range (tv/pc)
      if (parts[0] === 'tv' || parts[0] === 'pc') {
        colorRange = parts[0];
      }
      // 色彩三元组：bt2020nc/bt2020/arib-std-b67
      const colorTriplet = parts.find((p) => p.includes('/'));
      if (colorTriplet) {
        const tripletParts = colorTriplet.split('/');
        colorSpace = tripletParts[0] || null;
        colorPrimaries = tripletParts[1] || null;
        colorTransfer = tripletParts[2] || null;
      }
    }

    // 旋转角度：displaymatrix: rotation of -90.00 degrees
    let rotation: number | null = null;
    const rotationMatch = stderr.match(/displaymatrix:\s+rotation of\s+([-\d.]+)\s+degrees/);
    if (rotationMatch) {
      rotation = parseFloat(rotationMatch[1]);
    }

    // bit_depth：从 pix_fmt 推断
    let bitDepth: number | null = null;
    const bitDepthMatch = pixFmt.match(/p(\d+)(le|be)?$/);
    if (bitDepthMatch) {
      bitDepth = parseInt(bitDepthMatch[1], 10);
    } else if (pixFmt.includes('10')) {
      bitDepth = 10;
    }

    if (!colorTransfer) {
      warnings.push('ffmpeg -i 输出中未解析到 color_transfer（可能是 SDR 或 metadata 缺失）');
    }

    video = {
      codecName,
      width,
      height,
      pixFmt,
      colorRange,
      colorSpace,
      colorTransfer,
      colorPrimaries,
      avgFrameRate: fps,
      rFrameRate: fps,
      bitDepth,
      rotation
    };
  } else {
    warnings.push('ffmpeg -i 输出中未找到 video stream 行');
  }

  // Audio stream
  const audioExists = /Stream #\d+:\d+[^\n]*Audio:/.test(stderr);
  const audio: AudioStreamInfo = {
    exists: audioExists,
    codecName: null,
    sampleRate: null,
    channels: null
  };

  // 色彩分类
  const colorClass = classifyColor(video, warnings);

  return {
    assetId,
    filePath,
    probeSource: 'ffmpeg_i_fallback',
    duration,
    video,
    audio,
    colorClass,
    warnings,
    probedAt: new Date().toISOString()
  };
}

// ============================================================================
// 工具函数
// ============================================================================

function parseFrameRate(rateStr: string | undefined): number | null {
  if (!rateStr || rateStr === '0/0') return null;
  const match = rateStr.match(/^(\d+)\/(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const den = parseInt(match[2], 10);
    if (den === 0) return null;
    return num / den;
  }
  const floatVal = parseFloat(rateStr);
  return isNaN(floatVal) ? null : floatVal;
}

/**
 * 色彩分类。
 *
 * 规则：
 * - color_transfer = arib-std-b67 → HLG
 * - color_transfer = smpte2084 → PQ_HDR10
 * - color_transfer 为 bt709/bt470m/bt470bg/smpte170m/smpte240m/iec61966-2-1 → SDR
 * - color_transfer 缺失 → UNKNOWN
 * - color_space = bt2020nc 但 color_transfer 缺失 → UNKNOWN + warning（可能是 HDR 但 metadata 不完整）
 */
function classifyColor(video: VideoStreamInfo | null, warnings: string[]): ColorClass {
  if (!video) return 'UNKNOWN';

  const transfer = video.colorTransfer;

  if (transfer === 'arib-std-b67') {
    return 'HLG';
  }
  if (transfer === 'smpte2084') {
    return 'PQ_HDR10';
  }

  const sdrTransfers = [
    'bt709',
    'bt470m',
    'bt470bg',
    'smpte170m',
    'smpte240m',
    'iec61966-2-1',
    'gamma22',
    'gamma28'
  ];
  if (transfer && sdrTransfers.includes(transfer)) {
    return 'SDR';
  }

  // color_transfer 缺失
  if (video.colorSpace === 'bt2020nc' || video.colorPrimaries === 'bt2020') {
    warnings.push(
      '检测到 bt2020 色彩空间但 color_transfer 缺失，无法确定是 HLG 还是 PQ，标记为 UNKNOWN。建议检查素材元数据。'
    );
    return 'UNKNOWN';
  }

  if (video.pixFmt.includes('10le') || video.pixFmt.includes('10be')) {
    warnings.push('检测到 10-bit 像素格式但 color_transfer 缺失，标记为 UNKNOWN。');
    return 'UNKNOWN';
  }

  // 默认：无 HDR 信号，视为 SDR
  return 'SDR';
}

// ============================================================================
// 主入口：probeAsset
// ============================================================================

export interface ProbeOptions {
  ffmpegPath: string;
  ffprobePath: string | null;
  cacheDir?: string; // probe 结果缓存目录
}

/**
 * 探测素材元数据。
 *
 * 优先使用 ffprobe（结构化 JSON）。
 * ffprobe 不可用时使用 ffmpeg -i fallback（文本解析）。
 * 结果可缓存到 cacheDir。
 */
export function probeAsset(
  assetId: string,
  filePath: string,
  options: ProbeOptions
): AssetProbeResult {
  // 1. 检查缓存
  if (options.cacheDir) {
    const cacheFile = path.join(options.cacheDir, `${assetId}.probe.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as AssetProbeResult;
        return cached;
      } catch {
        // 缓存损坏，重新探测
      }
    }
  }

  let result: AssetProbeResult;

  // 2. 优先 ffprobe
  if (options.ffprobePath) {
    const ffprobeResult = spawnSync(
      options.ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        shell: options.ffprobePath.toLowerCase().endsWith('.cmd')
      }
    );

    if (ffprobeResult.status === 0 && ffprobeResult.stdout) {
      try {
        const json = JSON.parse(ffprobeResult.stdout) as FfprobeJson;
        result = parseFfprobeJson(json, assetId, filePath);
      } catch {
        // JSON 解析失败，fallback 到 ffmpeg -i
        result = probeWithFfmpegI(assetId, filePath, options.ffmpegPath);
      }
    } else {
      result = probeWithFfmpegI(assetId, filePath, options.ffmpegPath);
    }
  } else {
    // 3. ffprobe 不可用，使用 ffmpeg -i fallback
    result = probeWithFfmpegI(assetId, filePath, options.ffmpegPath);
  }

  // 4. 写入缓存
  if (options.cacheDir) {
    fs.mkdirSync(options.cacheDir, { recursive: true });
    const cacheFile = path.join(options.cacheDir, `${assetId}.probe.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');
  }

  return result;
}

function probeWithFfmpegI(assetId: string, filePath: string, ffmpegPath: string): AssetProbeResult {
  const result = spawnSync(ffmpegPath, ['-i', filePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    shell: ffmpegPath.toLowerCase().endsWith('.cmd')
  });
  // ffmpeg -i 没有输出文件时返回 status=1，但 stderr 包含媒体信息
  const output = (result.stderr || '') + (result.stdout || '');
  return parseFfmpegIOutput(output, assetId, filePath);
}
