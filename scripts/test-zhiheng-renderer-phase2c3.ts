/**
 * Phase 2C.3 测试：非成片素材 + 新配音 + 优化包装
 *
 * - 素材：全部使用 20 秒以下的非成片素材（排除样片001/002/005-a 等成片）
 * - 配音：豆包 TTS 云舟音色（临时拼接版，TTS 服务当前不稳定）
 * - 包装：优化版（缩小底板 + accent bar + 通透背景）
 * - 素材静音：preprocess -an 保证 source audio 不混入
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2c3.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

const BASE = 'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解';
const VOICE_FILE = 'D:\\知衡智企\\tmp\\voice-final\\voice-12s.m4a';

// 全部使用 20 秒以下的非成片素材
const TEST_ASSETS = [
  { assetId: 'mat_003_a', path: path.join(BASE, '03_样片003', '0c8592062bbcc2a0cd318f29d9af6d67.mp4'), desc: '样片003-a SDR 7.4s' },
  { assetId: 'mat_004_hlg', path: path.join(BASE, '04_样片004', 'afeae50bd4f303d9739d0626b1b663e7_raw.mp4'), desc: '样片004 HLG 13.6s' },
  { assetId: 'mat_004_raw1', path: path.join(BASE, '04_样片004', '39415880e48fee6659623ec7ba0d5333_raw.mp4'), desc: '样片004-raw1 15.2s' },
  { assetId: 'mat_005_b', path: path.join(BASE, '05_样片005', 'e181f7565742077486d4d76a2adf30b9.mp4'), desc: '样片005-b SDR 10.1s' },
  { assetId: 'mat_003_b', path: path.join(BASE, '03_样片003', '60e082f7a298891b72397399443aac20.mp4'), desc: '样片003-b SDR 10s' }
];

const VOICE_ASSET_ID = 'voice_doubao_yunzhou';

const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2c3-non-chengpin-001',
  taskId: 'phase2c3-non-chengpin-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    { assetRef: { type: 'task_asset', assetId: 'mat_003_a' }, sourceStart: 0.5, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_hlg' }, sourceStart: 3.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_raw1' }, sourceStart: 1.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_b' }, sourceStart: 1.0, duration: 2.4, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_003_b' }, sourceStart: 0.5, duration: 2.4, transition: 'hard_cut' }
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
    { id: 'title_hook_001', start: 0, duration: 2.5, text: '浩明饮品', styleId: 'title.hook', layer: 2 },
    { id: 'title_emphasis_001', start: 7.0, duration: 2.5, text: 'OEM/ODM 定制', styleId: 'title.emphasis', layer: 2 },
    { id: 'title_badge_001', start: 2.5, duration: 2.5, text: 'OEM/ODM', styleId: 'title.badge', layer: 3 },
    { id: 'title_card_title_001', start: 9.5, duration: 2.5, text: '自有工厂', styleId: 'title.card_title', layer: 3 },
    { id: 'title_card_subtitle_001', start: 9.5, duration: 2.5, text: 'OEM / ODM 定制', styleId: 'title.card_subtitle', layer: 3 }
  ],
  overlayTrack: [
    { id: 'ov_panel_hook', type: 'title_panel', styleId: 'panel.hook', anchor: 'top_left', start: 0, duration: 2.5 },
    { id: 'ov_accent_hook', type: 'title_panel', styleId: 'panel.accent_bar', anchor: 'top_left', start: 0, duration: 2.5 },
    { id: 'ov_badge_oem', type: 'badge', styleId: 'badge.oem', anchor: 'top_right', start: 2.5, duration: 2.5, text: 'OEM/ODM' },
    { id: 'ov_accent_badge', type: 'badge', styleId: 'badge.accent', anchor: 'top_right', start: 2.5, duration: 2.5 },
    { id: 'ov_panel_emphasis', type: 'title_panel', styleId: 'panel.default', anchor: 'center_left', start: 7.0, duration: 2.5 },
    { id: 'ov_accent_emphasis', type: 'title_panel', styleId: 'panel.accent_bar', anchor: 'center_left', start: 7.0, duration: 2.5 },
    { id: 'ov_card_factory', type: 'info_card', styleId: 'card.info', anchor: 'bottom_left', start: 9.5, duration: 2.5, text: '自有工厂', subtitle: 'OEM / ODM 定制' },
    { id: 'ov_accent_card', type: 'title_panel', styleId: 'panel.accent_bar', anchor: 'bottom_left', start: 9.5, duration: 2.5 }
  ]
};

async function main(): Promise<void> {
  console.log('=== Phase 2C.3 非成片素材 + 新配音测试 ===\n');

  console.log('1. 验证素材（全部 <20秒，非成片）...');
  for (const asset of TEST_ASSETS) {
    if (!fs.existsSync(asset.path)) throw new Error(`素材不存在: ${asset.path}`);
    console.log(`   ✓ ${asset.assetId}: ${asset.desc}`);
  }
  if (!fs.existsSync(VOICE_FILE)) throw new Error(`配音文件不存在: ${VOICE_FILE}`);
  console.log(`   ✓ ${VOICE_ASSET_ID}: 豆包TTS云舟音色配音（12.36s）`);

  console.log('\n2. 创建 ZhihengRenderer...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2c3-non-chengpin')
  });

  console.log('\n3. 注册 assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  renderer.registerTaskAsset(VOICE_ASSET_ID, VOICE_FILE, { originalName: 'voice-doubao-yunzhou.m4a' });
  console.log(`   ✓ ${TEST_ASSETS.length + 1} 个 asset 已注册`);

  console.log('\n4. Timeline 验证...');
  const v = renderer.validate(TEST_TIMELINE);
  console.log(`   valid: ${v.valid}, errors: ${v.errors.length}, warnings: ${v.warnings.length}`);
  if (!v.valid) throw new Error('Timeline 验证失败');

  console.log('\n5. 执行渲染（preprocess自动静音 + graphic + overlay + ASS + compose）...');
  const r = await renderer.render(TEST_TIMELINE);
  console.log(`\n=== 结果 ===`);
  console.log(`success: ${r.success}`);
  console.log(`duration: ${(r.durationMs / 1000).toFixed(2)}s`);
  console.log(`output: ${r.outputPath}`);
  console.log(`errors: ${r.errors.length}, warnings: ${r.warnings.length}`);
  if (!r.success) throw new Error('渲染失败');

  const out = r.outputPath!;
  console.log(`\n=== final.mp4 ===`);
  console.log(`路径: ${out}`);
  console.log(`大小: ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n6. 抽帧验收...');
  const ffmpeg = 'D:\\知衡智企\\bin\\ffmpeg\\ffmpeg.exe';
  const framesDir = path.join(path.dirname(out), 'frames');
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  for (const t of [0.8, 3.5, 5.5, 8.0, 10.5]) {
    const outPath = path.join(framesDir, `frame_t${t}.jpg`);
    const { execFileSync } = await import('child_process');
    try {
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', t.toString(), '-i', out, '-frames:v', '1', '-vf', 'scale=540:960', outPath], { stdio: 'pipe' });
      console.log(`   ✓ frame_t${t}.jpg`);
    } catch (e: any) {
      console.log(`   ✗ frame_t${t}.jpg 失败: ${e.message}`);
    }
  }

  console.log('\n✓ Phase 2C.3 测试完成！');
  console.log('  素材：全部 <20秒 非成片素材');
  console.log('  配音：豆包TTS云舟音色（临时拼接版，TTS服务当前不稳定）');
  console.log('  包装：优化版（缩小底板 + accent bar + 通透背景）');
  console.log('  素材静音：preprocess -an');
}

main().catch((err) => {
  console.error('\n✗ 失败:', err.message);
  process.exit(1);
});
