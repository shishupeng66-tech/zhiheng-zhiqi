/**
 * Zhiheng Renderer —— 知衡自研渲染器。
 *
 * 实现 RendererInterface，串联：
 * Environment Preflight → Asset Resolver → Asset Ingest → Per-Segment Preprocess
 *
 * Phase 2A（当前）：只实现媒体标准化执行层，输出 Normalized FFV1 Segments。
 * Phase 2B（后续）：加入 Final Composition（concat + ASS + 混音 + 编码）。
 *
 * 设计原则：
 * - Renderer 不调用 TTS（Voice Service 是上游独立服务）
 * - Renderer 不做创意决策（不自动换素材、不自动缩短 segment、不自动跳过）
 * - Timeline 只认 assetId，物理路径由 Asset Resolver 解析
 * - 能力声明如实，禁止静默降级
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  RendererInterface,
  RendererCapabilities,
  ValidationResult,
  RenderResult,
  RenderError
} from '../renderer-interface';
import { ValidationErrorCode } from '../renderer-interface';
import type { UnifiedTimelineV1, OutputProfile } from './types';
import { DEFAULT_OUTPUT_PROFILE, calculateVideoTotalDuration } from './types';
import { TimelineValidator } from './validator';
import { runEnvironmentPreflight, type RendererEnvironmentReport } from './environment';
import { AssetResolver, type TaskAssetManifestEntry } from './asset-resolver';
import { probeAsset, type AssetProbeResult } from './ingest';
import { RenderLogger } from './logger';
import { preprocessSegment, type NormalizedSegment } from './preprocess';

// ============================================================================
// 类型定义
// ============================================================================

export interface ZhihengRendererOptions {
  /** library_asset 的 assetId → 真实路径映射表 */
  libraryAssetMap?: Record<string, string>;
  /** 工作目录根路径，默认 tmp/zhiheng-renderer */
  workRoot?: string;
}

export interface PreprocessResult {
  renderId: string;
  workDir: string;
  segmentsDir: string;
  probeDir: string;
  normalizedSegments: NormalizedSegment[];
  environmentReport: RendererEnvironmentReport;
  totalDuration: number;
}

// ============================================================================
// Zhiheng Renderer
// ============================================================================

export class ZhihengRenderer implements RendererInterface {
  private libraryAssetMap: Record<string, string>;
  private workRoot: string;
  private taskAssets: Record<
    string,
    { localPath: string; options?: { originalName?: string; metadata?: Record<string, unknown> } }
  > = {};
  private validator: TimelineValidator;

  constructor(options: ZhihengRendererOptions = {}) {
    this.libraryAssetMap = options.libraryAssetMap || {};
    this.workRoot = options.workRoot || path.join(process.cwd(), 'tmp', 'zhiheng-renderer');
    this.validator = new TimelineValidator();
  }

  // ==========================================================================
  // RendererInterface 实现
  // ==========================================================================

  getName(): string {
    return 'zhiheng';
  }

  getVersion(): string {
    return '0.1.0-phase2a';
  }

  getCapabilities(): RendererCapabilities {
    return {
      sourceTrim: true,
      multiSegmentConcat: false, // Phase 2A 不实现 concat，Phase 2B 实现
      scaleCrop: true,
      hdrToneMap: true,
      assSubtitles: false, // Phase 2B 实现
      keywordHighlight: false, // Phase 2B 实现
      titleTrack: false, // Phase 2B 实现
      overlayTrack: false, // Phase 2C 实现
      bgmTrack: false, // Phase 2C 实现
      sfxTrack: false, // Phase 2C 实现
      voiceMix: false, // Phase 2B 实现
      outputProfile: true,
      transitions: ['hard_cut']
    };
  }

  validate(timeline: unknown): ValidationResult {
    // 1. Schema + semantic 验证
    const result = this.validator.validate(timeline);

    // 2. 能力声明匹配（Timeline 使用的功能必须在 capabilities 范围内）
    const caps = this.getCapabilities();
    const tl = timeline as UnifiedTimelineV1;

    if (tl?.subtitleTrack && tl.subtitleTrack.length > 0 && !caps.assSubtitles) {
      result.errors.push({
        field: 'subtitleTrack',
        message: 'ZhihengRenderer Phase 2A 不支持 ASS 字幕烧录，Timeline 中包含 subtitleTrack。',
        code: ValidationErrorCode.UNSUPPORTED_CAPABILITY
      });
    }

    if (tl?.titleTrack && tl.titleTrack.length > 0 && !caps.titleTrack) {
      result.errors.push({
        field: 'titleTrack',
        message: 'ZhihengRenderer Phase 2A 不支持 titleTrack，Timeline 中包含 titleTrack。',
        code: ValidationErrorCode.UNSUPPORTED_CAPABILITY
      });
    }

    if (tl?.voiceTrack && tl.voiceTrack.length > 0 && !caps.voiceMix) {
      result.errors.push({
        field: 'voiceTrack',
        message: 'ZhihengRenderer Phase 2A 不支持 voiceMix，Timeline 中包含 voiceTrack。',
        code: ValidationErrorCode.UNSUPPORTED_CAPABILITY
      });
    }

    // overlay/bgm/sfx 是预留字段，V0.1 不实现，如果存在则 warning（validator 已处理）

    result.valid = result.errors.length === 0;
    return result;
  }

