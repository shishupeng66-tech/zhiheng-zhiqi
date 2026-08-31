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
import { AssGenerator } from './ass-generator';
import { StyleRegistry } from './style-registry';
import { composeFinal, type ComposeResult, type OverlayInput } from './compose';
import {
  generateAllGraphics,
  generateGraphicCustom,
  type GeneratedGraphic
} from './graphic-generator';
import {
  calculateLayout,
  getOverlayLayer,
  DEFAULT_SAFE_AREA,
  DEFAULT_ELEMENT_SIZES
} from './layout-registry';
import { PackagingAssetResolver } from './packaging-asset-resolver';

// ============================================================================
// 类型定义
// ============================================================================

export interface ZhihengRendererOptions {
  /** library_asset 的 assetId → 真实路径映射表 */
  libraryAssetMap?: Record<string, string>;
  /** 工作目录根路径，默认 tmp/zhiheng-renderer */
  workRoot?: string;
  /**
   * 诊断/开发 fallback 模式。
   * - false（默认，正式生产模式）：ffmpeg + ffprobe 都是必需依赖。
   *   ffprobe 不存在时 Environment Preflight 返回 ENVIRONMENT_CHECK_FAILED，不继续 preprocess。
   *   Asset Ingest 必须使用 ffprobe JSON，不得使用 ffmpeg -i 正则 fallback。
   * - true（诊断/开发模式）：允许 ffprobe 缺失时使用 ffmpeg -i 正则 fallback，
   *   但必须产生 NON_PRODUCTION_PROBE_FALLBACK warning。此模式仅用于开发排查，
   *   正式 ZhihengRenderer.render() 不得默认启用。
   */
  diagnosticMode?: boolean;
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
  private diagnosticMode: boolean;

  constructor(options: ZhihengRendererOptions = {}) {
    this.libraryAssetMap = options.libraryAssetMap || {};
    this.workRoot = options.workRoot || path.join(process.cwd(), 'tmp', 'zhiheng-renderer');
    this.diagnosticMode = options.diagnosticMode ?? false;
    this.validator = new TimelineValidator();
  }

  // ==========================================================================
  // RendererInterface 实现
  // ==========================================================================

  getName(): string {
    return 'zhiheng';
  }

  getVersion(): string {
    return '0.2.0-phase2d';
  }

