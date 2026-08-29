/**
 * Zhiheng Renderer Phase 2A 测试脚本。
 *
 * 测试内容：
 * A. Environment Preflight
 * B. Asset Resolver
 * C. ffprobe ingest
 * D. SDR preprocess（真实素材）
 * E. HLG preprocess（真实素材，验证不炸白）
 * F. 固定 Timeline 多segment preprocess
 *
 * 运行方式：npx tsx scripts/test-zhiheng-renderer-phase2a.ts
 *
 * 输出目录：tmp/zhiheng-renderer/render-xxx/
 */

import fs from 'node:fs';
import path from 'node:path';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import { runEnvironmentPreflight } from '../src/engines/zhiheng-renderer/environment';
import { probeAsset } from '../src/engines/zhiheng-renderer/ingest';
import { AssetResolver } from '../src/engines/zhiheng-renderer/asset-resolver';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

// ============================================================================
// 真实素材路径
// ============================================================================

const SDR_ASSET_PATH =
  'D:\\知衡智企\\浩明饮品知识库\\08_人工样片拆解\\04_样片004\\ddb67fecf27d89093298aa8f8c6fab4f.mp4';

const HLG_ASSET_PATH =
  'D:\\知衡智企\\浩明饮品知识库\\08_人工样片拆解\\04_样片004\\afeae50bd4f303d9739d0626b1b663e7_raw.mp4';

const SDR_ASSET_ID = 'test_sdr_001';
const HLG_ASSET_ID = 'test_hlg_001';

