/**
 * Phase 2D 素材库集成测试：20秒完整包装视频
 *
 * 测试内容：
 * - 贴纸 overlay（sticker 类型，从贴纸库 assetId 解析）
 * - BGM 背景音乐（bgmTrack，从音效库 assetId 解析，循环+淡入淡出）
 * - SFX 音效（sfxTrack，从音效库 assetId 解析，时间点插入）
 * - 普通字幕 + 关键词高亮
 * - 标题 + 信息卡
 * - SDR + HLG 混合素材
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2d-packaging.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

const BASE = 'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解';

// 全部使用20秒以下的非成片素材
const TEST_ASSETS = [
  { assetId: 'mat_003_a', path: path.join(BASE, '03_样片003', '0c8592062bbcc2a0cd318f29d9af6d67.mp4') },
  { assetId: 'mat_004_hlg', path: path.join(BASE, '04_样片004', 'afeae50bd4f303d9739d0626b1b663e7_raw.mp4') },
  { assetId: 'mat_004_raw1', path: path.join(BASE, '04_样片004', '39415880e48fee6659623ec7ba0d5333_raw.mp4') },
  { assetId: 'mat_005_b', path: path.join(BASE, '05_样片005', 'e181f7565742077486d4d76a2adf30b9.mp4') },
  { assetId: 'mat_003_b', path: path.join(BASE, '03_样片003', '60e082f7a298891b72397399443aac20.mp4') },
  { assetId: 'mat_004_sdr', path: path.join(BASE, '04_样片004', 'ddb67fecf27d89093298aa8f8c6fab4f.mp4') },
  { assetId: 'mat_005_c', path: path.join(BASE, '05_样片005', 'e111f4de876de7071415b93b7e996b02.mp4') }
];

// 20秒，7段，每段约2.8-3秒
const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2d-packaging-20s-001',
  taskId: 'phase2d-packaging-20s-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    { assetRef: { type: 'task_asset', assetId: 'mat_003_a' }, sourceStart: 0.5, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_hlg' }, sourceStart: 2.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_raw1' }, sourceStart: 1.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_b' }, sourceStart: 1.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_003_b' }, sourceStart: 0.5, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_sdr' }, sourceStart: 1.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_c' }, sourceStart: 0.5, duration: 3.2, transition: 'hard_cut' }
  ],
  // 无配音（voiceTrack为空，素材静音）
  voiceTrack: [],
  subtitleTrack: [
    { id: 'sub_001', start: 0, duration: 2.8, text: '饮品代工怎么选', styleId: 'subtitle.default', highlights: [{ keyword: '代工' }] },
    { id: 'sub_002', start: 2.8, duration: 2.8, text: '看工厂看设备看工艺', styleId: 'subtitle.default', highlights: [{ keyword: '工厂' }, { keyword: '设备' }] },
    { id: 'sub_003', start: 5.6, duration: 2.8, text: '我们有自己的生产线', styleId: 'subtitle.default', highlights: [{ keyword: '生产线' }] },
    { id: 'sub_004', start: 8.4, duration: 2.8, text: '从原料到成品全程把控', styleId: 'subtitle.default', highlights: [{ keyword: '全程把控' }] },
    { id: 'sub_005', start: 11.2, duration: 2.8, text: '支持多种饮品品类', styleId: 'subtitle.default', highlights: [] },
    { id: 'sub_006', start: 14.0, duration: 2.8, text: 'OEM和ODM都可以做', styleId: 'subtitle.default', highlights: [{ keyword: 'OEM' }, { keyword: 'ODM' }] },
    { id: 'sub_007', start: 16.8, duration: 3.2, text: '欢迎来厂考察交流', styleId: 'subtitle.default', highlights: [] }
  ],
  titleTrack: [
    // 开场大标题
    { id: 'title_hook_001', start: 0, duration: 2.8, text: '饮品代工怎么选', styleId: 'title.hook', layer: 3 },
    // 中段强调
    { id: 'title_emphasis_001', start: 14.0, duration: 2.8, text: 'OEM / ODM', styleId: 'title.hook', layer: 3 }
  ],
  overlayTrack: [
    // 开场标题左侧黄色accent bar
    { id: 'ov_accent_hook', type: 'title_panel', styleId: 'panel.accent_bar', anchor: 'center_left', start: 0, duration: 2.8 },
    // 贴纸：黄色星星（开场标题装饰）
    { id: 'ov_sticker_star', type: 'sticker', assetRef: { type: 'library_asset', assetId: 'sticker_star_yellow' }, styleId: 'sticker.default', anchor: 'top_right', start: 0.3, duration: 2.0, opacity: 0.9 },
    // 信息卡底板
    { id: 'ov_card_001', type: 'info_card', styleId: 'card.info', anchor: 'center_left', start: 11.2, duration: 2.8, text: '植物饮料\n养生饮料\n功能性饮料', subtitle: '' },
    // 贴纸：向下箭头（OEM/ODM强调时）
    { id: 'ov_sticker_arrow', type: 'sticker', assetRef: { type: 'library_asset', assetId: 'sticker_arrow_down_yellow' }, styleId: 'sticker.default', anchor: 'top_center', start: 14.0, duration: 2.5, opacity: 0.85 },
    // 强调标题左侧黄色accent bar
    { id: 'ov_accent_emphasis', type: 'title_panel', styleId: 'panel.accent_bar', anchor: 'center_left', start: 14.0, duration: 2.8 }
  ],
  // BGM 背景音乐（循环播放，音量0.25，淡入淡出）
  bgmTrack: [
    { id: 'bgm_001', assetRef: { type: 'library_asset', assetId: 'bgm_corporate_light_01' }, start: 0, duration: 20, volume: 0.25, loop: true }
  ],
  // SFX 音效（时间点插入）
  sfxTrack: [
    // 开场标题出现时的提示音
    { id: 'sfx_001', assetRef: { type: 'library_asset', assetId: 'sfx_ding_clean_01' }, start: 0.1, duration: 1.5, volume: 0.6 },
    // 信息卡出现时的弹出音
    { id: 'sfx_002', assetRef: { type: 'library_asset', assetId: 'sfx_notification_pop_03' }, start: 11.2, duration: 1.0, volume: 0.5 },
    // OEM/ODM强调时的提示音
    { id: 'sfx_003', assetRef: { type: 'library_asset', assetId: 'sfx_chime_bell_04' }, start: 14.0, duration: 1.5, volume: 0.5 }
  ]
};

async function main(): Promise<void> {
  console.log('=== Phase2D 素材库集成测试：20秒完整包装视频 ===\n');

  console.log('1. 验证素材（全部<20秒，非成片）...');
  for (const asset of TEST_ASSETS) {
    if (!fs.existsSync(asset.path)) throw new Error('素材不存在: ' + asset.path);
  }
  console.log('   ✓ ' + TEST_ASSETS.length + ' 个素材已验证');

  console.log('\n2. 创建 ZhihengRenderer...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2d-packaging-20s')
  });

  console.log('\n3. 注册 video assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  console.log('   ✓ ' + TEST_ASSETS.length + ' 个 video asset 已注册');
  console.log('   （贴纸/BGM/SFX 通过 PackagingAssetResolver 从素材库 index.json 自动解析）');

  console.log('\n4. Timeline 验证...');
  const v = renderer.validate(TEST_TIMELINE);
  console.log('   valid: ' + v.valid + ', errors: ' + v.errors.length + ', warnings: ' + v.warnings.length);
  if (v.warnings.length > 0) v.warnings.forEach(function(w: any) { console.log('   warning: ' + w.code + ' - ' + w.message); });
  if (v.errors.length > 0) v.errors.forEach(function(e: any) { console.log('   error: ' + e.code + ' - ' + e.message); });
  if (!v.valid) throw new Error('Timeline 验证失败');

  console.log('\n5. Capability 声明...');
  const caps = renderer.getCapabilities();
  console.log('   overlayTrack: ' + caps.overlayTrack);
  console.log('   bgmTrack: ' + caps.bgmTrack);
  console.log('   sfxTrack: ' + caps.sfxTrack);
  console.log('   hdrToneMap: ' + caps.hdrToneMap);
  console.log('   assSubtitles: ' + caps.assSubtitles);
  console.log('   keywordHighlight: ' + caps.keywordHighlight);
  console.log('   titleTrack: ' + caps.titleTrack);

  console.log('\n6. 执行渲染（preprocess + 贴纸overlay + BGM循环 + SFX时间点 + ASS字幕 + compose）...');
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

  // 列出输出目录内容
  const outDir = path.dirname(out);
  console.log('\n=== 输出目录内容 ===');
  fs.readdirSync(outDir).forEach(function(f) {
    const p = path.join(outDir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      const count = fs.readdirSync(p).length;
      console.log('  ' + f + '/ (' + count + ' 个文件)');
    } else {
      console.log('  ' + f + ' (' + (s.size / 1024).toFixed(1) + ' KB)');
    }
  });

  console.log('\n=== 测试完成 ===');
  console.log('请人工检查：');
  console.log('  1. 贴纸是否正确显示（黄色星星、向下箭头）');
  console.log('  2. BGM 是否循环播放且音量合适');
  console.log('  3. SFX 是否在正确时间点响起（开场、信息卡、OEM强调）');
  console.log('  4. 字幕关键词是否高亮');
  console.log('  5. HLG 素材曝光是否正常');
  console.log('  6. 方向是否正确，无拉伸');
}

main().catch(function(err) {
  console.error('\n=== 测试失败 ===');
  console.error(err);
  process.exit(1);
});