  async render(timeline: unknown): Promise<RenderResult> {
    const startTime = Date.now();
    const renderId = `render-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const workDir = path.join(this.workRoot, renderId);
    const segmentsDir = path.join(workDir, 'segments');
    const probeDir = path.join(workDir, 'probe');
    const logsDir = path.join(workDir, 'logs');

    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(segmentsDir, { recursive: true });
    fs.mkdirSync(probeDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    const logger = new RenderLogger(
      renderId,
      (timeline as UnifiedTimelineV1)?.taskId || 'unknown',
      logsDir
    );
    const errors: RenderError[] = [];
    const warnings: string[] = [];

    try {
      // 1. Timeline 验证
      logger.log('info', '开始 Timeline 验证...');
      const validation = this.validate(timeline);
      if (!validation.valid) {
        const msg = `Timeline 验证失败：${validation.errors.map((e) => e.message).join('; ')}`;
        logger.log('error', msg);
        errors.push({ stage: 'validate', message: msg });
        logger.finish('failed');
        return {
          success: false,
          durationMs: Date.now() - startTime,
          errors,
          warnings: [...warnings, ...validation.warnings],
          rendererName: this.getName(),
          rendererVersion: this.getVersion(),
          logPath: path.join(logsDir, 'render.log')
        };
      }
      warnings.push(...validation.warnings);
      logger.log('info', 'Timeline 验证通过。');

      const tl = timeline as UnifiedTimelineV1;
      const outputProfile: OutputProfile = { ...DEFAULT_OUTPUT_PROFILE, ...tl.outputProfile };
      logger.setOutputProfile(
        outputProfile.width,
        outputProfile.height,
        outputProfile.targetFps,
        outputProfile.videoCodec,
        outputProfile.pixelFormat
      );

      // 2. Environment Preflight
      logger.log('info', '开始 Environment Preflight...');
      const envReport = runEnvironmentPreflight();
      logger.setEnvironment(envReport.ffmpegPath, envReport.ffprobePath, envReport.ffmpegVersion);

      if (!envReport.ready) {
        const msg = `Environment Preflight 失败：${envReport.errors.join('; ')}`;
        logger.log('error', msg);
        errors.push({ stage: 'environment', message: msg });
        logger.finish('failed');
        return {
          success: false,
          durationMs: Date.now() - startTime,
          errors,
          warnings: [...warnings, ...envReport.warnings],
          rendererName: this.getName(),
          rendererVersion: this.getVersion(),
          logPath: path.join(logsDir, 'render.log')
        };
      }
      warnings.push(...envReport.warnings);
      logger.log('info', `Environment Preflight 通过：ffmpeg=${envReport.ffmpegVersion}`);

      // 保存环境报告
      fs.writeFileSync(
        path.join(workDir, 'environment-report.json'),
        JSON.stringify(envReport, null, 2),
        'utf8'
      );

      // 3. Asset Resolver 初始化
      logger.log('info', '初始化 Asset Resolver...');
      const assetResolver = new AssetResolver(tl.taskId, this.libraryAssetMap);
      // 注册 task assets
      for (const [assetId, taskAsset] of Object.entries(this.taskAssets)) {
        assetResolver.registerTaskAsset(assetId, taskAsset.localPath, taskAsset.options);
      }
      // 保存 Task Asset Manifest
      assetResolver.getTaskManifest().saveToFile(path.join(workDir, 'task-asset-manifest.json'));

      // 4. 逐 segment 处理
      const normalizedSegments: NormalizedSegment[] = [];
      const totalDuration = calculateVideoTotalDuration(tl);
      logger.log(
        'info',
        `开始处理 ${tl.videoTrack.length} 个 segment，总时长 ${totalDuration.toFixed(3)}s...`
      );

      for (let i = 0; i < tl.videoTrack.length; i++) {
        const videoSegment = tl.videoTrack[i];

        // 4a. Resolve asset
        const resolvedAsset = assetResolver.resolve(videoSegment.assetRef);
        if (!resolvedAsset.resolvedPath || !resolvedAsset.exists) {
          const msg = `Asset resolve 失败：assetId=${videoSegment.assetRef.assetId}, type=${videoSegment.assetRef.type}`;
          logger.addSegmentError(i, msg);
          errors.push({ stage: 'asset_resolve', message: msg });
          logger.finishSegment(i, 'failed', 0);
          logger.finish('failed');
          return {
            success: false,
            durationMs: Date.now() - startTime,
            errors,
            warnings,
            rendererName: this.getName(),
            rendererVersion: this.getVersion(),
            logPath: path.join(logsDir, 'render.log')
          };
        }

        // 4b. Probe asset
        logger.log('info', `[segment ${i}] 探测素材元数据...`);
        let probeResult: AssetProbeResult;
        try {
          probeResult = probeAsset(videoSegment.assetRef.assetId, resolvedAsset.resolvedPath, {
            ffmpegPath: envReport.ffmpegPath!,
            ffprobePath: envReport.ffprobePath,
            cacheDir: probeDir
          });
        } catch (err) {
          const msg = `ffprobe 失败：${(err as Error).message}`;
          logger.addSegmentError(i, msg);
          errors.push({ stage: 'probe', message: msg });
          logger.finishSegment(i, 'failed', 0);
          logger.finish('failed');
          return {
            success: false,
            durationMs: Date.now() - startTime,
            errors,
            warnings,
            rendererName: this.getName(),
            rendererVersion: this.getVersion(),
            logPath: path.join(logsDir, 'render.log')
          };
        }

        if (probeResult.warnings.length > 0) {
          for (const w of probeResult.warnings) {
            logger.addSegmentWarning(i, `probe: ${w}`);
            warnings.push(`segment ${i}: ${w}`);
          }
        }

        // 4c. Preprocess segment
        try {
          const normalized = preprocessSegment(i, videoSegment, resolvedAsset, probeResult, {
            ffmpegPath: envReport.ffmpegPath!,
            outputProfile,
            segmentsDir,
            logger,
            maxRetries: 1
          });
          normalizedSegments.push(normalized);
        } catch (err) {
          const msg = `Preprocess 失败：${(err as Error).message}`;
          errors.push({ stage: 'preprocess', message: msg });
          logger.finish('failed');
          return {
            success: false,
            durationMs: Date.now() - startTime,
            errors,
            warnings,
            rendererName: this.getName(),
            rendererVersion: this.getVersion(),
            logPath: path.join(logsDir, 'render.log')
          };
        }
      }

      // 5. 保存 preprocess 结果
      const preprocessResult: PreprocessResult = {
        renderId,
        workDir,
        segmentsDir,
        probeDir,
        normalizedSegments,
        environmentReport: envReport,
        totalDuration
      };
      fs.writeFileSync(
        path.join(workDir, 'preprocess-result.json'),
        JSON.stringify(preprocessResult, null, 2),
        'utf8'
      );

      logger.finish('success');
      warnings.push(
        'Phase 2A：输出为 Normalized FFV1 Segments（中间产物），最终合成将在 Phase 2B 实现。'
      );

      return {
        success: true,
        outputPath: segmentsDir, // V0.1 输出 segments 目录，Phase 2B 将输出最终 mp4
        durationMs: Date.now() - startTime,
        errors,
        warnings,
        rendererName: this.getName(),
        rendererVersion: this.getVersion(),
        logPath: path.join(logsDir, 'render.log')
      };
    } catch (err) {
      const msg = `渲染过程中发生未预期错误：${(err as Error).message}`;
      logger.log('error', msg);
      errors.push({ stage: 'unknown', message: msg });
      logger.finish('failed');
      return {
        success: false,
        durationMs: Date.now() - startTime,
        errors,
        warnings,
        rendererName: this.getName(),
        rendererVersion: this.getVersion(),
        logPath: path.join(logsDir, 'render.log')
      };
    }
  }

  // ==========================================================================
  // Task Asset 注册
  // ==========================================================================

  /**
   * 注册一个 task_asset（任务级临时素材）。
   * 必须在 render() 之前调用。
   */
  registerTaskAsset(
    assetId: string,
    localPath: string,
    options?: { originalName?: string; metadata?: Record<string, unknown> }
  ): void {
    this.taskAssets[assetId] = { localPath, options };
  }

  /**
   * 批量注册 library_asset。
   */
  registerLibraryAssets(map: Record<string, string>): void {
    Object.assign(this.libraryAssetMap, map);
  }
}