// ============================================================================
// 测试工具
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ❌ ${name}: ${err.message}`);
      failed++;
    });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// ============================================================================
// A. Environment Preflight
// ============================================================================

async function testEnvironmentPreflight(): Promise<void> {
  console.log('\n=== A. Environment Preflight ===');
  const report = runEnvironmentPreflight();

  console.log(`  ffmpeg: ${report.ffmpegPath || 'NOT FOUND'}`);
  console.log(`  ffprobe: ${report.ffprobePath || 'NOT FOUND (will use ffmpeg -i fallback)'}`);
  console.log(`  version: ${report.ffmpegVersion || 'unknown'}`);
  console.log(`  source: ${report.ffmpegSource}`);
  console.log(`  filters: ${report.filters.map((f) => `${f.name}=${f.available}`).join(', ')}`);
  console.log(`  encoders: ${report.encoders.map((e) => `${e.name}=${e.available}`).join(', ')}`);
  console.log(`  warnings: ${report.warnings.length}`);
  console.log(`  errors: ${report.errors.length}`);
  console.log(`  ready: ${report.ready}`);

  assert(report.ready, 'Environment Preflight 应该通过（ffmpeg + zscale + tonemap + ffv1）');
  assert(report.filters.find((f) => f.name === 'zscale')?.available === true, 'zscale 滤镜应该可用');
  assert(report.filters.find((f) => f.name === 'tonemap')?.available === true, 'tonemap 滤镜应该可用');
  assert(report.encoders.find((e) => e.name === 'ffv1')?.available === true, 'ffv1 编码器应该可用');
}

// ============================================================================
// B. Asset Resolver
// ============================================================================

async function testAssetResolver(): Promise<void> {
  console.log('\n=== B. Asset Resolver ===');
  const resolver = new AssetResolver('test-task-001', {
    [SDR_ASSET_ID]: SDR_ASSET_PATH,
  });
  resolver.registerTaskAsset(HLG_ASSET_ID, HLG_ASSET_PATH, { originalName: 'hlg-test.mp4' });

  const sdrResolved = resolver.resolve({ type: 'library_asset', assetId: SDR_ASSET_ID });
  const hlgResolved = resolver.resolve({ type: 'task_asset', assetId: HLG_ASSET_ID });
  const missingResolved = resolver.resolve({ type: 'library_asset', assetId: 'nonexistent' });

  console.log(`  SDR resolved: ${sdrResolved.resolvedPath}, exists=${sdrResolved.exists}`);
  console.log(`  HLG resolved: ${hlgResolved.resolvedPath}, exists=${hlgResolved.exists}`);
  console.log(`  missing resolved: ${missingResolved.resolvedPath}, exists=${missingResolved.exists}`);

  assert(sdrResolved.exists === true, 'SDR 素材应该存在');
  assert(hlgResolved.exists === true, 'HLG 素材应该存在');
  assert(missingResolved.exists === false, '不存在的素材应该返回 exists=false');
}

// ============================================================================
// C. ffprobe Ingest
// ============================================================================

async function testIngest(): Promise<void> {
  console.log('\n=== C. Asset Ingest & Probe ===');
  const env = runEnvironmentPreflight();
  const cacheDir = path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'test-probe-cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  const sdrProbe = probeAsset(SDR_ASSET_ID, SDR_ASSET_PATH, {
    ffmpegPath: env.ffmpegPath!,
    ffprobePath: env.ffprobePath,
    cacheDir,
  });

  const hlgProbe = probeAsset(HLG_ASSET_ID, HLG_ASSET_PATH, {
    ffmpegPath: env.ffmpegPath!,
    ffprobePath: env.ffprobePath,
    cacheDir,
  });

  console.log(`  SDR: colorClass=${sdrProbe.colorClass}, ${sdrProbe.video?.width}x${sdrProbe.video?.height}, fps=${sdrProbe.video?.avgFrameRate}, pix_fmt=${sdrProbe.video?.pixFmt}, transfer=${sdrProbe.video?.colorTransfer}`);
  console.log(`  HLG: colorClass=${hlgProbe.colorClass}, ${hlgProbe.video?.width}x${hlgProbe.video?.height}, fps=${hlgProbe.video?.avgFrameRate}, pix_fmt=${hlgProbe.video?.pixFmt}, transfer=${hlgProbe.video?.colorTransfer}, rotation=${hlgProbe.video?.rotation}`);
  console.log(`  probe source: SDR=${sdrProbe.probeSource}, HLG=${hlgProbe.probeSource}`);

  assert(sdrProbe.colorClass === 'SDR', 'SDR 素材应该分类为 SDR');
  assert(hlgProbe.colorClass === 'HLG', 'HLG 素材应该分类为 HLG');
  assert(hlgProbe.video?.colorTransfer === 'arib-std-b67', 'HLG 素材的 color_transfer 应该是 arib-std-b67');
  assert(hlgProbe.video?.rotation != null, 'HLG 素材应该检测到旋转');
}

// ============================================================================
// D + E + F. 完整 Render 测试（SDR + HLG + 多segment）
// ============================================================================

async function testFullRender(): Promise<void> {
  console.log('\n=== D+E+F. 完整 Render 测试（SDR + HLG + 多segment）===');

  const renderer = new ZhihengRenderer({
    libraryAssetMap: { [SDR_ASSET_ID]: SDR_ASSET_PATH },
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer'),
  });
  renderer.registerTaskAsset(HLG_ASSET_ID, HLG_ASSET_PATH, { originalName: 'hlg-test.mp4' });

  // 固定 Timeline：3 个 segment（SDR 3s + HLG 3s + SDR 3s）
  const timeline: UnifiedTimelineV1 = {
    schemaVersion: 1,
    timelineId: 'phase2a-test-001',
    taskId: 'phase2a-test',
    outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
    videoTrack: [
      {
        assetRef: { type: 'library_asset', assetId: SDR_ASSET_ID },
        sourceStart: 1.0,
        duration: 3.0,
        transition: 'hard_cut',
      },
      {
        assetRef: { type: 'task_asset', assetId: HLG_ASSET_ID },
        sourceStart: 2.0,
        duration: 3.0,
        transition: 'hard_cut',
      },
      {
        assetRef: { type: 'library_asset', assetId: SDR_ASSET_ID },
        sourceStart: 5.0,
        duration: 3.0,
        transition: 'hard_cut',
      },
    ],
    voiceTrack: [],
    subtitleTrack: [],
    titleTrack: [],
  };

  console.log('  开始 render（3 个 segment，每个 3 秒）...');
  const result = await renderer.render(timeline);

  console.log(`  success: ${result.success}`);
  console.log(`  outputPath: ${result.outputPath}`);
  console.log(`  durationMs: ${result.durationMs} (${(result.durationMs / 1000).toFixed(2)}s)`);
  console.log(`  errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(`    - [${err.stage}] ${err.message}`);
    }
  }
  console.log(`  warnings: ${result.warnings.length}`);
  for (const w of result.warnings) {
    console.log(`    - ${w}`);
  }
  console.log(`  logPath: ${result.logPath}`);

  assert(result.success === true, 'Render 应该成功');
  assert(result.errors.length === 0, '不应该有错误');

  // 验证输出文件
  const segmentsDir = result.outputPath!;
  const segmentFiles = fs.readdirSync(segmentsDir).filter((f) => f.endsWith('.mkv'));
  console.log(`  输出 segment 文件: ${segmentFiles.join(', ')}`);
  assert(segmentFiles.length === 3, '应该输出 3 个 segment 文件');

  for (const file of segmentFiles) {
    const filePath = path.join(segmentsDir, file);
    const stats = fs.statSync(filePath);
    console.log(`    ${file}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    assert(stats.size > 0, `${file} 不应该是空文件`);
  }

  // 验证 preprocess-result.json
  const workDir = path.dirname(segmentsDir);
  const preprocessResultPath = path.join(workDir, 'preprocess-result.json');
  assert(fs.existsSync(preprocessResultPath), 'preprocess-result.json 应该存在');
  const preprocessResult = JSON.parse(fs.readFileSync(preprocessResultPath, 'utf8'));
  console.log(`  normalized segments: ${preprocessResult.normalizedSegments.length}`);
  for (const seg of preprocessResult.normalizedSegments) {
    console.log(`    segment ${seg.segmentIndex}: colorClass=${seg.sourceColorClass}, pipeline=${seg.appliedColorPipeline}, ${seg.width}x${seg.height} @ ${seg.fps}fps, ${seg.pixelFormat}, codec=${seg.codec}, elapsed=${(seg.elapsedMs / 1000).toFixed(2)}s`);
  }

  // 验证 HLG segment 使用了 hlg_to_sdr pipeline
  const hlgSegment = preprocessResult.normalizedSegments.find((s: { sourceColorClass: string }) => s.sourceColorClass === 'HLG');
  assert(hlgSegment != null, '应该有一个 HLG segment');
  assert(hlgSegment.appliedColorPipeline === 'hlg_to_sdr', 'HLG segment 应该使用 hlg_to_sdr 色彩管线');
  assert(hlgSegment.width === 1080 && hlgSegment.height === 1920, 'HLG segment 输出应该是 1080x1920');
  assert(hlgSegment.fps === 30, 'HLG segment 输出应该是 30fps');
  assert(hlgSegment.pixelFormat === 'yuv420p10le', 'HLG segment 输出应该是 yuv420p10le');
  assert(hlgSegment.codec === 'ffv1', 'HLG segment 输出应该是 ffv1');

  // 验证 SDR segment 使用了 none_sdr pipeline
  const sdrSegments = preprocessResult.normalizedSegments.filter((s: { sourceColorClass: string }) => s.sourceColorClass === 'SDR');
  assert(sdrSegments.length === 2, '应该有 2 个 SDR segment');
  for (const seg of sdrSegments) {
    assert(seg.appliedColorPipeline === 'none_sdr', 'SDR segment 不应该执行 tone mapping');
  }
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('============================================================');
  console.log('Zhiheng Renderer Phase 2A 测试');
  console.log('============================================================');

  // 验证素材存在
  console.log('\n验证素材存在...');
  assert(fs.existsSync(SDR_ASSET_PATH), `SDR 素材不存在: ${SDR_ASSET_PATH}`);
  assert(fs.existsSync(HLG_ASSET_PATH), `HLG 素材不存在: ${HLG_ASSET_PATH}`);
  console.log('  素材均存在。');

  await testEnvironmentPreflight();
  await testAssetResolver();
  await testIngest();
  await testFullRender();

  console.log('\n============================================================');
  console.log(`测试结果：${passed} passed, ${failed} failed`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
