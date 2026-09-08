/**
 * Visual Calibration Draft Generator
 *
 * 生成真实剪映 Calibration Draft：
 * - 8个P0资源 × 14个case = 112个测试单元
 * - 每个case 2秒独立时间段
 * - 背景使用工厂素材视频
 * - 文本位置按 role target 设置
 * - 所有 measurement 标记为 MEASUREMENT_PENDING（等人审）
 *
 * 用法：npx tsx scripts/generate-calibration-draft.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateCalibrationMatrix, P0_RESOURCES, STANDARD_TEST_TEXTS } from '../src/lib/visual-calibration/matrix-generator';
import { getRoleTarget, SUBTITLE_SAFE_ZONE_9x16 } from '../src/lib/visual-calibration/role-targets';
import { saveCalibrationMatrix, ensureCalibrationDirs, getVerticalCalibrationDir } from '../src/lib/visual-calibration/repository';
import { buildRoleTargetsFile } from '../src/lib/visual-calibration/role-targets';
import type { CalibrationEntry, CalibrationReviewFile, CalibrationReviewItem } from '../src/lib/visual-calibration/types';

// ============================================================================
// 配置
// ============================================================================

const DRAFT_NAME = `ZHIHENG-VERTICAL-TEXT-CALIBRATION-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
const CASE_DURATION_SEC = 2; // 每个测试case 2秒
const BG_VIDEO = 'calibration-bg-black.mp4'; // 纯黑竖版背景，避免工厂视频封面遮挡测试文字
const ASSET_ROOT = 'D:/field-material';
const OUTPUT_DRAFT_ROOT = 'C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Projects/com.lveditor.draft';
const STAGING_ROOT = `D:/field-material/.staging/calibration/${DRAFT_NAME}`;
const LOG_DIR = `D:/field-material/.staging/calibration-logs/${DRAFT_NAME}`;
const ANIMATION_IN_ID = '7123116334677758501'; // 向上弹入
const ANIMATION_OUT_ID = '7678658611601493258'; // 烟雾消散
const ANIMATION_DURATION_US = 500000;

// ============================================================================
// 生成 timeline
// ============================================================================

function buildTimeline(entries: CalibrationEntry[]) {
  const totalDuration = entries.length * CASE_DURATION_SEC;

  // 视频轨：纯黑背景，整段覆盖
  const videoTrack = [{
    assetRef: { type: 'library_asset', assetId: `videos/${BG_VIDEO}` },
    sourceStart: 0,
    duration: totalDuration,
    transition: 'hard_cut' as const,
    sourceAudioMuted: true
  }];

  // 文本覆盖轨：每个case一个segment
  const textOverlayTrack = entries.map((entry, idx) => {
    const start = idx * CASE_DURATION_SEC;
    const end = start + CASE_DURATION_SEC;
    const target = getRoleTarget(entry.usageRole, entry.variant);
    const posY = target?.targetCenterY ?? 0;
    const posX = target?.targetCenterX ?? 0;

    return {
      id: entry.caseId,
      text: entry.testText,
      start,
      end,
      slotIndex: idx,
      positionX: posX,
      positionY: posY,
      effectResourceId: entry.resourceId,
      animationInId: ANIMATION_IN_ID,
      animationOutId: ANIMATION_OUT_ID,
      animationDurationUs: ANIMATION_DURATION_US,
      groupId: `grp-${entry.resourceId.slice(-6)}`,
      laneIndex: idx % 4, // 4条lane池
      layer: 5
    };
  });

  // 字幕轨：底部固定字幕（标注当前case信息）
  const subtitleTrack = entries.map((entry, idx) => {
    const start = idx * CASE_DURATION_SEC;
    return {
      id: `sub-${entry.caseId}`,
      start,
      duration: CASE_DURATION_SEC * 0.9,
      text: `${entry.resourceName} | ${entry.usageRole} | ${entry.charCount}字${entry.variant !== 'default' ? ' | ' + entry.variant : ''}`,
      styleId: 'subtitle.default'
    };
  });

  return {
    schemaVersion: 2,
    timelineId: `tl-${DRAFT_NAME}`,
    taskId: `task-${DRAFT_NAME}`,
    outputProfile: {
      width: 1080,
      height: 1920,
      targetFps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      colorTarget: 'bt709_sdr'
    },
    videoTrack,
    voiceTrack: [],
    subtitleTrack,
    titleTrack: [],
    textOverlayTrack,
    stickerTrack: [],
    packagingSfx: []
  };
}

// ============================================================================
// 生成 job
// ============================================================================

function buildJob(timeline: unknown) {
  return {
    contractVersion: '0.1.0',
    jobId: `job-${DRAFT_NAME}`,
    timelineSchemaVersion: 2,
    draft: { name: DRAFT_NAME, width: 1080, height: 1920, fps: 30 },
    timeline,
    resourceMapRef: 'zhiheng-resource-map.v0.1.0',
    assetRoot: ASSET_ROOT,
    outputDraftDir: path.join(OUTPUT_DRAFT_ROOT, DRAFT_NAME).replace(/\\/g, '/'),
    stagingRoot: STAGING_ROOT,
    logDir: LOG_DIR,
    options: { backupPlaintext: false, failOnWarning: false },
    officialDraftRoot: OUTPUT_DRAFT_ROOT
  };
}

// ============================================================================
// 生成验收清单
// ============================================================================

function buildReviewFile(entries: CalibrationEntry[], draftPath: string): CalibrationReviewFile {
  const items: CalibrationReviewItem[] = entries.map((entry, idx) => {
    const start = idx * CASE_DURATION_SEC;
    const target = getRoleTarget(entry.usageRole, entry.variant)!;
    return {
      caseId: entry.caseId,
      resourceId: entry.resourceId,
      resourceName: entry.resourceName,
      resourceType: entry.resourceType,
      usageRole: entry.usageRole,
      charCount: entry.charCount,
      charBucket: entry.charBucket,
      variant: entry.variant,
      testText: entry.testText,
      draftTimeRange: [start, start + CASE_DURATION_SEC],
      expectedTarget: target,
      currentStatus: entry.status,
      reviewHint: buildReviewHint(entry)
    };
  });

  return {
    version: '1.0.0',
    draftName: DRAFT_NAME,
    draftPath,
    generatedAt: new Date().toISOString(),
    items,
    instructions: [
      '打开剪映，导入草稿 ' + DRAFT_NAME,
      '按时间顺序逐个检查每个测试单元（每个2秒）',
      '底部字幕显示当前：资源名 | 角色 | 字数 | 变体',
      '判断：太大/合适/太小、太高/太低、是否碰字幕、是否适合该角色',
      '将结果反馈给开发者，由开发者更新校准矩阵状态',
      '只有人工确认的组合才会标记 HUMAN_APPROVED'
    ]
  };
}

function buildReviewHint(entry: CalibrationEntry): string {
  const parts = [];
  parts.push(`文本"${entry.testText}"（${entry.charCount}字）`);
  parts.push(`角色=${entry.usageRole}`);
  if (entry.variant !== 'default') parts.push(`变体=${entry.variant}`);
  parts.push('检查：尺寸是否合适、位置是否在目标区、是否碰字幕、风格是否适合');
  return parts.join('；');
}

// ============================================================================
// 主流程
// ============================================================================

async function main() {
  console.log('=== Visual Calibration Draft Generator ===\n');

  // 1. 生成矩阵
  console.log('1. 生成校准矩阵...');
  const matrix = generateCalibrationMatrix();
  console.log(`   P0资源: ${matrix.p0Resources.length} 个`);
  console.log(`   校准单元: ${matrix.stats.total} 个`);
  console.log(`   title: ${matrix.stats.byRole.title}, key_emphasis: ${matrix.stats.byRole.key_emphasis}, dense_info: ${matrix.stats.byRole.dense_info_item}`);

  // 分离：花字（可注入）vs 文字模板（Worker当前不支持caption_template注入）
  const flowerEntries = matrix.entries.filter((e) => e.resourceType === 'flower_text');
  const textTemplateEntries = matrix.entries.filter((e) => e.resourceType === 'text_template');
  console.log(`   花字可测: ${flowerEntries.length} 个, 文字模板待支持: ${textTemplateEntries.length} 个`);

  // 文字模板标记为 REJECTED（注入方式不支持，不是资源本身问题）
  const nowMark = new Date().toISOString();
  for (const entry of textTemplateEntries) {
    entry.status = 'REJECTED';
    entry.rejectionReason = 'INJECTION_UNSUPPORTED';
    entry.updatedAt = nowMark;
  }

  // 2. 确保目录
  await ensureCalibrationDirs();
  const calibDir = await getVerticalCalibrationDir();
  console.log(`   校准目录: ${calibDir}`);

  // 3. 保存 role-targets.json
  const roleTargets = buildRoleTargetsFile();
  fs.writeFileSync(path.join(calibDir, 'role-targets.json'), JSON.stringify(roleTargets, null, 2), 'utf8');
  console.log('   role-targets.json 已保存');

  // 4. 构建 timeline + job（只用花字，文字模板已标记REJECTED）
  console.log('\n2. 构建 timeline...');
  const timeline = buildTimeline(flowerEntries);
  const job = buildJob(timeline);
  console.log(`   草稿名: ${DRAFT_NAME}`);
  console.log(`   总时长: ${flowerEntries.length * CASE_DURATION_SEC}s`);
  console.log(`   textOverlay: ${timeline.textOverlayTrack.length}`);
  console.log(`   subtitle: ${timeline.subtitleTrack.length}`);

  // 5. 保存 job JSON（供 Worker 调用，放在 staging 外避免 Worker 检测非空）
  const jobDir = 'D:/field-material/.staging/calibration-jobs';
  fs.mkdirSync(jobDir, { recursive: true });
  const jobPath = path.join(jobDir, `${DRAFT_NAME}-job.json`);
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');
  console.log(`   Job JSON: ${jobPath}`);

  // 6. 调用 Worker 生成草稿
  console.log('\n3. 调用 Python Worker 生成剪映草稿...');
  const { callWorkerDirect } = await import('./calibration-worker-runner');
  const result = await callWorkerDirect(jobPath);

  if (!result.ok) {
    console.error(`   Worker 失败: ${result.error}`);
    // 即使失败也保存矩阵和清单
  } else {
    console.log(`   草稿生成成功: ${result.draftDir}`);
    console.log(`   duration: ${result.duration}s`);
    console.log(`   tracks: ${JSON.stringify(result.tracks)}`);
  }

  // 7. 更新矩阵状态（只更新花字，文字模板已标记REJECTED）
  console.log('\n4. 更新矩阵状态...');
  const now = new Date().toISOString();
  for (const entry of flowerEntries) {
    entry.status = result.ok ? 'MEASUREMENT_PENDING' : 'DRAFT_CREATED';
    entry.updatedAt = now;
    entry.calibrationLog = [
      `${now}: Calibration draft generated (${DRAFT_NAME})`,
      `${now}: Status set to ${result.ok ? 'MEASUREMENT_PENDING' : 'DRAFT_CREATED'} - awaiting human visual review`
    ];
    // 记录推荐位置（来自 role target）
    const target = getRoleTarget(entry.usageRole, entry.variant);
    if (target) {
      entry.recommendedPositionX = target.targetCenterX;
      entry.recommendedPositionY = target.targetCenterY;
      entry.recommendedScale = 1.0; // Worker 当前固定 scale=1.0
    }
    // 安全范围（基于 role target + subtitle safe zone）
    entry.safeRange = {
      minSafeScale: 0.5,
      maxSafeScale: 2.0,
      minSafeX: -0.4,
      maxSafeX: 0.4,
      minSafeY: SUBTITLE_SAFE_ZONE_9x16.collisionThresholdY,
      maxSafeY: SUBTITLE_SAFE_ZONE_9x16.topSafeY
    };
  }

  // 更新统计
  const byStatus: Record<string, number> = {};
  for (const e of matrix.entries) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  }
  matrix.stats.byStatus = byStatus as any;
  matrix.generatedAt = now;

  await saveCalibrationMatrix(matrix);
  console.log(`   矩阵已保存: ${path.join(calibDir, 'matrix.json')}`);
  console.log(`   状态统计: ${JSON.stringify(byStatus)}`);

  // 8. 生成验收清单（只含花字，文字模板已REJECTED不在草稿中）
  console.log('\n5. 生成用户验收清单...');
  const draftPath = result.ok && result.draftDir ? result.draftDir : path.join(OUTPUT_DRAFT_ROOT, DRAFT_NAME);
  const reviewFile = buildReviewFile(flowerEntries, draftPath);
  const reviewPath = path.join(calibDir, 'vertical-calibration-review.json');
  fs.writeFileSync(reviewPath, JSON.stringify(reviewFile, null, 2), 'utf8');
  console.log(`   验收清单: ${reviewPath}`);
  console.log(`   待验收项: ${reviewFile.items.length}`);

  // 9. 保存 measurements.json（空，等人审后填入）
  fs.writeFileSync(
    path.join(calibDir, 'measurements.json'),
    JSON.stringify({ version: '1.0.0', generatedAt: now, measurements: [], note: 'Awaiting human visual review and bbox measurement' }, null, 2),
    'utf8'
  );

  // 10. 保存 approved-specs.json（空，没有人审前 HUMAN_APPROVED=0）
  fs.writeFileSync(
    path.join(calibDir, 'approved-specs.json'),
    JSON.stringify({ version: '1.0.0', generatedAt: now, approved: [], note: 'No human-approved specs yet. HUMAN_APPROVED count must remain 0 until user confirms.' }, null, 2),
    'utf8'
  );

  console.log('\n=== 完成 ===');
  console.log(`草稿名: ${DRAFT_NAME}`);
  console.log(`草稿路径: ${draftPath}`);
  console.log(`校准目录: ${calibDir}`);
  console.log(`花字可测: ${flowerEntries.length} 个（MEASUREMENT_PENDING）`);
  console.log(`文字模板: ${textTemplateEntries.length} 个（REJECTED - 注入方式待支持）`);
  console.log(`HUMAN_APPROVED: 0（等待人工验收）`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
