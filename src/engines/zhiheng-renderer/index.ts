/**
 * Zhiheng Renderer —— 知衡自研视频渲染器模块入口。
 *
 * Phase 1（本轮）只交付契约层 + 接口层：
 * - Unified Timeline V1 类型定义（zod schema + TypeScript 类型）
 * - Style Registry（样式注册表）
 * - Timeline Validator（schema + semantic 验证）
 *
 * Phase 2 将交付：
 * - Asset Resolver（assetId → 真实文件路径）
 * - Asset Ingest & Probe（ffprobe 元数据 + 色彩空间分类）
 * - Per-Segment Preprocess（裁剪/缩放/fps/HDR→SDR/FFV1 中间文件）
 * - ASS Generator（统一文字层 → .ass 文件）
 * - Final Composition（FFmpeg 命令生成 + 执行）
 * - Environment Preflight
 * - ZhihengRenderer 类（implements RendererInterface）
 *
 * 本模块不依赖 MPT，不修改 moneyprinter-engine.ts。
 */

// 类型与 schema
export {
  // AssetRef
  AssetRefSchema,
  type AssetRef,
  // OutputProfile
  OutputProfileSchema,
  type OutputProfile,
  DEFAULT_OUTPUT_PROFILE,
  // Video Track
  VideoTransitionV01,
  VideoSegmentSchema,
  type VideoSegment,
  // Voice Track
  VoiceSegmentSchema,
  type VoiceSegment,
  // Subtitle Track
  SubtitleHighlightSchema,
  type SubtitleHighlight,
  SubtitleSegmentSchema,
  type SubtitleSegment,
  // Title Track
  TitleSegmentSchema,
  type TitleSegment,
  // 预留 Track
  OverlaySegmentSchema,
  type OverlaySegment,
  BgmSegmentSchema,
  type BgmSegment,
  SfxSegmentSchema,
  type SfxSegment,
  // Unified Timeline V1
  UnifiedTimelineV1Schema,
  type UnifiedTimelineV1,
  // 工具函数
  calculateVideoTotalDuration,
  deriveVideoTimelineStarts
} from './types';

// Style Registry
export {
  StyleRegistry,
  type StyleDefinition,
  type StyleStatus,
  type AssStyleDefinition,
  BUILTIN_STYLE_IDS
} from './style-registry';

// Validator
export { TimelineValidator, validateTimeline } from './validator';

// Environment Preflight
export {
  runEnvironmentPreflight,
  runFfmpeg,
  type RendererEnvironmentReport,
  type EnvironmentFilterInfo,
  type EnvironmentEncoderInfo,
  type EnvironmentDependencySource,
  type PreflightOptions
} from './environment';

// Asset Resolver
export {
  AssetResolver,
  TaskAssetManifest,
  type ResolvedAsset,
  type AssetType,
  type ResolvedAssetSource,
  type TaskAssetManifestData,
  type TaskAssetManifestEntry
} from './asset-resolver';

// Asset Ingest & Probe
export {
  probeAsset,
  type AssetProbeResult,
  type ColorClass,
  type ProbeSource,
  type VideoStreamInfo,
  type AudioStreamInfo,
  type ProbeOptions
} from './ingest';

// Logger
export { RenderLogger, type RenderReport, type SegmentLogEntry, type LogLevel } from './logger';

// Per-Segment Preprocess
export {
  preprocessSegment,
  type NormalizedSegment,
  type ColorPipeline,
  type PreprocessOptions
} from './preprocess';

// Zhiheng Renderer
export { ZhihengRenderer, type ZhihengRendererOptions, type PreprocessResult } from './renderer';
