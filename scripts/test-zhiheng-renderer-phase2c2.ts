/**
 * Phase 2C.2 Visual Packaging 优化版测试脚本。
 *
 * 优化点：
 * 1. 多样化素材（样片001/003/004/005，不再只用样片004的三个）
 * 2. 素材静音（preprocess -an 保证 source audio 不混入）
 * 3. 底板尺寸缩小（panel 400x70, badge 130x40, card 440x100）
 * 4. 左侧黄色 accent bar（装饰条，增加设计感）
 * 5. 文字位置微调到底板内
 * 6. 一屏最多 2 类包装元素
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2c2.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

// ============================================================================
// 多样化素材配置（来自不同样片目录）
// ============================================================================

const BASE = 'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解';
const VOICE_FILE = 'D:\\知衡智企\\tmp\\test-assets\\test-voice-15s.m4a';

const TEST_ASSETS = [
  // 样片001：HEVC 1080x1920 60fps SDR 竖屏高清
  { assetId: 'mat_001_sdr_hd', path: path.join(BASE, '01_样片001', 'c159c1453faac9e48198282b9d00a5a2_raw.mp4'), desc: '样片001 SDR 1080x1920 60fps' },
  // 样片004：HLG 1920x1080 rotation=-90（验证 HDR tone mapping）
  { assetId: 'mat_002_hlg', path: path.join(BASE, '04_样片004', 'afeae50bd4f303d9739d0626b1b663e7_raw.mp4'), desc: '样片004 HLG 1920x1080 rotation' },
  // 样片003：H264 720x1280 30fps SDR 竖屏
  { assetId: 'mat_003_sdr_720', path: path.join(BASE, '03_样片003', '0c8592062bbcc2a0cd318f29d9af6d67.mp4'), desc: '样片003 SDR 720x1280' },
  // 样片005：H264 720x1280 30fps SDR 竖屏（时长53秒）
  { assetId: 'mat_004_sdr_long', path: path.join(BASE, '05_样片005', '290f1d3564a253f6fd95c3002e11eda8.mp4'), desc: '样片005 SDR 720x1280 长素材' },
  // 样片005：H264 720x1280 30fps SDR 竖屏
  { assetId: 'mat_005_sdr', path: path.join(BASE, '05_样片005', 'e181f7565742077486d4d76a2adf30b9.mp4'), desc: '样片005 SDR 720x1280' }
];

const VOICE_ASSET_ID = 'test_voice_001';

// ============================================================================
// 固定测试 Timeline V3（优化包装）
// ============================================================================

const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2c2-packaging-optimized-001',
  taskId: 'phase2c2-packaging-optimized-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    { assetRef: { type: 'task_asset', assetId: 'mat_001_sdr_hd' }, sourceStart: 1.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_002_hlg' }, sourceStart: 3.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_003_sdr_720' }, sourceStart: 0.5, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_sdr_long' }, sourceStart: 5.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_sdr' }, sourceStart: 1.0, duration: 2.4, transition: 'hard_cut' }
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
    // 7-9.5s：emphasis title（左中，白色，48px）
    { id: 'title_emphasis_001', start: 7.0, duration: 2.5, text: 'OEM/ODM 定制', styleId: 'title.emphasis', layer: 2 },
    // 2.5-5s：badge 文字（右上角，白色，24px）
    { id: 'title_badge_001', start: 2.5, duration: 2.5, text: 'OEM/ODM', styleId: 'title.badge', layer: 3 },
    // 9.5-12s：info card 文字（左下角，字幕避让）
    { id: 'title_card_title_001', start: 9.5, duration: 2.5, text: '自有工厂', styleId: 'title.card_title', layer: 3 },
    { id: 'title_card_subtitle_001', start: 9.5, duration: 2.5, text: 'OEM / ODM 定制', styleId: 'title.card_subtitle', layer: 3 }
  ],
  // overlayTrack：背景 graphic + accent bar（优化版）
  overlayTrack: [
    // === 0-2.5s：hook title 包装 ===
    // 底板（缩小后 380x72，top_left）
    {
      id: 'ov_panel_hook',
      type: 'title_panel',
      styleId: 'panel.hook',
      anchor: 'top_left',
      start: 0,
      duration: 2.5
    },
    // 左侧黄色 accent bar（4x50，紧贴底板左侧）
    {
      id: 'ov_accent_hook',
      type: 'title_panel',
      styleId: 'panel.accent_bar',
      anchor: 'top_left',
      start: 0,
      duration: 2.5
    },

    // === 2.5-5s：badge 包装 ===
    // 底板（缩小后 130x40，top_right）
    {
      id: 'ov_badge_oem',
      type: 'badge',
      styleId: 'badge.oem',
      anchor: 'top_right',
      start: 2.5,
      duration: 2.5,
      text: 'OEM/ODM'
    },
    // 左侧黄色 accent bar（4x20，紧贴 badge 左侧）
    {
      id: 'ov_accent_badge',
      type: 'badge',
      styleId: 'badge.accent',
      anchor: 'top_right',
      start: 2.5,
      duration: 2.5
    },

    // === 7-9.5s：emphasis title 包装 ===
    // 底板（缩小后 400x70，center_left）
    {
      id: 'ov_panel_emphasis',
      type: 'title_panel',
      styleId: 'panel.default',
      anchor: 'center_left',
      start: 7.0,
      duration: 2.5
    },
    // 左侧黄色 accent bar（4x50，紧贴底板左侧）
    {
      id: 'ov_accent_emphasis',
      type: 'title_panel',
      styleId: 'panel.accent_bar',
      anchor: 'center_left',
      start: 7.0,
      duration: 2.5
    },

    // === 9.5-12s：info card 包装 ===
    // 底板（缩小后 440x100，bottom_left，字幕避让）
    {
      id: 'ov_card_factory',
      type: 'info_card',
      styleId: 'card.info',
      anchor: 'bottom_left',
      start: 9.5,
      duration: 2.5,
      text: '自有工厂',
      subtitle: 'OEM / ODM 定制'
    },
    // 左侧黄色 accent bar（4x50，紧贴 card 左侧）
    {
      id: 'ov_accent_card',
      type: 'title_panel',
      styleId: 'panel.accent_bar',
      anchor: 'bottom_left',
      start: 9.5,
      duration: 2.5
    }
  ]
};

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('=== Zhiheng Renderer Phase 2C.2 包装优化版测试 ===\n');

  // 1. 验证素材
  console.log('1. 验证多样化素材...');
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
  console.log('\n2. 创建 ZhihengRenderer（正式模式，素材自动静音）...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2c2-optimized')
  });

  // 3. 注册 task assets
  console.log('\n3. 注册 task assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  renderer.registerTaskAsset(VOICE_ASSET_ID, VOICE_FILE, { originalName: 'test-voice-15s.m4a' });
  console.log(`   ✓ ${TEST_ASSETS.length + 1} 个 asset 已注册`);

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
  console.log('\n5. 执行渲染（preprocess 自动静音 + graphic + accent bar + overlay + ASS + compose）...');
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
  console.log('\n=== final-packaged-optimized.mp4 ===');
  console.log(`路径: ${outputPath}`);
  console.log(`大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  // 7. 抽帧验收
  console.log('\n6. 抽帧验收...');
  const ffmpeg = 'D:\\知衡智企\\bin\\ffmpeg\\ffmpeg.exe';
  const workDir = path.dirname(outputPath);
  const framesDir = path.join(workDir, 'frames');
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  const frameTimes = [
    { t: 0.8, name: 'opt_hook_t0.8.jpg', desc: 'hook title + accent bar + subtitle' },
    { t: 3.5, name: 'opt_badge_t3.5.jpg', desc: 'badge + accent bar + subtitle' },
    { t: 5.5, name: 'opt_subonly_t5.5.jpg', desc: '纯字幕' },
    { t: 8.0, name: 'opt_emphasis_t8.0.jpg', desc: 'emphasis title + accent bar + subtitle' },
    { t: 10.5, name: 'opt_card_t10.5.jpg', desc: 'info card + accent bar + subtitle' }
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

  console.log('\n✓ Phase 2C.2 包装优化版测试完成！');
  console.log('  素材来源：样片001/003/004/005（多样化，不再只用三个）');
  console.log('  素材静音：preprocess -an 保证 source audio 不混入');
  console.log('  包装优化：缩小底板 + 左侧黄色 accent bar + 文字位置微调');
  console.log('  请人工检查 final-packaged-optimized.mp4 和 5 张验收帧。');
}

main().catch((err) => {
  console.error('\n✗ 测试失败:', err.message);
  process.exit(1);
});
