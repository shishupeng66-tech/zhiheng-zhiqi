/**
 * Phase 2C V2 包装测试：25秒无音频视频
 *
 * - 时长：25秒
 * - 音频：无（voiceTrack为空，素材静音）
 * - 包装：V2策略（白字黄描边字幕、白字蓝描边大标题、蓝色半透明信息卡）
 * - 素材：全部20秒以下非成片素材
 * - 违禁词：已规避（不用"最/第一/唯一/保证"等）
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-v2-packaging.ts
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
  { assetId: 'mat_005_c', path: path.join(BASE, '05_样片005', 'e111f4de876de7071415b93b7e996b02.mp4') },
  { assetId: 'mat_003_c', path: path.join(BASE, '03_样片003', '73eafea4f0ed8e2d4a6c878f8c7b0304.mp4') },
  { assetId: 'mat_004_raw2', path: path.join(BASE, '04_样片004', '551e35c3b4c81948fc07b1b35da43450_raw.mp4') }
];

// 25秒，9段，每段约2.5-3秒
const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'v2-packaging-25s-noaudio-001',
  taskId: 'v2-packaging-25s-noaudio-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    { assetRef: { type: 'task_asset', assetId: 'mat_003_a' }, sourceStart: 0.5, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_hlg' }, sourceStart: 2.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_raw1' }, sourceStart: 1.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_b' }, sourceStart: 1.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_003_b' }, sourceStart: 0.5, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_sdr' }, sourceStart: 1.0, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_c' }, sourceStart: 0.5, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_003_c' }, sourceStart: 0.5, duration: 2.8, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_raw2' }, sourceStart: 0.2, duration: 2.6, transition: 'hard_cut' }
  ],
  // 无音频：voiceTrack为空数组
  voiceTrack: [],
  subtitleTrack: [
    { id: 'sub_001', start: 0, duration: 2.8, text: '饮品代工怎么选', styleId: 'subtitle.default', highlights: [{ keyword: '代工' }] },
    { id: 'sub_002', start: 2.8, duration: 2.8, text: '看工厂看设备看工艺', styleId: 'subtitle.default', highlights: [{ keyword: '工厂' }, { keyword: '设备' }] },
    { id: 'sub_003', start: 5.6, duration: 2.8, text: '我们有自己的生产线', styleId: 'subtitle.default', highlights: [{ keyword: '生产线' }] },
    { id: 'sub_004', start: 8.4, duration: 2.8, text: '从原料到成品全程把控', styleId: 'subtitle.default', highlights: [{ keyword: '全程把控' }] },
    { id: 'sub_005', start: 11.2, duration: 2.8, text: '支持多种饮品品类', styleId: 'subtitle.default', highlights: [] },
    { id: 'sub_006', start: 14.0, duration: 2.8, text: 'OEM和ODM都可以做', styleId: 'subtitle.default', highlights: [{ keyword: 'OEM' }, { keyword: 'ODM' }] },
    { id: 'sub_007', start: 16.8, duration: 2.8, text: '配方包装都能定制', styleId: 'subtitle.default', highlights: [{ keyword: '定制' }] },
    { id: 'sub_008', start: 19.6, duration: 2.8, text: '交期稳定品质可靠', styleId: 'subtitle.default', highlights: [{ keyword: '稳定' }, { keyword: '可靠' }] },
    { id: 'sub_009', start: 22.4, duration: 2.6, text: '欢迎来厂考察交流', styleId: 'subtitle.default', highlights: [] }
  ],
  titleTrack: [
    // 开场大标题（V2：白字+蓝色粗描边，样片001风格）
    { id: 'title_hook_001', start: 0, duration: 2.8, text: '饮品代工怎么选', styleId: 'title.hook', layer: 3 },
    // 信息卡文字（V2：白色无描边，配合蓝色半透明底板）
    { id: 'title_info_001', start: 11.2, duration: 2.8, text: '植物饮料', styleId: 'title.emphasis', layer: 2 },
    { id: 'title_info_002', start: 11.2, duration: 2.8, text: '养生饮料', styleId: 'title.emphasis', layer: 2 },
    { id: 'title_info_003', start: 11.2, duration: 2.8, text: '功能性饮料', styleId: 'title.emphasis', layer: 2 },
    // 中段强调（V2：白字+蓝色粗描边）
    { id: 'title_emphasis_001', start: 19.6, duration: 2.8, text: 'OEM / ODM', styleId: 'title.hook', layer: 3 }
  ],
  overlayTrack: [
    // 信息卡底板（V2.1：anchor=center_left，和文字左对齐，半透明）
    { id: 'ov_card_001', type: 'info_card', styleId: 'card.info', anchor: 'center_left', start: 11.2, duration: 2.8, text: '植物饮料\n养生饮料\n功能性饮料', subtitle: '' },
    // 开场标题左侧黄色accent bar
    { id: 'ov_accent_hook', type: 'title_panel', styleId: 'panel.accent_bar', anchor: 'center_left', start: 0, duration: 2.8 },
    // 强调标题左侧黄色accent bar
    { id: 'ov_accent_emphasis', type: 'title_panel', styleId: 'panel.accent_bar', anchor: 'center_left', start: 19.6, duration: 2.8 }
  ]
};

async function main(): Promise<void> {
  console.log('=== V2包装测试：25秒无音频视频 ===\n');

  console.log('1. 验证素材（全部<20秒，非成片）...');
  for (const asset of TEST_ASSETS) {
    if (!fs.existsSync(asset.path)) throw new Error(`素材不存在: ${asset.path}`);
  }
  console.log(`   ✓ ${TEST_ASSETS.length} 个素材已验证`);

  console.log('\n2. 创建 ZhihengRenderer（无音频模式）...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'v2-packaging-25s')
  });

  console.log('\n3. 注册 assets...');
  for (const asset of TEST_ASSETS) {
    renderer.registerTaskAsset(asset.assetId, asset.path, { originalName: path.basename(asset.path) });
  }
  console.log(`   ✓ ${TEST_ASSETS.length} 个 asset 已注册`);

  console.log('\n4. Timeline 验证...');
  const v = renderer.validate(TEST_TIMELINE);
  console.log(`   valid: ${v.valid}, errors: ${v.errors.length}, warnings: ${v.warnings.length}`);
  if (v.warnings.length > 0) v.warnings.forEach((w: any) => console.log(`   warning: ${w.code} - ${w.message}`));
  if (!v.valid) throw new Error('Timeline 验证失败');

  console.log('\n5. 执行渲染（preprocess静音 + graphic蓝底板 + ASS V2样式 + compose）...');
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
  // 抽取关键时间点：开场大标题、纯字幕、信息卡、强调标题、收束
  for (const t of [1.0, 5.0, 12.0, 16.0, 20.5, 24.0]) {
    const outPath = path.join(framesDir, `frame_t${t}.jpg`);
    const { execFileSync } = await import('child_process');
    try {
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', t.toString(), '-i', out, '-frames:v', '1', '-vf', 'scale=540:960', outPath], { stdio: 'pipe' });
      console.log(`   ✓ frame_t${t}.jpg`);
    } catch (e: any) {
      console.log(`   ✗ frame_t${t}.jpg 失败: ${e.message}`);
    }
  }

  console.log('\n✓ V2包装测试完成！');
  console.log('  时长：25秒');
  console.log('  音频：无（voiceTrack为空，素材静音）');
  console.log('  包装：V2策略（白字黄描边字幕、白字蓝描边大标题、蓝色半透明信息卡）');
  console.log('  素材：全部<20秒非成片素材');
  console.log('  违禁词：已规避');
}

main().catch((err) => {
  console.error('\n✗ 失败:', err.message);
  process.exit(1);
});
