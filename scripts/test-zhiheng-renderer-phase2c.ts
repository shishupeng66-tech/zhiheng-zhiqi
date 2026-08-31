/**
 * Phase 2C Visual Packaging Layer V0.1 测试脚本。
 *
 * 测试内容：
 * - 5 个 video segment（SDR + HLG 混合）
 * - 1 个 voice asset
 * - 5 条字幕（含关键词高亮）
 * - 2 个标题（hook + emphasis）
 * - overlayTrack：
 *   1. title_panel（顶部，配合 hook title）
 *   2. title_panel（中部，配合 emphasis title）
 *   3. badge（右上角，OEM/ODM）
 *   4. info_card（左下角，自有工厂 + OEM/ODM）
 * - 最终输出 final-packaged.mp4
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2c.ts
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

const TEST_ASSETS = [
  { assetId: 'test_sdr_001', path: path.join(SAMPLE_DIR, 'ddb67fecf27d89093298aa8f8c6fab4f.mp4'), desc: 'SDR 竖屏 720x1280' },
  { assetId: 'test_hlg_001', path: path.join(SAMPLE_DIR, 'afeae50bd4f303d9739d0626b1b663e7_raw.mp4'), desc: 'HLG 1920x1080 rotation=-90' },
  { assetId: 'test_raw_001', path: path.join(SAMPLE_DIR, '39415880e48fee6659623ec7ba0d5333_raw.mp4'), desc: 'raw 素材 1' },
  { assetId: 'test_raw_002', path: path.join(SAMPLE_DIR, '551e35c3b4c81948fc07b1b35da43450_raw.mp4'), desc: 'raw 素材 2' },
  { assetId: 'test_sdr_002', path: path.join(SAMPLE_DIR, 'ddb67fecf27d89093298aa8f8c6fab4f.mp4'), desc: 'SDR 竖屏（复用）' }
];

const VOICE_ASSET_ID = 'test_voice_001';

// ============================================================================
// 固定测试 Timeline（Phase 2C，含 overlayTrack）
// ============================================================================

const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2c-packaging-test-001',
  taskId: 'phase2c-packaging-test-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    { assetRef: { type: 'task_asset', assetId: 'test_sdr_001' }, sourceStart: 0.5, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'test_hlg_001' }, sourceStart: 2.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'test_raw_001' }, sourceStart: 1.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'test_raw_002' }, sourceStart: 0.5, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'test_sdr_002' }, sourceStart: 1.0, duration: 2.4, transition: 'hard_cut' }
  ],
  voiceTrack: [
    { assetRef: { type: 'task_asset', assetId: VOICE_ASSET_ID }, start: 0, duration: 12.0, volume: 1.0 }
  ],
  subtitleTrack: [
    { id: 'sub_001', start: 0, duration: 2.4, text: '欢迎来到浩明饮品', styleId: 'subtitle.default', highlights: [] },
    { id: 'sub_002', start: 2.4, duration: 2.4, text: '我们支持 OEM 和 ODM 定制', styleId: 'subtitle.default', highlights: [{ keyword: 'OEM' }, { keyword: 'ODM' }] },
    { id: 'sub_003', start: 4.8, duration: 2.4, text: '专注饮品制造二十年', styleId: 'subtitle.default', highlights: [{ keyword: '二十年' }] },
    { id: 'sub_004', start: 7.2, duration: 2.4, text: '品质保证 交付及时', styleId: 'subtitle.default', highlights: [{ keyword: '品质保证' }] },
    { id: 'sub_005', start: 9.6, duration: 2.4, text: '联系我们 开启合作', styleId: 'subtitle.default', highlights: [] }
  ],
  titleTrack: [
    // 原有标题
    { id: 'title_hook_001', start: 0, duration: 3.0, text: '浩明饮品', styleId: 'title.hook', layer: 2 },
    { id: 'title_emphasis_001', start: 6.0, duration: 3.0, text: 'OEM/ODM 定制', styleId: 'title.emphasis', layer: 2 },
    // Phase 2C 新增：badge 文字（配合 overlayTrack badge 背景）
    { id: 'title_badge_001', start: 2.4, duration: 4.8, text: 'OEM/ODM', styleId: 'title.badge', layer: 3 },
    // Phase 2C 新增：info_card 文字（配合 overlayTrack info_card 背景）
    { id: 'title_card_title_001', start: 0, duration: 4.0, text: '自有工厂', styleId: 'title.card_title', layer: 3 },
    { id: 'title_card_subtitle_001', start: 0, duration: 4.0, text: 'OEM / ODM 定制', styleId: 'title.card_subtitle', layer: 3 }
  ],
  // Phase 2C 新增：overlayTrack 包装层
  overlayTrack: [
    // 1. 标题底板（顶部，配合 hook title "浩明饮品"）
    {
      id: 'ov_panel_hook',
      type: 'title_panel',
      styleId: 'panel.hook',
      anchor: 'top_center',
      start: 0,
      duration: 3.0
    },
    // 2. 标题底板（中部，配合 emphasis title "OEM/ODM 定制"）
    {
      id: 'ov_panel_emphasis',
      type: 'title_panel',
      styleId: 'panel.default',
      anchor: 'center',
      start: 6.0,
      duration: 3.0
    },
    // 3. 角标（右上角，OEM/ODM）
    {
      id: 'ov_badge_oem',
      type: 'badge',
      styleId: 'badge.oem',
      anchor: 'top_right',
      start: 2.4,
      duration: 4.8,
      text: 'OEM/ODM'
    },
    // 4. 信息卡（左下角，自有工厂 + OEM/ODM）
    {
      id: 'ov_card_factory',
      type: 'info_card',
      styleId: 'card.info',
      anchor: 'bottom_left',
      start: 0,
      duration: 4.0,
      text: '自有工厂',
      subtitle: 'OEM / ODM 定制'
    }
  ]
};

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('=== Zhiheng Renderer Phase 2C Visual Packaging V0.1 测试 ===\n');

  // 1. 验证素材
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
  console.log(`   ✓ ${VOICE_ASSET_ID}: 测试 voice`);

  // 2. 创建 Renderer
  console.log('\n2. 创建 ZhihengRenderer（正式模式）...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2c-packaging-test')
  });

  // 3. 注册 task assets
  console.log('\n3. 注册 task assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  renderer.registerTaskAsset(VOICE_ASSET_ID, VOICE_FILE, { originalName: 'test-voice-15s.m4a' });
  console.log('   ✓ 6 个 asset 已注册');

  // 4. Capabilities
  console.log('\n4. Renderer Capabilities:');
  const caps = renderer.getCapabilities();
  console.log(`   overlayTrack: ${caps.overlayTrack}`);
  console.log(`   hdrToneMap: ${caps.hdrToneMap}`);
  console.log(`   assSubtitles: ${caps.assSubtitles}`);
  console.log(`   titleTrack: ${caps.titleTrack}`);

  // 5. Timeline 验证
  console.log('\n5. Timeline 验证...');
  const validateResult = renderer.validate(TEST_TIMELINE);
  console.log(`   valid: ${validateResult.valid}`);
  console.log(`   errors: ${validateResult.errors.length}`);
  if (validateResult.errors.length > 0) {
    for (const err of validateResult.errors) {
      console.log(`     - [${err.field}] ${err.message}`);
    }
  }
  console.log(`   warnings: ${validateResult.warnings.length}`);
  if (validateResult.warnings.length > 0) {
    for (const w of validateResult.warnings) {
      console.log(`     - ${w}`);
    }
  }

  if (!validateResult.valid) {
    throw new Error('Timeline 验证失败，终止渲染');
  }

  // 6. 执行渲染
  console.log('\n6. 执行渲染（preprocess + graphic + overlay + ASS + compose）...');
  const renderResult = await renderer.render(TEST_TIMELINE);

  console.log('\n=== 渲染结果 ===');
  console.log(`success: ${renderResult.success}`);
  console.log(`durationMs: ${renderResult.durationMs} (${(renderResult.durationMs / 1000).toFixed(2)}s)`);
  console.log(`outputPath: ${renderResult.outputPath}`);
  console.log(`errors: ${renderResult.errors.length}`);
  if (renderResult.errors.length > 0) {
    for (const err of renderResult.errors) {
      console.log(`  - [${err.stage}] ${err.message}`);
    }
  }
  console.log(`warnings: ${renderResult.warnings.length}`);
  if (renderResult.warnings.length > 0) {
    for (const w of renderResult.warnings) {
      console.log(`  - ${w}`);
    }
  }
  console.log(`logPath: ${renderResult.logPath}`);

  if (!renderResult.success) {
    throw new Error('渲染失败');
  }

  // 7. 输出文件信息
  const outputPath = renderResult.outputPath!;
  const fileSize = fs.statSync(outputPath).size;
  console.log('\n=== final-packaged.mp4 ===');
  console.log(`路径: ${outputPath}`);
  console.log(`大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  // 8. 工作目录文件
  const workDir = path.dirname(outputPath);
  console.log('\n=== 工作目录文件 ===');
  const files = fs.readdirSync(workDir, { recursive: true });
  for (const f of files) {
    const fullPath = path.join(workDir, f.toString());
    if (fs.statSync(fullPath).isFile()) {
      const size = fs.statSync(fullPath).size;
      console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
    }
  }

  console.log('\n✓ Phase 2C Visual Packaging V0.1 测试完成！');
  console.log('  请人工检查 final-packaged.mp4：包装元素、字幕避让、层级、曝光、方向。');
  console.log('  注意：所有样式均为 provisional，需要人工看片确认后调整。');
}

main().catch((err) => {
  console.error('\n✗ 测试失败:', err.message);
  process.exit(1);
});
