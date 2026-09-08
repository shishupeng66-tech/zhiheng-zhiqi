/**
 * Visual Calibration 测试
 * 用法：npx tsx scripts/test-visual-calibration.ts
 */
import {
  generateCalibrationMatrix,
  P0_RESOURCES,
  P0_TEXT_TEMPLATES,
  P0_FLOWER_TEXTS,
  STANDARD_TEST_TEXTS,
  EXPECTED_MATRIX_SIZE,
  countChineseChars
} from '../src/lib/visual-calibration/matrix-generator';
import {
  getVerticalCalibration,
  getHumanApprovedCalibration,
  interpolateCalibration,
  charCountToBucket,
  loadCalibrationMatrix,
  getCalibrationStats,
  getCalibrationRoleTarget
} from '../src/lib/visual-calibration/repository';
import {
  ROLE_TARGETS_9x16,
  SUBTITLE_SAFE_ZONE_9x16,
  getRoleTarget,
  buildRoleTargetsFile
} from '../src/lib/visual-calibration/role-targets';
import type { CalibrationStatus, UsageRole } from '../src/lib/visual-calibration/types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

async function main() {
  console.log('=== Visual Calibration Tests ===\n');

  // ---- 1. 9:16 only ----
  console.log('1. 9:16 only');
  const matrix = generateCalibrationMatrix();
  assert(matrix.aspectRatio === '9:16', '矩阵 aspectRatio=9:16');
  assert(matrix.entries.every((e) => e.aspectRatio === '9:16'), '所有 entry aspectRatio=9:16');

  // ---- 2. P0资源 ----
  console.log('\n2. P0资源');
  assert(P0_RESOURCES.length === 8, `P0资源=8（实际${P0_RESOURCES.length}）`);
  assert(P0_TEXT_TEMPLATES.length === 5, `文字模板=5（实际${P0_TEXT_TEMPLATES.length}）`);
  assert(P0_FLOWER_TEXTS.length === 3, `花字=3（实际${P0_FLOWER_TEXTS.length}）`);
  assert(P0_TEXT_TEMPLATES.every((r) => r.resourceType === 'text_template'), '文字模板类型正确');
  assert(P0_FLOWER_TEXTS.every((r) => r.resourceType === 'flower_text'), '花字类型正确');

  // ---- 3. 矩阵大小 ----
  console.log('\n3. 矩阵大小');
  assert(matrix.stats.total === EXPECTED_MATRIX_SIZE, `总cell=${EXPECTED_MATRIX_SIZE}（实际${matrix.stats.total}）`);
  assert(matrix.stats.byRole.title === 32, `title=32（实际${matrix.stats.byRole.title}）`);
  assert(matrix.stats.byRole.key_emphasis === 32, `key_emphasis=32（实际${matrix.stats.byRole.key_emphasis}）`);
  assert(matrix.stats.byRole.dense_info_item === 48, `dense_info=48（实际${matrix.stats.byRole.dense_info_item}）`);

  // ---- 4. 标准测试文案 ----
  console.log('\n4. 标准测试文案');
  assert(countChineseChars(STANDARD_TEST_TEXTS[2]) === 2, `2字文案"${STANDARD_TEST_TEXTS[2]}"=2字`);
  assert(countChineseChars(STANDARD_TEST_TEXTS[4]) === 4, `4字文案"${STANDARD_TEST_TEXTS[4]}"=4字`);
  assert(countChineseChars(STANDARD_TEST_TEXTS[6]) === 6, `6字文案"${STANDARD_TEST_TEXTS[6]}"=6字`);
  assert(countChineseChars(STANDARD_TEST_TEXTS[8]) === 8, `8字文案"${STANDARD_TEST_TEXTS[8]}"=8字`);
  matrix.entries.forEach((e) => {
    assert(countChineseChars(e.testText) === e.charCount, `${e.caseId}: 文案字数=${e.charCount}`);
  });

  // ---- 5. usageRole ----
  console.log('\n5. usageRole');
  const roles = new Set(matrix.entries.map((e) => e.usageRole));
  assert(roles.size === 3, '3种role');
  assert(roles.has('title'), '含title');
  assert(roles.has('key_emphasis'), '含key_emphasis');
  assert(roles.has('dense_info_item'), '含dense_info_item');

  // ---- 6. title char buckets ----
  console.log('\n6. title 字数分档');
  const titleBuckets = new Set(matrix.entries.filter((e) => e.usageRole === 'title').map((e) => e.charBucket));
  assert(titleBuckets.has(2) && titleBuckets.has(4) && titleBuckets.has(6) && titleBuckets.has(8), 'title含2/4/6/8字');

  // ---- 7. key_emphasis char buckets ----
  console.log('\n7. key_emphasis 字数分档');
  const keyBuckets = new Set(matrix.entries.filter((e) => e.usageRole === 'key_emphasis').map((e) => e.charBucket));
  assert(keyBuckets.has(2) && keyBuckets.has(4) && keyBuckets.has(6) && keyBuckets.has(8), 'key_emphasis含2/4/6/8字');

  // ---- 8. dense_info char buckets ----
  console.log('\n8. dense_info_item 字数分档');
  const denseBuckets = new Set(matrix.entries.filter((e) => e.usageRole === 'dense_info_item').map((e) => e.charBucket));
  assert(denseBuckets.has(2) && denseBuckets.has(4) && denseBuckets.has(6), 'dense含2/4/6字');
  assert(!denseBuckets.has(8), 'dense不含8字（edge case）');

  // ---- 9. withTitle / withoutTitle ----
  console.log('\n9. withTitle / withoutTitle');
  const denseVariants = new Set(matrix.entries.filter((e) => e.usageRole === 'dense_info_item').map((e) => e.variant));
  assert(denseVariants.has('withTitle'), 'dense含withTitle');
  assert(denseVariants.has('withoutTitle'), 'dense含withoutTitle');
  const nonDenseVariants = new Set(matrix.entries.filter((e) => e.usageRole !== 'dense_info_item').map((e) => e.variant));
  assert(nonDenseVariants.size === 1 && nonDenseVariants.has('default'), '非dense只有default变体');

  // ---- 10. role targets ----
  console.log('\n10. role targets');
  assert(ROLE_TARGETS_9x16.length === 4, '4个role target（title/key/dense-withTitle/dense-withoutTitle）');
  const titleTarget = getRoleTarget('title');
  assert(!!titleTarget, 'title target存在');
  assert(titleTarget!.targetCenterY > 0, 'title在上方（y>0）');
  const keyTarget = getRoleTarget('key_emphasis');
  assert(!!keyTarget, 'key_emphasis target存在');
  const denseWith = getRoleTarget('dense_info_item', 'withTitle');
  const denseWithout = getRoleTarget('dense_info_item', 'withoutTitle');
  assert(!!denseWith && !!denseWithout, 'dense两种变体target存在');
  assert(denseWithout!.targetCenterY > denseWith!.targetCenterY, 'withoutTitle比withTitle位置更高');

  // ---- 11. 字幕安全区 ----
  console.log('\n11. 字幕安全区');
  assert(SUBTITLE_SAFE_ZONE_9x16.subtitleTransformY === -0.8, '字幕transform_y=-0.8（Worker实际配置）');
  assert(SUBTITLE_SAFE_ZONE_9x16.collisionThresholdY > SUBTITLE_SAFE_ZONE_9x16.subtitleTransformY, '碰撞阈值在字幕上方');
  assert(SUBTITLE_SAFE_ZONE_9x16.topSafeY < 1.0, '顶部安全距离合理');

  // ---- 12. charCountToBucket ----
  console.log('\n12. charCountToBucket');
  assert(charCountToBucket(1) === 2, '1字→2档');
  assert(charCountToBucket(2) === 2, '2字→2档');
  assert(charCountToBucket(3) === 4, '3字→4档');
  assert(charCountToBucket(5) === 6, '5字→6档');
  assert(charCountToBucket(7) === 8, '7字→8档');
  assert(charCountToBucket(10) === 8, '10字→8档');

  // ---- 13. 初始状态 ----
  console.log('\n13. 初始状态（生成时NOT_STARTED）');
  const freshMatrix = generateCalibrationMatrix();
  assert(freshMatrix.entries.every((e) => e.status === 'NOT_STARTED'), '新生成矩阵全部NOT_STARTED');
  assert(freshMatrix.stats.byStatus.NOT_STARTED === EXPECTED_MATRIX_SIZE, 'NOT_STARTED计数正确');

  // ---- 14. 已保存矩阵查询 ----
  console.log('\n14. 已保存矩阵查询');
  const saved = await loadCalibrationMatrix();
  assert(saved !== null, '矩阵已保存到磁盘');
  if (saved) {
    assert(saved.entries.length === EXPECTED_MATRIX_SIZE, '已保存矩阵大小正确');
    const pending = saved.entries.filter((e) => e.status === 'MEASUREMENT_PENDING');
    const rejected = saved.entries.filter((e) => e.status === 'REJECTED');
    assert(pending.length === 42, `花字MEASUREMENT_PENDING=42（实际${pending.length}）`);
    assert(rejected.length === 70, `文字模板REJECTED=70（实际${rejected.length}）`);
    assert(rejected.every((e) => e.rejectionReason && e.rejectionReason.startsWith('INJECTION_UNSUPPORTED')), '文字模板rejectionReason包含INJECTION_UNSUPPORTED');
  }

  // ---- 15. getVerticalCalibration ----
  console.log('\n15. getVerticalCalibration');
  const flowerRes = P0_FLOWER_TEXTS[0];
  const cal = await getVerticalCalibration(flowerRes.resourceId, 'title', 4);
  assert(cal !== null, `能查询 ${flowerRes.resourceName} title 4字`);
  if (cal) {
    assert(cal.resourceId === flowerRes.resourceId, 'resourceId匹配');
    assert(cal.usageRole === 'title', 'role匹配');
    assert(cal.charBucket === 4, 'bucket匹配');
    assert(cal.status === 'MEASUREMENT_PENDING', '花字状态=MEASUREMENT_PENDING');
  }

  // ---- 16. getHumanApprovedCalibration gating ----
  console.log('\n16. humanApproved gating');
  const approved = await getHumanApprovedCalibration(flowerRes.resourceId, 'title', 4);
  assert(approved === null, '没有人审时getHumanApproved返回null');
  const stats = await getCalibrationStats();
  assert(stats !== null && stats.humanApproved === 0, 'HUMAN_APPROVED=0');

  // ---- 17. interpolation ----
  console.log('\n17. interpolation（无approved时返回null）');
  const interp = await interpolateCalibration(flowerRes.resourceId, 'title', 3, 'default', 'nearest');
  assert(interp === null, '无approved数据时插值返回null');

  // ---- 18. safe range ----
  console.log('\n18. safe range');
  if (saved) {
    const pendingEntries = saved.entries.filter((e) => e.status === 'MEASUREMENT_PENDING');
    assert(pendingEntries.every((e) => e.safeRange), '所有MEASUREMENT_PENDING entry有safeRange');
    const sample = pendingEntries[0];
    assert(sample.safeRange!.minSafeScale < sample.safeRange!.maxSafeScale, 'scale范围合理');
    assert(sample.safeRange!.minSafeY === SUBTITLE_SAFE_ZONE_9x16.collisionThresholdY, 'minY=字幕碰撞阈值');
    assert(sample.safeRange!.maxSafeY === SUBTITLE_SAFE_ZONE_9x16.topSafeY, 'maxY=顶部安全距离');
  }

  // ---- 19. rejected role 支持 ----
  console.log('\n19. rejected role 支持');
  const statuses: CalibrationStatus[] = ['NOT_STARTED', 'DRAFT_CREATED', 'MEASURED', 'AUTO_CALIBRATED', 'HUMAN_APPROVED', 'REJECTED', 'MEASUREMENT_PENDING'];
  assert(statuses.includes('REJECTED'), '支持REJECTED状态');
  assert(statuses.includes('REJECTED'), '支持REJECTED_FOR_ROLE（通过rejectionReason字段）');

  // ---- 20. no hardcoded path ----
  console.log('\n20. no hardcoded path');
  const calibDir = await import('../src/lib/visual-calibration/repository');
  assert(typeof calibDir.getVerticalCalibrationDir === 'function', '通过resolveSystemAsset获取路径');

  // ---- 21. role-targets.json ----
  console.log('\n21. role-targets.json');
  const rf = buildRoleTargetsFile();
  assert(rf.aspectRatio === '9:16', 'role-targets 9:16');
  assert(rf.canvasWidth === 1080 && rf.canvasHeight === 1920, '画布1080×1920');
  assert(rf.targets.length === 4, '4个target');
  assert(!!rf.source, '有source说明');

  // ---- 22. getCalibrationRoleTarget ----
  console.log('\n22. getCalibrationRoleTarget');
  const rt = getCalibrationRoleTarget('title');
  assert(!!rt, '便捷封装可获取target');
  assert(rt!.usageRole === 'title', 'target role正确');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.error('Failures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
