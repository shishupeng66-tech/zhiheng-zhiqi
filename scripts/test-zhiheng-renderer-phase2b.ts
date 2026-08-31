/**
 * Phase 2B 最终合成测试脚本。
 *
 * 测试内容：
 * - 5 个 video segment（SDR + HLG 混合）
 * - 1 个 voice asset（测试音频，非 1.1× 语速）
 * - 5 条字幕（含关键词高亮）
 * - 1 个 hook title
 * - 1 个 emphasis title
 * - 最终输出 final.mp4
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2b.ts
 *
 * 注意：
 * - 正式模式要求 ffmpeg + ffprobe。当前环境缺少 ffprobe 时会停止。
 * - voice 测试文件是从样片视频提取的音频，不是 1.1× 语速的 Voice Service 产物。
 * - 所有样式均为 provisional，需要人工看片确认。
 */

import fs from 'node:fs';
import path from 'node:path';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

// ============================================================================
// 测试素材配置
// ============================================================================

const SAMPLE_DIR = 'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解\\04_样片004';
const VOICE_FILE = 'D:\\知衡智企\\tmp\\test-assets\\test-voice-15s.m4a';

// 5 个测试素材（SDR + HLG 混合）
const TEST_ASSETS = [
  {
    assetId: 'test_sdr_001',
    path: path.join(SAMPLE_DIR, 'ddb67fecf27d89093298aa8f8c6fab4f.mp4'),
    desc: 'SDR 竖屏 720x1280'
  },
  {
    assetId: 'test_hlg_001',
    path: path.join(SAMPLE_DIR, 'afeae50bd4f303d9739d0626b1b663e7_raw.mp4'),
    desc: 'HLG 1920x1080 rotation=-90'
  },
  {
    assetId: 'test_raw_001',
    path: path.join(SAMPLE_DIR, '39415880e48fee6659623ec7ba0d5333_raw.mp4'),
    desc: 'raw 素材 1'
  },
  {
    assetId: 'test_raw_002',
    path: path.join(SAMPLE_DIR, '551e35c3b4c81948fc07b1b35da43450_raw.mp4'),
    desc: 'raw 素材 2'
  },
  {
    assetId: 'test_sdr_002',
    path: path.join(SAMPLE_DIR, 'ddb67fecf27d89093298aa8f8c6fab4f.mp4'),
    desc: 'SDR 竖屏（复用）'
  }
];

const VOICE_ASSET_ID = 'test_voice_001';

// ============================================================================
// 固定测试 Timeline
// ============================================================================

/**
 * 总时长：12 秒（5 个 segment，每个 2.4 秒）
 * voice 测试文件约 12.65 秒，足够覆盖。
 */
