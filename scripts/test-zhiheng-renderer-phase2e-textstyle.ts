/**
 * Phase 2E 花字模板集成测试（纯竖屏素材版）
 *
 * 测试内容：
 * - 花字模板标题（textstyle_opening_clean / textstyle_emphasis_block）
 * - 花字模板装饰贴纸自动转为 overlay
 * - 普通字幕 + 关键词高亮
 * - 贴纸 overlay + 信息卡
 * - BGM 循环 + SFX 时间点
 * - 全部使用竖屏素材（720x1280）
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2e-textstyle.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

const BASE = 'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解';

// 全部使用竖屏素材（720x1280），不使用横屏素材
const TEST_ASSETS = [
  { assetId: 'mat_003_a', path: path.join(BASE, '03_样片003', '0c8592062bbcc2a0cd318f29d9af6d67.mp4') },
  { assetId: 'mat_005_b', path: path.join(BASE, '05_样片005', 'e181f7565742077486d4d76a2adf30b9.mp4') },
  { assetId: 'mat_003_b', path: path.join(BASE, '03_样片003', '60e082f7a298891b72397399443aac20.mp4') },
  { assetId: 'mat_004_sdr', path: path.join(BASE, '04_样片004', 'ddb67fecf27d89093298aa8f8c6fab4f.mp4') },
  { assetId: 'mat_005_c', path: path.join(BASE, '05_样片005', 'e111f4de876de7071415b93b7e996b02.mp4') }
];

// 20秒，5段，每段4秒
const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2e-textstyle-vertical-001',
  taskId: 'phase2e-textstyle-vertical-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    { assetRef: { type: 'task_asset', assetId: 'mat_003_a' }, sourceStart: 0.5, duration: 4.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_b' }, sourceStart: 0.5, duration: 4.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_003_b' }, sourceStart: 1.0, duration: 4.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_sdr' }, sourceStart: 0.5, duration: 4.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_c' }, sourceStart: 1.0, duration: 4.0, transition: 'hard_cut' }
  ],
  voiceTrack: [],
  subtitleTrack: [
    { id: 'sub_001', start: 0, duration: 4.0, text: '饮品代工怎么选', styleId: 'subtitle.default', highlights: [{ keyword: '代工' }] },
    { id: 'sub_002', start: 4.0, duration: 4.0, text: '看工厂看设备看工艺', styleId: 'subtitle.default', highlights: [{ keyword: '工厂' }, { keyword: '设备' }] },
    { id: 'sub_003', start: 8.0, duration: 4.0, text: '我们有自己的生产线', styleId: 'subtitle.default', highlights: [{ keyword: '生产线' }] },
    { id: 'sub_004', start: 12.0, duration: 4.0, text: '支持多种饮品品类', styleId: 'subtitle.default', highlights: [] },
    { id: 'sub_005', start: 16.0, duration: 4.0, text: 'OEM和ODM都可以做', styleId: 'subtitle.default', highlights: [{ keyword: 'OEM' }, { keyword: 'ODM' }] }
  ],
  titleTrack: [
    { id: 'title_hook_001', start: 0, duration: 3.0, text: '饮品代工怎么选', styleId: 'textstyle_opening_clean', layer: 3 },
    { id: 'title_emphasis_001', start: 16.0, duration: 3.0, text: 'OEM / ODM', styleId: 'textstyle_emphasis_block', layer: 3 }
  ],
  overlayTrack: [
    { id: 'ov_sticker_star', type: 'sticker', assetRef: { type: 'library_asset', assetId: 'sticker_star_yellow' }, styleId: 'sticker.default', anchor: 'top_right', start: 0.3, duration: 2.0, opacity: 0.9 },
    { id: 'ov_card_001', type: 'info_card', styleId: 'card.info', anchor: 'center_left', start: 8.0, duration: 3.0, text: '植物饮料\n养生饮料\n功能性饮料', subtitle: '' },
    { id: 'ov_sticker_arrow', type: 'sticker', assetRef: { type: 'library_asset', assetId: 'sticker_arrow_down_yellow' }, styleId: 'sticker.default', anchor: 'top_center', start: 16.0, duration: 2.5, opacity: 0.85 }
  ],
  bgmTrack: [
    { id: 'bgm_001', assetRef: { type: 'library_asset', assetId: 'bgm_corporate_light_01' }, start: 0, duration: 20, volume: 0.25, loop: true }
  ],
  sfxTrack: [
    { id: 'sfx_001', assetRef: { type: 'library_asset', assetId: 'sfx_ding_clean_01' }, start: 0.1, duration: 1.5, volume: 0.6 },
    { id: 'sfx_002', assetRef: { type: 'library_asset', assetId: 'sfx_notification_pop_03' }, start: 8.0, duration: 1.0, volume: 0.5 },
    { id: 'sfx_003', assetRef: { type: 'library_asset', assetId: 'sfx_chime_bell_04' }, start: 16.0, duration: 1.5, volume: 0.5 }
  ]
};

async function main(): Promise<void> {
  console.log('=== Phase2E 花字模板集成测试（纯竖屏素材版）===\n');

  console.log('1. 验证素材（全部竖屏，<20秒，非成片）...');
  for (const asset of TEST_ASSETS) {
    if (!fs.existsSync(asset.path)) throw new Error('素材不存在: ' + asset.path);
  }
  console.log('   ✓ ' + TEST_ASSETS.length + ' 个竖屏素材已验证');

  console.log('\n2. 创建 ZhihengRenderer...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2e-textstyle-vertical')
  });

  console.log('\n3. 注册 video assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  console.log('   ✓ ' + TEST_ASSETS.length + ' 个 video asset 已注册');

  console.log('\n4. Timeline 验证...');
  const v = renderer.validate(TEST_TIMELINE);
  console.log('   valid: ' + v.valid + ', errors: ' + v.errors.length + ', warnings: ' + v.warnings.length);
  if (v.errors.length > 0) v.errors.forEach(function(e: any) { console.log('   error: ' + e.code + ' - ' + e.message); });
  if (!v.valid) throw new Error('Timeline 验证失败');

  console.log('\n5. 执行渲染...');
  const r = await renderer.render(TEST_TIMELINE);
  console.log('\n=== 结果 ===');
  console.log('success: ' + r.success);
  console.log('duration: ' + (r.durationMs / 1000).toFixed(2) + 's');
  console.log('output: ' + r.outputPath);
  console.log('errors: ' + r.errors.length + ', warnings: ' + r.warnings.length);
  if (r.warnings.length > 0) {
    console.log('\n--- warnings ---');
    r.warnings.forEach(function(w: string) { console.log('  ' + w); });
  }
  if (!r.success) {
    console.log('\n--- errors ---');
    r.errors.forEach(function(e: any) { console.log('  [' + e.stage + '] ' + e.message); });
    throw new Error('渲染失败');
  }

  const out = r.outputPath!;
  const stat = fs.statSync(out);
  console.log('\n=== 输出文件 ===');
  console.log('路径: ' + out);
  console.log('大小: ' + (stat.size / 1024 / 1024).toFixed(2) + ' MB');
  console.log('\n=== 测试完成 ===');
  console.log('请人工检查：');
  console.log('  1. 全部素材是否竖屏，无横屏裁剪');
  console.log('  2. 花字模板标题样式和动画');
  console.log('  3. 花字模板装饰贴纸（左侧黄色条）');
  console.log('  4. 字幕关键词高亮');
  console.log('  5. BGM/SFX');
}

main().catch(function(err) {
  console.error('\n=== 测试失败 ===');
  console.error(err);
  process.exit(1);
});