  getCapabilities(): RendererCapabilities {
    return {
      sourceTrim: true,
      multiSegmentConcat: true,
      scaleCrop: true,
      hdrToneMap: true,
      assSubtitles: true,
      keywordHighlight: true,
      titleTrack: true,
      overlayTrack: true, // Phase 2C 实现：PNG/Logo/Badge/Title Panel/Info Card/Sticker
      bgmTrack: true, // Phase 2D 实现：BGM 循环 + 音量
      sfxTrack: true, // Phase 2D 实现：SFX 时间点插入
      voiceMix: true,
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

    // overlay/bgm/sfx 能力检查
    // overlayTrack 已在 Phase 2C 实现，不再报错
    if (tl?.bgmTrack && tl.bgmTrack.length > 0 && !caps.bgmTrack) {
      result.errors.push({
        field: 'bgmTrack',
        message: 'ZhihengRenderer V0.1 不支持 bgmTrack，Timeline 中包含 bgmTrack。',
        code: ValidationErrorCode.UNSUPPORTED_CAPABILITY
      });
    }

    if (tl?.sfxTrack && tl.sfxTrack.length > 0 && !caps.sfxTrack) {
      result.errors.push({
        field: 'sfxTrack',
        message: 'ZhihengRenderer V0.1 不支持 sfxTrack，Timeline 中包含 sfxTrack。',
        code: ValidationErrorCode.UNSUPPORTED_CAPABILITY
      });
    }

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
      const envReport = runEnvironmentPreflight({ diagnosticMode: this.diagnosticMode });
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

      // 3.5 初始化 Packaging Asset Resolver（音效/贴纸/花字模板库）
      const packagingResolver = new PackagingAssetResolver();
      const pkgStats = packagingResolver.getStats();
      logger.log(
        'info',
        'Packaging Asset Resolver 初始化：音效' +
          pkgStats.sound.count +
          '个, 贴纸' +
          pkgStats.sticker.count +
          '个, 花字' +
          pkgStats.textStyle.count +
          '个'
      );

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
            cacheDir: probeDir,
            diagnosticMode: this.diagnosticMode
          });
        } catch (err) {
          console.error('渲染错误堆栈:', (err as Error).stack);
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
          console.error('渲染错误堆栈:', (err as Error).stack);
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

      // 6. 保存 timeline.json
      fs.writeFileSync(path.join(workDir, 'timeline.json'), JSON.stringify(tl, null, 2), 'utf8');

      // 7. 生成 ASS 字幕文件
      const assPath = path.join(workDir, 'subtitles.ass');
      const styleRegistry = new StyleRegistry();
      const assGenerator = new AssGenerator(styleRegistry, {
        width: outputProfile.width,
        height: outputProfile.height,
        videoDuration: totalDuration,
        textStyleResolver: packagingResolver
      });
      const assResult = assGenerator.generateToFile(
        tl.subtitleTrack || [],
        tl.titleTrack || [],
        assPath
      );
      warnings.push(...assResult.warnings.map((w) => 'ASS: ' + w));
      logger.log(
        'info',
        `ASS 生成完成：${assResult.subtitleCount} 条字幕, ${assResult.titleCount} 条标题, 用到 ${assResult.usedStyles.length} 个样式`
      );

      // 7.5 花字模板装饰转换为 overlay（sticker + graphic色块背景）
      const textStyleOverlaySegments: any[] = [];
      const textStyleGraphicInputs: OverlayInput[] = [];
      if (assResult.textStyleOverlays && assResult.textStyleOverlays.length > 0) {
        const graphicDir = path.join(workDir, 'graphics');
        for (const tso of assResult.textStyleOverlays) {
          if (tso.type === 'sticker') {
            // sticker 类型：转换成 overlay segment，后续统一处理
            let anchor = 'top_left';
            if (tso.position === 'behind_text') anchor = 'center';
            else if (tso.position === 'left_of_text') anchor = 'top_left';
            else if (tso.position === 'right_of_text') anchor = 'top_right';
            textStyleOverlaySegments.push({
              id: 'textstyle_' + tso.titleId + '_dec' + tso.decorationIndex,
              type: 'sticker',
              assetRef: { type: 'library_asset', assetId: tso.assetId },
              styleId: 'sticker.default',
              anchor: anchor,
              start: tso.start,
              duration: tso.duration,
              transition: 'hard_cut'
            });
          } else if (tso.type === 'graphic') {
            // graphic 类型：直接生成色块背景PNG，构建OverlayInput
            try {
              const bgColor = tso.graphicBackgroundColor || '#FBBF24@0.9';
              const opacity = tso.opacity ?? 1.0;
              // 如果颜色格式是 #RRGGBB 且 opacity<1，加上透明度
              let finalColor = bgColor;
              if (!bgColor.includes('@') && opacity < 1.0) {
                finalColor = bgColor + '@' + opacity;
              }
              const graphic = generateGraphicCustom(
                envReport.ffmpegPath!,
                graphicDir,
                'textstyle_' + tso.titleId + '_dec' + tso.decorationIndex,
                tso.graphicWidth || 400,
                tso.graphicHeight || 100,
                finalColor
              );
              textStyleGraphicInputs.push({
                id: 'textstyle_graphic_' + tso.titleId + '_dec' + tso.decorationIndex,
                imagePath: graphic.outputPath,
                x: tso.graphicX || 0,
                y: tso.graphicY || 0,
                start: tso.start,
                end: tso.start + tso.duration,
                layer: 5, // 色块背景在文字下方
                opacity: 1.0 // 透明度已经在PNG中
              });
              logger.log(
                'info',
                '花字模板色块背景生成：' +
                  tso.titleId +
                  ' dec' +
                  tso.decorationIndex +
                  ' (' +
                  graphic.width +
                  'x' +
                  graphic.height +
                  ', x=' +
                  (tso.graphicX || 0) +
                  ', y=' +
                  (tso.graphicY || 0) +
                  ')'
              );
            } catch (e: any) {
              warnings.push('花字模板色块背景生成失败：' + tso.titleId + ' - ' + e.message);
            }
          }
        }
        logger.log(
          'info',
          '花字模板装饰转换：' +
            textStyleOverlaySegments.length +
            ' 个 sticker, ' +
            textStyleGraphicInputs.length +
            ' 个 graphic色块'
        );
      }
      // 8. 解析 voice asset
      let voicePath: string | undefined;
      let voiceVolume = 1.0;
      if (tl.voiceTrack && tl.voiceTrack.length > 0) {
        const voiceSegment = tl.voiceTrack[0]; // V0.1 只支持一个 voice track
        const resolvedVoice = assetResolver.resolve(voiceSegment.assetRef);
        if (resolvedVoice.resolvedPath && resolvedVoice.exists) {
          voicePath = resolvedVoice.resolvedPath;
          voiceVolume = voiceSegment.volume ?? 1.0;
          logger.log('info', `voice asset 解析成功：${voicePath}, volume=${voiceVolume}`);
        } else {
          const msg = `voice asset 解析失败：assetId=${voiceSegment.assetRef.assetId}`;
          logger.log('error', msg);
          errors.push({ stage: 'voice_resolve', message: msg });
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

      // 9. Overlay 包装层处理（Phase 2C）
      const overlayInputs: OverlayInput[] = [];
      if (tl.overlayTrack && tl.overlayTrack.length > 0) {
        logger.log('info', `处理 overlayTrack：${tl.overlayTrack.length} 个包装元素`);

        // 9.1 生成 graphic（badge/title_panel/info_card 背景 PNG，过滤 sticker/image/logo）
        const graphicOverlays = tl.overlayTrack.filter(function (ov) {
          return ov.type === 'badge' || ov.type === 'title_panel' || ov.type === 'info_card';
        });
        let graphics: Map<string, GeneratedGraphic> = new Map();
        try {
          graphics = generateAllGraphics(envReport.ffmpegPath!, graphicOverlays, workDir);
          logger.log('info', `已生成 ${graphics.size} 个 graphic 背景`);
        } catch (e: any) {
          const msg = `graphic 生成失败：${e.message}`;
          logger.log('error', msg);
          errors.push({ stage: 'graphic_generate', message: msg });
        }

        // 9.2 对每个 overlay 计算 layout 并构建 OverlayInput（含花字模板装饰贴纸）
        const allOverlays = [...(tl.overlayTrack || []), ...textStyleOverlaySegments];
        for (const ov of allOverlays) {
          let imagePath: string | null = null;
          let elementWidth = 0;
          let elementHeight = 0;

          if (ov.type === 'image' || ov.type === 'logo') {
            // image/logo 类型：通过 Asset Resolver 获取 PNG 路径
            if (!ov.assetRef) {
              warnings.push(`overlay ${ov.id} (${ov.type}) 缺少 assetRef，跳过`);
              continue;
            }
            const resolved = assetResolver.resolve(ov.assetRef);
            if (!resolved.exists) {
              warnings.push(`overlay ${ov.id} 素材不存在：${ov.assetRef.assetId}，跳过`);
              continue;
            }
            imagePath = resolved.resolvedPath;
            // 用 ffprobe 获取图片尺寸（简化：用默认尺寸，后续可优化）
            const defaultSize = DEFAULT_ELEMENT_SIZES[ov.styleId] || { width: 200, height: 200 };
            elementWidth = defaultSize.width;
            elementHeight = defaultSize.height;
          } else if (ov.type === 'sticker') {
            // sticker 类型：通过 Packaging Asset Resolver 从贴纸库获取 PNG 路径
            if (!ov.assetRef) {
              warnings.push('overlay ' + ov.id + ' (sticker) 缺少 assetRef，跳过');
              continue;
            }
            const stickerResolved = packagingResolver.resolve(ov.assetRef.assetId, 'sticker_asset');
            if (!stickerResolved.exists) {
              warnings.push('overlay ' + ov.id + ' 贴纸不存在：' + ov.assetRef.assetId + '，跳过');
              continue;
            }
            imagePath = stickerResolved.resolvedPath!;
            const stickerSize = DEFAULT_ELEMENT_SIZES[ov.styleId] || { width: 160, height: 160 };
            elementWidth = stickerSize.width;
            elementHeight = stickerSize.height;
          } else {
            // badge/title_panel/info_card：使用生成的 graphic
            const graphic = graphics.get(ov.id);
            if (!graphic) {
              warnings.push(`overlay ${ov.id} graphic 未生成，跳过`);
              continue;
            }
            imagePath = graphic.outputPath;
            elementWidth = graphic.width;
            elementHeight = graphic.height;
          }

          if (!imagePath) continue;

          // 9.3 计算 layout 坐标
          const layout = calculateLayout(
            ov.anchor,
            { width: elementWidth, height: elementHeight },
            outputProfile.width,
            outputProfile.height,
            DEFAULT_SAFE_AREA
          );

          if (layout.subtitleAvoidanceApplied) {
            logger.log('info', `overlay ${ov.id} 触发字幕避让，y 调整为 ${layout.y}`);
          }

          // 9.4 构建 OverlayInput
          overlayInputs.push({
            id: ov.id,
            imagePath,
            x: layout.x,
            y: layout.y,
            start: ov.start,
            end: ov.start + ov.duration,
            layer: getOverlayLayer(ov.type),
            opacity: ov.opacity
          });

          logger.log(
            'info',
            `overlay ${ov.id} (${ov.type}): x=${layout.x}, y=${layout.y}, t=${ov.start.toFixed(2)}-${(ov.start + ov.duration).toFixed(2)}s`
          );
        }

        logger.log(
          'info',
          `overlay 处理完成：${overlayInputs.length}/${tl.overlayTrack.length} 个元素将被叠加`
        );
      }

      // 9.5 加入花字模板色块背景 overlay（在文字下方）
      if (textStyleGraphicInputs.length > 0) {
        overlayInputs.push(...textStyleGraphicInputs);
        logger.log('info', '加入花字模板色块背景：' + textStyleGraphicInputs.length + ' 个');
      }

      // 9.6 处理 BGM / SFX（通过 Packaging Asset Resolver 解析音效库）
      const bgmTracks: Array<{
        path: string;
        start: number;
        duration: number;
        volume: number;
        loop: boolean;
      }> = [];
      const sfxTracks: Array<{ path: string; start: number; duration: number; volume: number }> =
        [];

      if (tl.bgmTrack && tl.bgmTrack.length > 0) {
        for (const bgm of tl.bgmTrack) {
          const resolved = packagingResolver.resolve(bgm.assetRef.assetId, 'sound_asset');
          if (resolved.exists) {
            bgmTracks.push({
              path: resolved.resolvedPath!,
              start: bgm.start,
              duration: bgm.duration,
              volume: bgm.volume,
              loop: bgm.loop
            });
            logger.log(
              'info',
              'BGM 解析成功：' +
                bgm.assetRef.assetId +
                ' -> ' +
                resolved.resolvedPath +
                ', volume=' +
                bgm.volume +
                ', loop=' +
                bgm.loop
            );
          } else {
            warnings.push('BGM 素材不存在：' + bgm.assetRef.assetId + '，跳过');
          }
        }
      }

      if (tl.sfxTrack && tl.sfxTrack.length > 0) {
        for (const sfx of tl.sfxTrack) {
          const resolved = packagingResolver.resolve(sfx.assetRef.assetId, 'sound_asset');
          if (resolved.exists) {
            sfxTracks.push({
              path: resolved.resolvedPath!,
              start: sfx.start,
              duration: sfx.duration,
              volume: sfx.volume
            });
            logger.log(
              'info',
              'SFX 解析成功：' +
                sfx.assetRef.assetId +
                ' -> ' +
                resolved.resolvedPath +
                ', start=' +
                sfx.start +
                's, volume=' +
                sfx.volume
            );
          } else {
            warnings.push('SFX 素材不存在：' + sfx.assetRef.assetId + '，跳过');
          }
        }
      }

      // 9.7 花字模板入场音效自动添加（entrySfx）
      if (assResult.textStyleEntrySfxs && assResult.textStyleEntrySfxs.length > 0) {
        for (const esfx of assResult.textStyleEntrySfxs) {
          const resolved = packagingResolver.resolve(esfx.sfxAssetId, 'sound_asset');
          if (resolved.exists) {
            sfxTracks.push({
              path: resolved.resolvedPath!,
              start: esfx.start,
              duration: 2.0,
              volume: esfx.volume
            });
            logger.log(
              'info',
              '花字模板入场音效：' +
                esfx.sfxAssetId +
                ' -> ' +
                resolved.resolvedPath +
                ', start=' +
                esfx.start +
                's, volume=' +
                esfx.volume
            );
          } else {
            warnings.push('花字模板入场音效素材不存在：' + esfx.sfxAssetId + '，跳过');
          }
        }
      }

      // 10. 最终合成
      const finalOutputPath = path.join(workDir, 'final.mp4');
      logger.log(
        'info',
        `开始最终合成（concat + ${overlayInputs.length} overlays + ASS + voice + H.264/AAC）...`
      );
      const composeResult: ComposeResult = composeFinal(normalizedSegments, {
        ffmpegPath: envReport.ffmpegPath!,
        outputProfile,
        workDir,
        outputPath: finalOutputPath,
        assPath,
        voicePath,
        voiceVolume,
        overlays: overlayInputs,
        bgmTracks,
        sfxTracks,
        videoDuration: totalDuration,
        logger
      });

      warnings.push(...composeResult.warnings);
      if (!composeResult.success) {
        for (const err of composeResult.errors) {
          errors.push({ stage: 'compose', message: err });
        }
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

      // 10. 保存 render report
      const renderReport = {
        renderId,
        taskId: tl.taskId,
        timelineId: tl.timelineId,
        rendererName: this.getName(),
        rendererVersion: this.getVersion(),
        startTime: new Date(startTime).toISOString(),
        totalDurationMs: Date.now() - startTime,
        outputProfile,
        videoTotalDuration: totalDuration,
        segmentCount: normalizedSegments.length,
        subtitleCount: assResult.subtitleCount,
        titleCount: assResult.titleCount,
        hasVoice: !!voicePath,
        compose: {
          expectedDuration: composeResult.expectedDuration,
          finalDuration: composeResult.finalDuration,
          durationDiff: composeResult.durationDiff,
          ffmpegExitCode: composeResult.ffmpegExitCode,
          elapsedMs: composeResult.elapsedMs
        },
        outputPath: finalOutputPath,
        warnings,
        errors: errors.map((e) => ({ stage: e.stage, message: e.message }))
      };
      fs.writeFileSync(
        path.join(workDir, 'render-report.json'),
        JSON.stringify(renderReport, null, 2),
        'utf8'
      );

      logger.log(
        'info',
        `渲染完成：final.mp4, 时长 ${composeResult.finalDuration.toFixed(3)}s (期望 ${totalDuration.toFixed(3)}s, 差异 ${composeResult.durationDiff.toFixed(3)}s)`
      );
      logger.finish('success');

      return {
        success: true,
        outputPath: finalOutputPath,
        durationMs: Date.now() - startTime,
        errors,
        warnings,
        rendererName: this.getName(),
        rendererVersion: this.getVersion(),
        logPath: path.join(logsDir, 'render.log')
      };
    } catch (err) {
      console.error('渲染错误堆栈:', (err as Error).stack);
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
