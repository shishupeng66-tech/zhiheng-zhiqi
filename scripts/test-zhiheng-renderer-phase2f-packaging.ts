/**
 * Phase 2F 包装能力验证测试：6句完整脚本 + 关键词互动包装法
 *
 * 验证内容：
 * 1. 花字模板graphic decoration（色块背景）- textstyle_emphasis_block
 * 2. 花字模板入场动画（pop_in/shake_in/slide_up）
 * 3. 关键词互动包装法（textstyle_keypoint_top + textstyle_keypoint_bottom 上下排列先后入场）
 * 4. 花字模板入场音效自动匹配（entrySfx字段）
 * 5. 开场标题 + 信息卡 + BGM
 *
 * 脚本：《饮品代工怎么选》6句
 * 注意：当前素材库没有人出镜素材，第1/6句用工厂/产品素材代替
 *
 * 运行：npx tsx scripts/test-zhiheng-renderer-phase2f-packaging.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer/renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';
import { DEFAULT_OUTPUT_PROFILE } from '../src/engines/zhiheng-renderer/types';

const BASE = 'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\知识库\\08_人工样片拆解';

// 全部使用竖屏素材（720x1280）
const TEST_ASSETS = [
  { assetId: 'mat_003_a', path: path.join(BASE, '03_样片003', '0c8592062bbcc2a0cd318f29d9af6d67.mp4') },
  { assetId: 'mat_005_b', path: path.join(BASE, '05_样片005', 'e181f7565742077486d4d76a2adf30b9.mp4') },
  { assetId: 'mat_003_b', path: path.join(BASE, '03_样片003', '60e082f7a298891b72397399443aac20.mp4') },
  { assetId: 'mat_004_sdr', path: path.join(BASE, '04_样片004', 'ddb67fecf27d89093298aa8f8c6fab4f.mp4') },
  { assetId: 'mat_005_c', path: path.join(BASE, '05_样片005', 'e111f4de876de7071415b93b7e996b02.mp4') }
];

// 25秒，5段，每段5秒
const TEST_TIMELINE: UnifiedTimelineV1 = {
  schemaVersion: 1,
  timelineId: 'phase2f-packaging-test-001',
  taskId: 'phase2f-packaging-test-001',
  outputProfile: { ...DEFAULT_OUTPUT_PROFILE },
  videoTrack: [
    { assetRef: { type: 'task_asset', assetId: 'mat_003_a' }, sourceStart: 0.5, duration: 5.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_b' }, sourceStart: 0.5, duration: 5.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_003_b' }, sourceStart: 1.0, duration: 5.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_004_sdr' }, sourceStart: 0.5, duration: 5.0, transition: 'hard_cut' },
    { assetRef: { type: 'task_asset', assetId: 'mat_005_c' }, sourceStart: 1.0, duration: 5.0, transition: 'hard_cut' }
  ],
  voiceTrack: [],
  subtitleTrack: [
    // 第1句：开场钩子（0-5秒）
    { id: 'sub_001', start: 0, duration: 5.0, text: '饮品代工怎么选', styleId: 'subtitle.default', highlights: [{ keyword: '代工' }] },
    // 第2句：痛点（5-10秒）
    { id: 'sub_002', start: 5.0, duration: 5.0, text: '怕工厂不正规怕品质不稳定', styleId: 'subtitle.default', highlights: [{ keyword: '不正规' }, { keyword: '不稳定' }] },
    // 第3句：解决方案（10-15秒）
    { id: 'sub_003', start: 10.0, duration: 5.0, text: '来浩明饮品自有工厂全程把控', styleId: 'subtitle.default', highlights: [{ keyword: '自有工厂' }, { keyword: '全程把控' }] },
    // 第4句：证据1（15-20秒）
    { id: 'sub_004', start: 15.0, duration: 5.0, text: '从原料到成品每一步都看得见', styleId: 'subtitle.default', highlights: [{ keyword: '每一步' }] },
    // 第5句：证据2（20-25秒）
    { id: 'sub_005', start: 20.0, duration: 5.0, text: '支持OEM和ODM定制多种饮品品类', styleId: 'subtitle.default', highlights: [{ keyword: 'OEM' }, { keyword: 'ODM' }] }
  ],
  titleTrack: [
    // 第1句：开场标题（0-3秒）
    { id: 'title_opening', start: 0, duration: 3.0, text: '饮品代工怎么选', styleId: 'textstyle_opening_clean', layer: 3 },
    // 第2句：关键词互动包装法（5-10秒）
    // 上方关键词：不正规? （5.0秒入场）
    { id: 'title_keypoint_top', start: 5.0, duration: 4.5, text: '不正规?', styleId: 'textstyle_keypoint_top', layer: 3 },
    // 下方关键词：不稳定? （5.5秒入场，比上方晚0.5秒）
    { id: 'title_keypoint_bottom', start: 5.5, duration: 4.0, text: '不稳定?', styleId: 'textstyle_keypoint_bottom', layer: 3 },
    // 第3句：解决方案强调（10-14秒）
    { id: 'title_emphasis_001', start: 10.0, duration: 3.5, text: '自有工厂', styleId: 'textstyle_emphasis_block', layer: 3 },
    // 第5句：OEM/ODM强调（20-24秒）
    { id: 'title_emphasis_002', start: 20.0, duration: 3.5, text: 'OEM / ODM', styleId: 'textstyle_emphasis_block', layer: 3 }
  ],
  overlayTrack: [
    // 第4句：信息卡（15-19秒）
    { id: 'ov_card_001', type: 'info_card', styleId: 'card.info', anchor: 'center_left', start: 15.0, duration: 3.5, text: '原料看得见\n品质有保障', subtitle: '' },
    // 开场装饰贴纸（0.5-2.5秒）
    { id: 'ov_sticker_star', type: 'sticker', assetRef: { type: 'library_asset', assetId: 'sticker_star_yellow' }, styleId: 'sticker.default', anchor: 'top_right', start: 0.5, duration: 2.0, opacity: 0.9 }
  ],
  // BGM 背景音乐
  bgmTrack: [
    { id: 'bgm_001', assetRef: { type: 'library_asset', assetId: 'bgm_corporate_light_01' }, start: 0, duration: 25, volume: 0.2, loop: true }
  ],
  // SFX 留空，由花字模板 entrySfx 自动添加
  sfxTrack: []
};

async function main(): Promise<void> {
  console.log('=== Phase2F 包装能力验证测试：6句完整脚本 ===\n');

  console.log('1. 验证素材（全部竖屏）...');
  for (const asset of TEST_ASSETS) {
    if (!fs.existsSync(asset.path)) throw new Error('素材不存在: ' + asset.path);
  }
  console.log('   ✓ ' + TEST_ASSETS.length + ' 个竖屏素材已验证');

  console.log('\n2. 创建 ZhihengRenderer...');
  const renderer = new ZhihengRenderer({
    diagnosticMode: false,
    workRoot: path.join(process.cwd(), 'tmp', 'zhiheng-renderer', 'phase2f-packaging-test')
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

  console.log('\n5. Capability 声明...');
  const caps = renderer.getCapabilities();
  console.log('   overlayTrack: ' + caps.overlayTrack);
  console.log('   bgmTrack: ' + caps.bgmTrack);
  console.log('   sfxTrack: ' + caps.sfxTrack);
  console.log('   hdrToneMap: ' + caps.hdrToneMap);
  console.log('   titleTrack: ' + caps.titleTrack);

  console.log('\n6. 执行渲染（验证：色块背景+入场动画+关键词互动+入场音效自动匹配）...');
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

  console.log('\n=== 验证要点 ===');
  console.log('请人工检查：');
  console.log('  1. 开场标题（textstyle_opening_clean）：白色大字+左侧黄色装饰条+淡入');
  console.log('  2. 关键词互动包装法（第2句5-10秒）：');
  console.log('     - "不正规?" 上方先入场（5.0秒，黄色色块+黑字+弹入+ding音效）');
  console.log('     - "不稳定?" 下方后入场（5.5秒，黄色色块+黑字+弹入+pop音效）');
  console.log('     - 两个关键词上下排列，先后入场，有互动感');
  console.log('  3. 色块背景（textstyle_emphasis_block）：黄色半透明色块+黑色粗体字');
  console.log('  4. 入场音效：每个花字模板标题入场时自动播放对应音效（无需手动写sfxTrack）');
  console.log('  5. 信息卡（第4句15-19秒）：蓝色半透明信息卡');
  console.log('  6. BGM循环播放');
  console.log('  7. 字幕关键词高亮（黄色放大）');
  console.log('  8. 全部竖屏素材，无横屏裁剪');
}

main().catch(function(err) {
  console.error('\n=== 测试失败 ===');
  console.error(err);
  process.exit(1);
});
