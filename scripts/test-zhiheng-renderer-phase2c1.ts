/**
 * Phase 2C.1 Visual Packaging 视觉重设计测试脚本。
 *
 * 与 Phase 2C V0.1 的区别：
 * - 统一视觉语言：深灰黑半透明背景 + 暖黄小面积强调，不使用蓝白描边/高饱和大色块
 * - title_panel 不横跨，只包住标题区域（520-560px 宽）
 * - badge 缩小 30-40%，深色半透明背景 + 白字
 * - info_card 明显缩小（520×120），更轻更薄
 * - hook title 更小（52px）、左对齐、白色、靠近顶部安全区
 * - emphasis title 删除蓝白描边，改为白色 + 黑色描边
 * - 一屏最多 2 类主要包装元素（字幕 + 标题/角标/信息卡）
 *
 * 包装时间安排：
 * 0-2.5s：  hook title（+ panel） + subtitle
 * 2.5-5s：  badge + subtitle
 * 5-7s：    只 subtitle
 * 7-9.5s：  emphasis title（+ panel） + subtitle
 * 9.5-12s： info card + subtitle
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2c1.ts
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
// 固定测试 Timeline V2（Phase 2C.1 视觉重设计）
// ============================================================================

const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2c1-packaging-v2-001',
  taskId: 'phase2c1-packaging-v2-001',
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
    // 0-2.5s：hook title（左上角，白色，52px）
    { id: 'title_hook_001', start: 0, duration: 2.5, text: '浩明饮品', styleId: 'title.hook', layer: 2 },
    // 7-9.5s：emphasis title（左中，白色，48px，删除蓝白描边）
    { id: 'title_emphasis_001', start: 7.0, duration: 2.5, text: 'OEM/ODM 定制', styleId: 'title.emphasis', layer: 2 },
    // 2.5-5s：badge 文字（右上角，白色，24px，深色半透明背景）
    { id: 'title_badge_001', start: 2.5, duration: 2.5, text: 'OEM/ODM', styleId: 'title.badge', layer: 3 },
    // 9.5-12s：info card 文字（左下角，字幕避让）
    { id: 'title_card_title_001', start: 9.5, duration: 2.5, text: '自有工厂', styleId: 'title.card_title', layer: 3 },
    { id: 'title_card_subtitle_001', start: 9.5, duration: 2.5, text: 'OEM / ODM 定制', styleId: 'title.card_subtitle', layer: 3 }
  ],
  // overlayTrack：背景 graphic（不包含文字，文字走 titleTrack + ASS）
  overlayTrack: [
    // 0-2.5s：hook title 底板（左上角，520×90，不横跨）
    {
      id: 'ov_panel_hook',
      type: 'title_panel',
      styleId: 'panel.hook',
      anchor: 'top_left',
      start: 0,
      duration: 2.5
    },
    // 7-9.5s：emphasis title 底板（左中，560×80，不压主体）
    {
      id: 'ov_panel_emphasis',
      type: 'title_panel',
      styleId: 'panel.default',
      anchor: 'center_left',
      start: 7.0,
      duration: 2.5
    },
    // 2.5-5s：badge 背景（右上角，160×48，深色半透明）
    {
      id: 'ov_badge_oem',
      type: 'badge',
      styleId: 'badge.oem',
      anchor: 'top_right',
      start: 2.5,
      duration: 2.5,
      text: 'OEM/ODM'
    },
    // 9.5-12s：info card 背景（左下角，520×120，字幕避让）
    {
      id: 'ov_card_factory',
      type: 'info_card',
      styleId: 'card.info',
      anchor: 'bottom_left',
      start: 9.5,
      duration: 2.5,
      text: '自有工厂',
      subtitle: 'OEM / ODM 定制'
    }
  ]
};

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('=== Zhiheng Renderer Phase 2C.1 Visual Packaging V2 测试 ===\n');

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
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2c1-packaging-test')
  });

  // 3. 注册 task assets
  console.log('\n3. 注册 task assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  renderer.registerTaskAsset(VOICE_ASSET_ID, VOICE_FILE, { originalName: 'test-voice-15s.m4a' });
  console.log('   ✓ 6 个 asset 已注册');

  // 4. Timeline 验证
  console.log('\n4. Timeline 验证...');
  const validateResult = renderer.validate(TEST_TIMELINE);
  console.log(`   valid: ${validateResult.valid}`);
  console.log(`   errors: ${validateResult.errors.length}`);
  if (validateResult.errors.length > 0) {
    for (const err of validateResult.errors) {
      console.log(`     - [${err.field}] ${err.message}`);
    }
  }
  console.log(`   warnings: ${validateResult.warnings.length}`);

  if (!validateResult.valid) {
    throw new Error('Timeline 验证失败，终止渲染');
  }

  // 5. 执行渲染
  console.log('\n5. 执行渲染（preprocess + graphic + overlay + ASS + compose）...');
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

  if (!renderResult.success) {
    throw new Error('渲染失败');
  }

  // 6. 输出文件信息
  const outputPath = renderResult.outputPath!;
  const fileSize = fs.statSync(outputPath).size;
  console.log('\n=== final-packaged-v2.mp4 ===');
  console.log(`路径: ${outputPath}`);
  console.log(`大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  // 7. 抽帧验收
  console.log('\n6. 抽帧验收...');
  const ffmpeg = 'D:\\知衡智企\\bin\\ffmpeg\\ffmpeg.exe';
  const workDir = path.dirname(outputPath);
  const framesDir = path.join(workDir, 'frames');
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  const frameTimes = [
    { t: 0.8, name: 'v2_hook_t0.8.jpg', desc: 'hook title + subtitle' },
    { t: 3.5, name: 'v2_badge_t3.5.jpg', desc: 'badge + subtitle' },
    { t: 5.5, name: 'v2_subonly_t5.5.jpg', desc: '纯字幕' },
    { t: 8.0, name: 'v2_emphasis_t8.0.jpg', desc: 'emphasis title + subtitle' },
    { t: 10.5, name: 'v2_card_t10.5.jpg', desc: 'info card + subtitle' }
  ];

  for (const frame of frameTimes) {
    const outPath = path.join(framesDir, frame.name);
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', frame.t.toString(),
      '-i', outputPath,
      '-frames:v', '1',
      '-vf', 'scale=540:960',
      outPath
    ];
    const { execFileSync } = await import('child_process');
    try {
      execFileSync(ffmpeg, args, { stdio: 'pipe' });
      console.log(`   ✓ ${frame.name} (t=${frame.t}s) — ${frame.desc}`);
    } catch (e: any) {
      console.log(`   ✗ ${frame.name} 抽帧失败: ${e.message}`);
    }
  }

  console.log('\n✓ Phase 2C.1 Visual Packaging V2 测试完成！');
  console.log('  请人工检查 final-packaged-v2.mp4 和 5 张验收帧。');
  console.log('  所有样式参数均为 provisional，需人工看片确认后调整。');
}

main().catch((err) => {
  console.error('\n✗ 测试失败:', err.message);
  process.exit(1);
});
