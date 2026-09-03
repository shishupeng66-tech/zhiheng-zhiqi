/**
 * 知衡智企「智剪」正式成片测试 - 使用新包装素材库
 * 
 * 素材来源：
 * - 企业视频素材：D:\知衡智企数据库\企业知识库\浩明饮品\素材资源\视频\（全部竖屏）
 * - BGM：新包装素材库 downloaded-v1/07_BGM
 * - 花字模板：assets/03_花字模板库
 * - 贴纸：assets/02_贴纸库
 * - 音效：assets/01_音效库（花字模板入场音效自动匹配）
 * 
 * 脚本结构（28秒）：
 * 1. 开场Hook（真人口播）
 * 2. 痛点：工厂不正规 + 品质不稳定（关键词互动）
 * 3. 解决方案：自有工厂 + 全程把控
 * 4. 从原料到成品，每一步看得见
 * 5. 核心卖点：OEM/ODM 定制
 * 6. 结尾CTA：欢迎来厂考察
 */

import * as path from 'path';
import * as fs from 'fs';
import { ZhihengRenderer } from '../src/engines/zhiheng-renderer';
import type { UnifiedTimelineV1 } from '../src/engines/zhiheng-renderer/types';

const VIDEO_ASSETS_ROOT = 'D:\\知衡智企数据库\\企业知识库\\浩明饮品\\素材资源\\视频';
const NEW_PACKAGING_ROOT = 'D:\\知衡智企数据库\\包装素材库\\候选库\\downloaded-v1';
const OUTPUT_ROOT = 'D:\\知衡智企\\tmp\\zhiheng-renderer\\official-cut-test';