const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2b-final-test-001',
  taskId: 'phase2b-final-test-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    {
      assetRef: { type: 'task_asset', assetId: 'test_sdr_001' },
      sourceStart: 0.5,
      duration: 2.4,
      transition: 'hard_cut'
    },
    {
      assetRef: { type: 'task_asset', assetId: 'test_hlg_001' },
      sourceStart: 2.0,
      duration: 2.4,
      transition: 'hard_cut'
    },
    {
      assetRef: { type: 'task_asset', assetId: 'test_raw_001' },
      sourceStart: 1.0,
      duration: 2.4,
      transition: 'hard_cut'
    },
    {
      assetRef: { type: 'task_asset', assetId: 'test_raw_002' },
      sourceStart: 0.5,
      duration: 2.4,
      transition: 'hard_cut'
    },
    {
      assetRef: { type: 'task_asset', assetId: 'test_sdr_002' },
      sourceStart: 1.0,
      duration: 2.4,
      transition: 'hard_cut'
    }
  ],
  voiceTrack: [
    {
      assetRef: { type: 'task_asset', assetId: VOICE_ASSET_ID },
      start: 0,
      duration: 12.0,
      volume: 1.0
    }
  ],
  subtitleTrack: [
    {
      id: 'sub_001',
      start: 0,
      duration: 2.4,
      text: '欢迎来到浩明饮品',
      styleId: 'subtitle.default',
      highlights: []
    },
    {
      id: 'sub_002',
      start: 2.4,
      duration: 2.4,
      text: '我们支持 OEM 和 ODM 定制',
      styleId: 'subtitle.default',
      highlights: [
        { keyword: 'OEM' },
        { keyword: 'ODM' }
      ]
    },
    {
      id: 'sub_003',
      start: 4.8,
      duration: 2.4,
      text: '专注饮品制造二十年',
      styleId: 'subtitle.default',
      highlights: [
        { keyword: '二十年' }
      ]
    },
    {
      id: 'sub_004',
      start: 7.2,
      duration: 2.4,
      text: '品质保证 交付及时',
      styleId: 'subtitle.default',
      highlights: [
        { keyword: '品质保证' }
      ]
    },
    {
      id: 'sub_005',
      start: 9.6,
      duration: 2.4,
      text: '联系我们 开启合作',
      styleId: 'subtitle.default',
      highlights: []
    }
  ],
  titleTrack: [
    {
      id: 'title_hook_001',
      start: 0,
      duration: 3.0,
      text: '浩明饮品',
      styleId: 'title.hook',
      layer: 2
    },
    {
      id: 'title_emphasis_001',
      start: 6.0,
      duration: 3.0,
      text: 'OEM/ODM 定制',
      styleId: 'title.emphasis',
      layer: 2
    }
  ]
};

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('=== Zhiheng Renderer Phase 2B 最终合成测试 ===\n');

  // 1. 验证素材存在
  console.log('1. 验证素材...');
  for (const asset of TEST_ASSETS) {
    if (!fs.existsSync(asset.path)) {
      throw new Error(`素材不存在: ${asset.path} (${asset.desc})`);
    }
    console.log(`   ✓ ${asset.assetId}: ${asset.desc}`);
  }
  if (!fs.existsSync(VOICE_FILE)) {
    throw new Error(`voice 文件不存在: ${VOICE_FILE}`);
  }
  console.log(`   ✓ ${VOICE_ASSET_ID}: 测试 voice（非 1.1× 语速，从样片提取）`);

  // 2. 创建 Renderer（正式模式，diagnosticMode=false）
  console.log('\n2. 创建 ZhihengRenderer（正式模式）...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2b-test')
  });

  // 3. 注册 task assets
  console.log('\n3. 注册 task assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  renderer.registerTaskAsset(VOICE_ASSET_ID, VOICE_FILE, { originalName: 'test-voice-15s.m4a' });
  console.log('   ✓ 6 个 asset 已注册（5 video + 1 voice）');

  // 4. 显示 capabilities
  console.log('\n4. Renderer Capabilities:');
  const caps = renderer.getCapabilities();
  console.log(`   sourceTrim: ${caps.sourceTrim}`);
  console.log(`   multiSegmentConcat: ${caps.multiSegmentConcat}`);
  console.log(`   scaleCrop: ${caps.scaleCrop}`);
  console.log(`   hdrToneMap: ${caps.hdrToneMap}`);
  console.log(`   assSubtitles: ${caps.assSubtitles}`);
  console.log(`   keywordHighlight: ${caps.keywordHighlight}`);
  console.log(`   titleTrack: ${caps.titleTrack}`);
  console.log(`   voiceMix: ${caps.voiceMix}`);
  console.log(`   overlayTrack: ${caps.overlayTrack}`);
  console.log(`   bgmTrack: ${caps.bgmTrack}`);
  console.log(`   sfxTrack: ${caps.sfxTrack}`);
  console.log(`   transitions: ${caps.transitions.join(', ')}`);

  // 5. Timeline 验证
  console.log('\n5. Timeline 验证...');
  const validation = renderer.validate(TEST_TIMELINE);
  console.log(`   valid: ${validation.valid}`);
  console.log(`   errors: ${validation.errors.length}`);
  for (const err of validation.errors) {
    console.log(`     - ${err.field}: ${err.message}`);
  }
  console.log(`   warnings: ${validation.warnings.length}`);
  for (const w of validation.warnings) {
    console.log(`     - ${w}`);
  }

  if (!validation.valid) {
    console.log('\n✗ Timeline 验证失败，终止渲染。');
    process.exit(1);
  }

  // 6. 执行渲染
  console.log('\n6. 执行渲染（preprocess + ASS + compose）...');
  console.log('   预计总时长：12.0s');
  const startTime = Date.now();
  const result = await renderer.render(TEST_TIMELINE);
  const totalMs = Date.now() - startTime;

  // 7. 输出结果
  console.log('\n=== 渲染结果 ===');
  console.log(`success: ${result.success}`);
  console.log(`durationMs: ${result.durationMs} (${(result.durationMs / 1000).toFixed(2)}s)`);
  console.log(`outputPath: ${result.outputPath}`);
  console.log(`errors: ${result.errors.length}`);
  for (const err of result.errors) {
    console.log(`  - [${err.stage}] ${err.message.slice(0, 150)}`);
  }
  console.log(`warnings: ${result.warnings.length}`);
  for (const w of result.warnings.slice(0, 10)) {
    console.log(`  - ${w.slice(0, 100)}`);
  }
  console.log(`logPath: ${result.logPath}`);

  // 8. 如果成功，检查输出文件
  if (result.success && result.outputPath) {
    const finalPath = result.outputPath;
    if (fs.existsSync(finalPath)) {
      const stats = fs.statSync(finalPath);
      console.log(`\n=== final.mp4 ===`);
      console.log(`路径: ${finalPath}`);
      console.log(`大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      // 读取 render report
      const workDir = path.dirname(finalPath);
      const reportPath = path.join(workDir, 'render-report.json');
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        console.log(`\n=== 时长校验 ===`);
        console.log(`expectedDuration: ${report.compose.expectedDuration.toFixed(3)}s`);
        console.log(`finalDuration: ${report.compose.finalDuration.toFixed(3)}s`);
        console.log(`durationDiff: ${report.compose.durationDiff.toFixed(3)}s`);
        console.log(`compose elapsed: ${(report.compose.elapsedMs / 1000).toFixed(2)}s`);
      }

      // 列出工作目录文件
      console.log(`\n=== 工作目录文件 ===`);
      const files = fs.readdirSync(workDir);
      for (const f of files.sort()) {
        const filePath = path.join(workDir, f);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          console.log(`  ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
        } else {
          console.log(`  ${f}/`);
        }
      }

      console.log(`\n✓ Phase 2B 最终合成测试完成！`);
      console.log(`  请人工检查 final.mp4：方向、字幕、关键词高亮、标题、voice、时长。`);
      console.log(`  注意：所有样式均为 provisional，需要人工看片确认后调整。`);
      console.log(`  注意：voice 是测试音频，不是 1.1× 语速的 Voice Service 产物。`);
    } else {
      console.log(`\n✗ 输出文件不存在: ${finalPath}`);
    }
  } else {
    console.log(`\n✗ 渲染失败。`);
    if (result.errors.length > 0) {
      const firstErr = result.errors[0];
      if (firstErr.stage === 'environment') {
        console.log(`\n  环境检查失败。正式模式要求 ffmpeg + ffprobe。`);
        console.log(`  当前环境缺少 ffprobe，请安装完整 FFmpeg distribution（包含 ffprobe.exe）。`);
        console.log(`  建议 bundled 目录：项目 bin/ffmpeg/，包含 ffmpeg.exe + ffprobe.exe`);
      }
    }
  }
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
