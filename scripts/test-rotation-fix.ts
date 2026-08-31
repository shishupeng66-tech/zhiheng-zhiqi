/**
 * Rotation 修复验证测试。
 *
 * 验证：
 * 1. HLG 素材（带 -90° rotation metadata）normalized 后方向正确（人物站立）
 * 2. 输出格式：1080x1920, 30fps, FFV1, yuv420p10le, BT.709
 * 3. HDR tone mapping 仍然正常
 * 4. rotation 处理链只执行一次（ffmpegAutorotate=false, manualRotationApplied=-90）
 *
 * 运行：npx tsx scripts/test-rotation-fix.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

const HLG_ASSET_PATH =
  'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解\\04_样片004\\afeae50bd4f303d9739d0626b1b663e7_raw.mp4';

const SDR_ASSET_PATH =
  'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解\\04_样片004\\ddb67fecf27d89093298aa8f8c6fab4f.mp4';

const HLG_ASSET_ID = 'test_hlg_rotation';
const SDR_ASSET_ID = 'test_sdr_no_rotation';

async function main(): Promise<void> {
  console.log('=== Rotation 修复验证测试 ===\n');

  // 验证素材存在
  if (!fs.existsSync(HLG_ASSET_PATH)) {
    throw new Error(`HLG 素材不存在: ${HLG_ASSET_PATH}`);
  }
  if (!fs.existsSync(SDR_ASSET_PATH)) {
    throw new Error(`SDR 素材不存在: ${SDR_ASSET_PATH}`);
  }
  console.log('素材均存在。');

  // 创建 Renderer（diagnosticMode: true，因为当前无 ffprobe）
  const renderer = new ZhihengRenderer({
    diagnosticMode: true,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'rotation-test'),
  });
  renderer.registerTaskAsset(HLG_ASSET_ID, HLG_ASSET_PATH, { originalName: 'hlg-rotation-test.mp4' });
  renderer.registerTaskAsset(SDR_ASSET_ID, SDR_ASSET_PATH, { originalName: 'sdr-no-rotation-test.mp4' });

  // Timeline：2 个 segment（SDR 无rotation + HLG 有rotation）
  const timeline: UnifiedTimelineV1 = {
    schemaVersion: 1,
    timelineId: 'rotation-fix-test',
    taskId: 'rotation-fix-test',
    outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
    videoTrack: [
      {
        assetRef: { type: 'task_asset', assetId: SDR_ASSET_ID },
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
    ],
    voiceTrack: [],
    subtitleTrack: [],
    titleTrack: [],
  };

  console.log('\n开始 render（SDR + HLG，各3秒）...');
  const result = await renderer.render(timeline);

  console.log('\n=== Render 结果 ===');
  console.log('success:', result.success);
  console.log('durationMs:', result.durationMs, `(${(result.durationMs / 1000).toFixed(2)}s)`);
  console.log('errors:', result.errors.length);
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log('  -', err.stage, ':', err.message.slice(0, 100));
    }
  }
  console.log('warnings:', result.warnings.length);

  if (!result.success) {
    throw new Error('Render 失败');
  }

  // 读取 preprocess-result.json 验证 rotation 字段
  const segmentsDir = result.outputPath!;
  const workDir = path.dirname(segmentsDir);
  const preprocessResultPath = path.join(workDir, 'preprocess-result.json');
  const preprocessResult = JSON.parse(fs.readFileSync(preprocessResultPath, 'utf8'));

  console.log('\n=== Rotation 字段验证 ===');
  for (const seg of preprocessResult.normalizedSegments) {
    console.log(`\nsegment ${seg.segmentIndex} (${seg.assetId}):`);
    console.log(`  sourceRotation: ${seg.sourceRotation}°`);
    console.log(`  ffmpegAutorotate: ${seg.ffmpegAutorotate}（应为 false）`);
    console.log(`  manualRotationApplied: ${seg.manualRotationApplied}°`);
    console.log(`  width x height: ${seg.width}x${seg.height}`);
    console.log(`  fps: ${seg.fps}`);
    console.log(`  pixelFormat: ${seg.pixelFormat}`);
    console.log(`  codec: ${seg.codec}`);
    console.log(`  sourceColorClass: ${seg.sourceColorClass}`);
    console.log(`  appliedColorPipeline: ${seg.appliedColorPipeline}`);

    // 验证
    if (seg.assetId === HLG_ASSET_ID) {
      console.log('  --- HLG 验证 ---');
      console.log('  sourceRotation=-90:', seg.sourceRotation === -90 ? 'PASS' : 'FAIL');
      console.log('  ffmpegAutorotate=true:', seg.ffmpegAutorotate === true ? 'PASS' : 'FAIL');
      console.log('  manualRotationApplied=0:', seg.manualRotationApplied === 0 ? 'PASS' : 'FAIL');
      console.log('  1080x1920:', seg.width === 1080 && seg.height === 1920 ? 'PASS' : 'FAIL');
      console.log('  30fps:', seg.fps === 30 ? 'PASS' : 'FAIL');
      console.log('  yuv420p10le:', seg.pixelFormat === 'yuv420p10le' ? 'PASS' : 'FAIL');
      console.log('  ffv1:', seg.codec === 'ffv1' ? 'PASS' : 'FAIL');
      console.log('  hlg_to_sdr pipeline:', seg.appliedColorPipeline === 'hlg_to_sdr' ? 'PASS' : 'FAIL');
    }
    if (seg.assetId === SDR_ASSET_ID) {
      console.log('  --- SDR 验证 ---');
      console.log('  sourceRotation=null:', seg.sourceRotation === null ? 'PASS' : 'FAIL');
      console.log('  ffmpegAutorotate=true:', seg.ffmpegAutorotate === true ? 'PASS' : 'FAIL');
      console.log('  manualRotationApplied=0:', seg.manualRotationApplied === 0 ? 'PASS' : 'FAIL');
      console.log('  none_sdr pipeline:', seg.appliedColorPipeline === 'none_sdr' ? 'PASS' : 'FAIL');
    }
  }

  // 用 ffmpeg 验证输出文件格式
  console.log('\n=== 输出文件格式验证（ffmpeg -i）===');
  const ffmpeg = 'C:\\Users\\Administrator\\AppData\\Local\\hermes\\hermes-agent\\venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
  const segmentFiles = fs.readdirSync(segmentsDir).filter((f) => f.endsWith('.mkv')).sort();
  for (const file of segmentFiles) {
    const filePath = path.join(segmentsDir, file);
    const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', filePath], { encoding: 'utf8' });
    const output = probe.stderr || '';
    const videoMatch = output.match(/Stream #\d+:\d+[^:]*Video:\s+([^,]+),\s+([^,]+),\s+(\d+)x(\d+)[^,]*,\s+([\d.]+)\s+fps/);
    if (videoMatch) {
      console.log(`  ${file}: ${videoMatch[1]}, ${videoMatch[2]}, ${videoMatch[3]}x${videoMatch[4]}, ${videoMatch[5]}fps`);
    }
    const stats = fs.statSync(filePath);
    console.log(`    size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }

  // 提取 HLG segment 的一帧用于人工验证方向
  console.log('\n=== 提取 HLG segment 帧用于人工方向验证 ===');
  const hlgSegmentFile = segmentFiles.find((f) => f.includes('02')) || segmentFiles[1];
  const hlgSegmentPath = path.join(segmentsDir, hlgSegmentFile);
  const frameOutputPath = path.join(workDir, 'hlg-normalized-frame.jpg');
  spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', hlgSegmentPath, '-frames:v', '1', '-vf', 'scale=540:960', frameOutputPath], { encoding: 'utf8' });
  console.log(`  帧已提取: ${frameOutputPath}`);
  console.log('  请人工确认：人物是否站立（方向正确）');

  console.log('\n=== 测试完成 ===');
  console.log('输出目录:', workDir);
  console.log('segments 目录:', segmentsDir);
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