async function main() {
  console.log('=== 知衡智企「智剪」正式成片测试 ===\n');

  // 1. 创建输出目录
  const renderId = `render-${Date.now()}`;
  const workDir = path.join(OUTPUT_ROOT, renderId);
  fs.mkdirSync(workDir, { recursive: true });
  console.log(`工作目录: ${workDir}\n`);

  // 2. 创建 Renderer
  const renderer = new ZhihengRenderer({
    workRoot: workDir,
  });

  // 3. 注册视频素材（全部竖屏）
  const videoAssets = [
    { assetId: 'vid_hook_koubo', path: path.join(VIDEO_ASSETS_ROOT, '01-真人口播\\06_郝总日常_3.mp4') },
    { assetId: 'vid_factory_env', path: path.join(VIDEO_ASSETS_ROOT, '08-工厂环境\\10_公司环境_2.mp4') },
    { assetId: 'vid_production_1', path: path.join(VIDEO_ASSETS_ROOT, '07-生产线·灌装\\01_无菌_1.MP4') },
    { assetId: 'vid_production_2', path: path.join(VIDEO_ASSETS_ROOT, '07-生产线·灌装\\07_无菌_2.MP4') },
    { assetId: 'vid_qc', path: path.join(VIDEO_ASSETS_ROOT, '03-研发操作\\03_品控_1.MP4') },
    { assetId: 'vid_product', path: path.join(VIDEO_ASSETS_ROOT, '02-样品陈列\\05_八宝茶_1.MP4') },
    { assetId: 'vid_package', path: path.join(VIDEO_ASSETS_ROOT, '06-包材特写\\03_员工风采_1.MP4') },
    { assetId: 'vid_ending_koubo', path: path.join(VIDEO_ASSETS_ROOT, '01-真人口播\\08_郝总日常_4.mp4') },
  ];

  console.log('注册视频素材（全部竖屏）:');
  for (const asset of videoAssets) {
    renderer.registerTaskAsset(asset.assetId, asset.path);
    console.log(`  ✅ ${asset.assetId}: ${path.basename(asset.path)}`);
  }

  // 4. 注册 BGM（新包装素材库）
  const bgmPath = path.join(NEW_PACKAGING_ROOT, '07_BGM\\bgm_corporate_003.mp3');
  renderer.registerTaskAsset('bgm_corporate_light', bgmPath);
  console.log(`\n注册 BGM: bgm_corporate_003.mp3（新包装素材库）`);

  // 5. 构建 Timeline
  const timeline: UnifiedTimelineV1 = {
    schemaVersion: 1,
    timelineId: 'official-cut-001',
    taskId: 'official-cut-test',
    outputProfile: {
      width: 1080,
      height: 1920,
      targetFps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      colorTarget: 'bt709_sdr',
    },
    videoTrack: [
      // 1. 开场Hook（0-4s）：真人口播
      {
        assetRef: { type: 'task_asset', assetId: 'vid_hook_koubo' },
        sourceStart: 1.0,
        duration: 4.0,
        transition: 'hard_cut',
      },
      // 2. 痛点-工厂（4-6.5s）：工厂环境
      {
        assetRef: { type: 'task_asset', assetId: 'vid_factory_env' },
        sourceStart: 0.0,
        duration: 2.5,
        transition: 'hard_cut',
      },
      // 3. 痛点-品质（6.5-9.5s）：生产线
      {
        assetRef: { type: 'task_asset', assetId: 'vid_production_1' },
        sourceStart: 2.0,
        duration: 3.0,
        transition: 'hard_cut',
      },
      // 4. 解决方案-自有工厂（9.5-14.5s）：生产线
      {
        assetRef: { type: 'task_asset', assetId: 'vid_production_2' },
        sourceStart: 1.0,
        duration: 5.0,
        transition: 'hard_cut',
      },
      // 5. 从原料到成品-研发（14.5-17.5s）：品控
      {
        assetRef: { type: 'task_asset', assetId: 'vid_qc' },
        sourceStart: 1.0,
        duration: 3.0,
        transition: 'hard_cut',
      },
      // 6. 从原料到成品-成品（17.5-19.5s）：样品陈列
      {
        assetRef: { type: 'task_asset', assetId: 'vid_product' },
        sourceStart: 1.0,
        duration: 2.0,
        transition: 'hard_cut',
      },
      // 7. 核心卖点-OEM/ODM（19.5-21.5s）：包材特写
      {
        assetRef: { type: 'task_asset', assetId: 'vid_package' },
        sourceStart: 0.0,
        duration: 2.0,
        transition: 'hard_cut',
      },
      // 8. 核心卖点-OEM/ODM（21.5-24s）：生产线
      {
        assetRef: { type: 'task_asset', assetId: 'vid_production_1' },
        sourceStart: 6.0,
        duration: 2.5,
        transition: 'hard_cut',
      },
      // 9. 结尾CTA（24-28s）：真人口播
      {
        assetRef: { type: 'task_asset', assetId: 'vid_ending_koubo' },
        sourceStart: 2.0,
        duration: 4.0,
        transition: 'hard_cut',
      },
    ],
    voiceTrack: [],
    subtitleTrack: [
      // 1. 开场
      { id: 'sub_01', start: 0.5, duration: 3.5, text: '做饮品代工，最怕遇到什么问题？', styleId: 'subtitle.default', highlights: [] },
      // 2. 痛点-工厂
      { id: 'sub_02', start: 4.2, duration: 2.0, text: '怕工厂不正规，', styleId: 'subtitle.default', highlights: [{ keyword: '不正规' }] },
      // 3. 痛点-品质
      { id: 'sub_03', start: 6.5, duration: 2.8, text: '怕品质不稳定？', styleId: 'subtitle.default', highlights: [{ keyword: '不稳定' }] },
      // 4. 解决方案
      { id: 'sub_04', start: 9.5, duration: 4.8, text: '浩明饮品工厂，自有工厂，全程把控。', styleId: 'subtitle.default', highlights: [{ keyword: '自有工厂' }, { keyword: '全程把控' }] },
      // 5. 从原料到成品
      { id: 'sub_05', start: 14.5, duration: 2.8, text: '从原料到成品，', styleId: 'subtitle.default', highlights: [] },
      { id: 'sub_06', start: 17.5, duration: 1.8, text: '每一步都看得见。', styleId: 'subtitle.default', highlights: [{ keyword: '看得见' }] },
      // 7. 核心卖点
      { id: 'sub_07', start: 19.5, duration: 4.3, text: '支持 OEM 和 ODM 定制，你的想法我们来实现。', styleId: 'subtitle.default', highlights: [{ keyword: 'OEM' }, { keyword: 'ODM' }] },
      // 9. 结尾
      { id: 'sub_08', start: 24.2, duration: 3.6, text: '欢迎来厂里考察，聊聊你的想法。', styleId: 'subtitle.default', highlights: [] },
    ],
    titleTrack: [
      // 开场标题
      { id: 'title_opening', start: 0.3, duration: 3.0, text: '浩明饮品', styleId: 'textstyle_opening_clean', layer: 10 },
      // 痛点关键词互动-上
      { id: 'title_keypoint_top', start: 4.5, duration: 4.5, text: '不正规?', styleId: 'textstyle_keypoint_top', layer: 8 },
      // 痛点关键词互动-下
      { id: 'title_keypoint_bottom', start: 5.0, duration: 4.0, text: '不稳定?', styleId: 'textstyle_keypoint_bottom', layer: 8 },
      // 解决方案-自有工厂
      { id: 'title_own_factory', start: 10.0, duration: 3.5, text: '自有工厂', styleId: 'textstyle_emphasis_block', layer: 8 },
      // 核心卖点-OEM/ODM
      { id: 'title_oem', start: 20.0, duration: 3.5, text: 'OEM / ODM', styleId: 'textstyle_emphasis_block', layer: 8 },
      // 结尾引导
      { id: 'title_ending', start: 24.5, duration: 3.0, text: '欢迎来厂考察', styleId: 'textstyle_ending_follow', layer: 8 },
    ],
    overlayTrack: [
      // 信息卡-从原料到成品
      {
        id: 'ov_info_card',
        type: 'info_card',
        styleId: 'card.info',
        anchor: 'center_left',
        start: 14.8,
        duration: 4.5,
        text: '从原料到成品',
        subtitle: '每一步看得见',
      },
    ],
    bgmTrack: [],
    sfxTrack: [],
  };

  // 6. 保存 Timeline
  const timelinePath = path.join(workDir, 'timeline.json');
  fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2), 'utf-8');
  console.log(`\nTimeline 已保存: ${timelinePath}`);
  console.log(`视频总时长: 28秒, 9个竖屏片段`);

  // 7. 验证 Timeline
  console.log('\n=== Timeline 验证 ===');
  const validation = renderer.validate(timeline);
  console.log(`valid: ${validation.valid}`);
  console.log(`errors: ${validation.errors.length}`);
  console.log(`warnings: ${validation.warnings.length}`);
  if (validation.errors.length > 0) {
    validation.errors.forEach(e => console.log(`  ❌ ${e.code}: ${e.message}`));
  }
  if (validation.warnings.length > 0) {
    validation.warnings.forEach(w => console.log(`  ⚠️ ${w}`));
  }

  if (!validation.valid) {
    console.error('\n❌ Timeline 验证失败，终止渲染');
    process.exit(1);
  }

  // 8. 执行渲染
  console.log('\n=== 开始渲染 ===');
  console.log('（包含：竖屏素材 + 花字模板 + 贴纸 + 信息卡 + BGM + 关键词高亮 + 入场音效）');
  const result = await renderer.render(timeline);

  // 9. 输出结果
  console.log('\n=== 渲染结果 ===');
  console.log(`success: ${result.success}`);
  console.log(`output: ${result.outputPath}`);
  console.log(`duration: ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log(`errors: ${result.errors?.length || 0}`);
  console.log(`warnings: ${result.warnings?.length || 0}`);

  if (result.errors && result.errors.length > 0) {
    result.errors.forEach(e => console.log(`  ❌ ${e.stage}: ${e.message}`));
  }
  if (result.warnings && result.warnings.length > 0) {
    result.warnings.forEach(w => console.log(`  ⚠️ ${w}`));
  }

  if (result.success && result.outputPath) {
    const stats = fs.statSync(result.outputPath);
    console.log(`\n文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log('\n=== 验证要点（人工检查） ===');
  console.log('  1. 全部竖屏素材，无横屏裁剪拉伸');
  console.log('  2. 开场标题（浩明饮品）：白色大字+左侧黄色装饰条+淡入');
  console.log('  3. 关键词互动（4.5-9s）：不正规? 上方先入场，不稳定? 下方后入场，有互动感');
  console.log('  4. 花字模板色块背景（自有工厂 / OEM/ODM）：黄色半透明色块+黑色粗体字');
  console.log('  5. 信息卡（14.8-19.3s）：从原料到成品，每一步看得见');
  console.log('  6. 贴纸：工厂图标、检查图标、证书图标');
  console.log('  7. BGM：轻快企业风格，音量适中');
  console.log('  8. 字幕关键词高亮（黄色放大）：不正规、不稳定、自有工厂、全程把控、OEM、ODM');
  console.log('  9. 花字模板入场音效自动匹配');
  console.log('  10. 结尾引导（欢迎来厂考察）：蓝色半透明底板+从右滑入');
  console.log('\n完成！');
}

main().catch(err => {
  console.error('渲染失败:', err);
  process.exit(1);
});
