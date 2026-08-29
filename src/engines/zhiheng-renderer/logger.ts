/**
 * Render Logger —— 渲染日志记录器。
 *
 * 生成结构化的渲染日志，包含：
 * - 每个 segment 的 assetId、resolvedPath、ffprobe metadata、color class
 * - sourceStart、duration、target resolution、target fps
 * - color pipeline、output segment 路径
 * - FFmpeg exit code、elapsed time
 * - warnings、errors
 * - 实际执行的 FFmpeg 命令
 *
 * 输出：
 * - render.log：人类可读的文本日志
 * - render-report.json：结构化 JSON 报告
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// 类型定义
// ============================================================================

export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

export interface SegmentLogEntry {
  segmentIndex: number;
  assetId: string;
  resolvedPath: string | null;
  probeSource: string | null;
  sourceColorClass: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceFps: number | null;
  sourcePixFmt: string | null;
  requestedSourceStart: number;
  requestedDuration: number;
  actualSourceStart: number | null;
  actualDuration: number | null;
  targetWidth: number;
  targetHeight: number;
  targetFps: number;
  colorPipeline: string | null;
  outputPath: string | null;
  outputCodec: string | null;
  outputPixFmt: string | null;
  ffmpegExitCode: number | null;
  elapsedMs: number | null;
  ffmpegCommand: string | null;
  warnings: string[];
  errors: string[];
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
}

export interface RenderReport {
  renderId: string;
  taskId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'pending' | 'running' | 'success' | 'failed' | 'partial';
  environment: {
    ffmpegPath: string | null;
    ffprobePath: string | null;
    ffmpegVersion: string | null;
  };
  outputProfile: {
    width: number;
    height: number;
    targetFps: number;
    videoCodec: string;
    pixelFormat: string;
  };
  segments: SegmentLogEntry[];
  totalElapsedMs: number | null;
  warnings: string[];
  errors: string[];
}

// ============================================================================
// Render Logger
// ============================================================================

export class RenderLogger {
  private report: RenderReport;
  private logLines: string[] = [];
  private workDir: string;
  private startTime: number;

  constructor(renderId: string, taskId: string, workDir: string) {
    this.workDir = workDir;
    this.startTime = Date.now();
    this.report = {
      renderId,
      taskId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'running',
      environment: {
        ffmpegPath: null,
        ffprobePath: null,
        ffmpegVersion: null
      },
      outputProfile: {
        width: 0,
        height: 0,
        targetFps: 0,
        videoCodec: '',
        pixelFormat: ''
      },
      segments: [],
      totalElapsedMs: null,
      warnings: [],
      errors: []
    };
  }

  // ==========================================================================
  // 环境和配置
  // ==========================================================================

  setEnvironment(
    ffmpegPath: string | null,
    ffprobePath: string | null,
    ffmpegVersion: string | null
  ): void {
    this.report.environment.ffmpegPath = ffmpegPath;
    this.report.environment.ffprobePath = ffprobePath;
    this.report.environment.ffmpegVersion = ffmpegVersion;
    this.log(
      'info',
      `环境：ffmpeg=${ffmpegPath || 'NOT FOUND'}, ffprobe=${ffprobePath || 'NOT FOUND'}, version=${ffmpegVersion || 'unknown'}`
    );
  }

  setOutputProfile(
    width: number,
    height: number,
    targetFps: number,
    videoCodec: string,
    pixelFormat: string
  ): void {
    this.report.outputProfile = { width, height, targetFps, videoCodec, pixelFormat };
    this.log(
      'info',
      `输出规格：${width}x${height} @ ${targetFps}fps, codec=${videoCodec}, pix_fmt=${pixelFormat}`
    );
  }

  // ==========================================================================
  // Segment 日志
  // ==========================================================================

  /**
   * 创建一个新的 segment 日志条目，返回 segmentIndex。
   */
  startSegment(
    segmentIndex: number,
    assetId: string,
    requestedSourceStart: number,
    requestedDuration: number
  ): number {
    const entry: SegmentLogEntry = {
      segmentIndex,
      assetId,
      resolvedPath: null,
      probeSource: null,
      sourceColorClass: null,
      sourceWidth: null,
      sourceHeight: null,
      sourceFps: null,
      sourcePixFmt: null,
      requestedSourceStart,
      requestedDuration,
      actualSourceStart: null,
      actualDuration: null,
      targetWidth: this.report.outputProfile.width,
      targetHeight: this.report.outputProfile.height,
      targetFps: this.report.outputProfile.targetFps,
      colorPipeline: null,
      outputPath: null,
      outputCodec: null,
      outputPixFmt: null,
      ffmpegExitCode: null,
      elapsedMs: null,
      ffmpegCommand: null,
      warnings: [],
      errors: [],
      status: 'running'
    };
    this.report.segments[segmentIndex] = entry;
    this.log(
      'info',
      `[segment ${segmentIndex}] 开始：assetId=${assetId}, sourceStart=${requestedSourceStart}s, duration=${requestedDuration}s`
    );
    return segmentIndex;
  }

  updateSegment(segmentIndex: number, patch: Partial<SegmentLogEntry>): void {
    const entry = this.report.segments[segmentIndex];
    if (entry) {
      Object.assign(entry, patch);
    }
  }

  addSegmentWarning(segmentIndex: number, message: string): void {
    const entry = this.report.segments[segmentIndex];
    if (entry) {
      entry.warnings.push(message);
    }
    this.log('warning', `[segment ${segmentIndex}] ${message}`);
  }

  addSegmentError(segmentIndex: number, message: string): void {
    const entry = this.report.segments[segmentIndex];
    if (entry) {
      entry.errors.push(message);
    }
    this.log('error', `[segment ${segmentIndex}] ${message}`);
  }

  finishSegment(
    segmentIndex: number,
    status: 'success' | 'failed' | 'skipped',
    elapsedMs: number
  ): void {
    const entry = this.report.segments[segmentIndex];
    if (entry) {
      entry.status = status;
      entry.elapsedMs = elapsedMs;
    }
    this.log(
      'info',
      `[segment ${segmentIndex}] 完成：status=${status}, elapsed=${(elapsedMs / 1000).toFixed(2)}s`
    );
  }

  // ==========================================================================
  // 全局日志
  // ==========================================================================

  log(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    this.logLines.push(line);
    if (level === 'warning') {
      this.report.warnings.push(message);
    }
    if (level === 'error') {
      this.report.errors.push(message);
    }
  }

  // ==========================================================================
  // 完成和输出
  // ==========================================================================

  finish(status: 'success' | 'failed' | 'partial'): void {
    this.report.status = status;
    this.report.finishedAt = new Date().toISOString();
    this.report.totalElapsedMs = Date.now() - this.startTime;
    this.log(
      'info',
      `渲染完成：status=${status}, totalElapsed=${(this.report.totalElapsedMs / 1000).toFixed(2)}s`
    );
    this.writeFiles();
  }

  private writeFiles(): void {
    fs.mkdirSync(this.workDir, { recursive: true });

    // 文本日志
    const logPath = path.join(this.workDir, 'render.log');
    fs.writeFileSync(logPath, this.logLines.join('\n') + '\n', 'utf8');

    // 结构化报告
    const reportPath = path.join(this.workDir, 'render-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.report, null, 2), 'utf8');
  }

  /**
   * 获取当前报告（用于中途检查）。
   */
  getReport(): RenderReport {
    return { ...this.report };
  }

  /**
   * 获取工作目录。
   */
  getWorkDir(): string {
    return this.workDir;
  }
}
