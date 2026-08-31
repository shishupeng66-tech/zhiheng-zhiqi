/**
 * 视频素材检索黄金测试集 Benchmark 脚本
 *
 * 用法：npx tsx scripts/test-video-search-benchmark.ts
 *
 * 直接调用 searchVideoClips，不经过 LLM，纯测试搜索器本身的质量。
 * 测试集：D:\知衡智企数据库\企业知识库\浩明饮品\内容资料\知识文件\视频内容策略\05-测试基准\video-search-benchmark-v1.json
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import * as fs from 'fs';
import * as path from 'path';
import { searchVideoClips, type VideoClipResult } from '../src/lib/agent/video-asset-index';

// ============================================================
// 类型定义
// ============================================================

interface BenchmarkExpectedAsset {
  relativePath: string;
  fileName: string;
  category: string;
  normalizedCategory: string;
  priority: 'must' | 'acceptable';
  contentContains: string[];
  recommendedStart: number;
  recommendedEnd: number;
  orientation: 'landscape' | 'portrait';
  duplicateGroup: string | null;
  mustUseRecommendedCut: boolean;
}

interface BenchmarkCase {
  id: string;
  query: string;
  intent: string;
  coverage: string[];
  expectedBehavior: 'rank_relevant_assets' | 'insufficient_material';
  expected: BenchmarkExpectedAsset[];
  acceptable: BenchmarkExpectedAsset[];
  shouldNotRankHigh: string[];
  notes: string;
  duplicateRule?: {
    maxSameDuplicateGroupInTop5: number;
  };
  avoidCutRule?: {
    mustNotReturnAvoidCuts: boolean;
  };
}

interface BenchmarkData {
  version: string;
  name: string;
  cases: BenchmarkCase[];
}

interface CaseResult {
  caseId: string;
  intent: string;
  query: string;
  passed: boolean;
  failReasons: string[];

  // 命中情况
  mustHit: boolean; // must 列表中至少有一个在 Top5
  top1Hit: boolean;
  top3Hit: boolean;
  top5Hit: boolean;

  // Wrong Top3
  wrongTop3: boolean; // Top3 中有 shouldNotRankHigh 的内容

  // Duplicate
  duplicateViolation: boolean;

  // AvoidCut
  avoidCutViolation: boolean;

  // insufficient_material 判断
  insufficientCorrect: boolean;

  // 实际返回的 Top5
  top5: VideoClipResult[];
}

interface BenchmarkMetrics {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;

  mustHitRate: number;
  top1HitRate: number;
  top3Recall: number;
  top5Recall: number;
  wrongTop3Rate: number;
  duplicateViolationRate: number;
  avoidCutViolationRate: number;
  insufficientAccuracy: number;

  overallScore: number;
}

// ============================================================
// 加载测试集
// ============================================================

function loadBenchmark(): BenchmarkData {
  const benchmarkPath = path.join(
    'D:',
    '知衡智企数据库',
    '知识文件',
    '视频内容策略',
    '05-测试基准',
    'video-search-benchmark-v1.json'
  );
  const raw = fs.readFileSync(benchmarkPath, 'utf-8');
  return JSON.parse(raw) as BenchmarkData;
}

// ============================================================
// 运行单个测试用例
// ============================================================

async function runCase(testCase: BenchmarkCase): Promise<CaseResult> {
  const result: CaseResult = {
    caseId: testCase.id,
    intent: testCase.intent,
    query: testCase.query,
    passed: true,
    failReasons: [],
    mustHit: false,
    top1Hit: false,
    top3Hit: false,
    top5Hit: false,
    wrongTop3: false,
    duplicateViolation: false,
    avoidCutViolation: false,
    insufficientCorrect: false,
    top5: []
  };

  // 执行搜索
  const results = await searchVideoClips({
    query: testCase.query,
    limit: 10,
    excludeDuplicateGroups: true
  });

  const top5 = results.slice(0, 5);
  result.top5 = top5;

  // insufficient_material 类型的测试
  if (testCase.expectedBehavior === 'insufficient_material') {
    // 应该返回很少或没有结果，且最高分应该很低
    const topScore = top5.length > 0 ? top5[0].matchScore : 0;
    // 如果最高分 < 0.25 且结果 < 3，认为正确识别了素材不足
    const isInsufficient = topScore < 0.25 || top5.length < 2;
    result.insufficientCorrect = isInsufficient;
    if (!isInsufficient) {
      result.passed = false;
      result.failReasons.push(
        `insufficient_material 判断错误：topScore=${topScore.toFixed(3)}, top5Count=${top5.length}，应提示素材不足`
      );
    }
    return result;
  }

  // rank_relevant_assets 类型的测试
  const mustPaths = testCase.expected.map((e) => e.relativePath.toLowerCase());
  const acceptablePaths = testCase.acceptable.map((e) => e.relativePath.toLowerCase());
  const allRelevantPaths = [...mustPaths, ...acceptablePaths];

  // 检查命中情况
  for (let i = 0; i < top5.length; i++) {
    const clip = top5[i];
    const clipPath = clip.relativePath.toLowerCase();
    const isMust = mustPaths.includes(clipPath);
    const isAcceptable = acceptablePaths.includes(clipPath);

    if (isMust || isAcceptable) {
      if (i === 0) result.top1Hit = true;
      if (i < 3) result.top3Hit = true;
      if (i < 5) result.top5Hit = true;
      if (isMust) result.mustHit = true;
    }
  }

  // Must Hit 检查
  if (!result.mustHit && testCase.expected.length > 0) {
    result.passed = false;
    result.failReasons.push(
      `Must Hit 失败：Top5 中没有 must 素材。must 列表: ${testCase.expected.map((e) => e.fileName).join(', ')}`
    );
  }

  // Wrong Top3 检查
  const top3 = top5.slice(0, 3);
  for (const clip of top3) {
    const clipPath = clip.relativePath.toLowerCase();
    // 检查是否在 shouldNotRankHigh 中（通过 content / category / topicTags 关键词匹配）
    for (const badKeyword of testCase.shouldNotRankHigh) {
      const matchesBad =
        clip.content.includes(badKeyword) ||
        clip.category.includes(badKeyword) ||
        clip.topicTags.some((t) => t.includes(badKeyword)) ||
        clip.semanticMatches.some((s) => s.includes(badKeyword));

      if (matchesBad) {
        // 但如果它在 expected/acceptable 中，就不算 wrong
        if (!allRelevantPaths.includes(clipPath)) {
          result.wrongTop3 = true;
          result.passed = false;
          result.failReasons.push(
            `Wrong Top3：第${top3.indexOf(clip) + 1}名「${clip.content}」(${clip.fileName}) 属于 shouldNotRankHigh（关键词: ${badKeyword}）`
          );
          break;
        }
      }
    }
    if (result.wrongTop3) break;
  }

  // Duplicate 检查
  if (testCase.duplicateRule) {
    const maxDup = testCase.duplicateRule.maxSameDuplicateGroupInTop5;
    const groupCounts = new Map<string, number>();
    for (const clip of top5) {
      if (clip.duplicateGroup) {
        const count = groupCounts.get(clip.duplicateGroup) || 0;
        groupCounts.set(clip.duplicateGroup, count + 1);
      }
    }
    for (const [group, count] of groupCounts) {
      if (count > maxDup) {
        result.duplicateViolation = true;
        result.passed = false;
        result.failReasons.push(
          `Duplicate Violation：duplicateGroup「${group}」在 Top5 中有 ${count} 个，超过上限 ${maxDup}`
        );
      }
    }
  }

  // AvoidCut 检查
  if (testCase.avoidCutRule?.mustNotReturnAvoidCuts) {
    for (const clip of top5) {
      // 检查 clip 是否来自 expected 列表中的 mustUseRecommendedCut 素材
      const expectedAsset = testCase.expected.find(
        (e) => e.relativePath.toLowerCase() === clip.relativePath.toLowerCase()
      );
      if (expectedAsset?.mustUseRecommendedCut) {
        // 验证返回的 recommendedStart/End 是否接近 expected 的值（允许 0.5s 误差）
        const startDiff = Math.abs(clip.recommendedStart - expectedAsset.recommendedStart);
        const endDiff = Math.abs(clip.recommendedEnd - expectedAsset.recommendedEnd);
        if (startDiff > 0.5 || endDiff > 0.5) {
          result.avoidCutViolation = true;
          result.passed = false;
          result.failReasons.push(
            `AvoidCut Violation：${clip.fileName} 返回片段 [${clip.recommendedStart.toFixed(1)}-${clip.recommendedEnd.toFixed(1)}s] 与 expected [${expectedAsset.recommendedStart}-${expectedAsset.recommendedEnd}s] 不符`
          );
          break;
        }
      }
    }
  }

  return result;
}

// ============================================================
// 计算指标
// ============================================================

function calculateMetrics(results: CaseResult[]): BenchmarkMetrics {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;

  // 只统计 rank_relevant_assets 类型的用例
  const rankCases = results.filter((r) => r.intent !== 'insufficient_material');
  const insufficientCases = results.filter((r) => r.intent === 'insufficient_material');

  const mustHitRate = rankCases.length > 0
    ? rankCases.filter((r) => r.mustHit).length / rankCases.length
    : 0;

  const top1HitRate = rankCases.length > 0
    ? rankCases.filter((r) => r.top1Hit).length / rankCases.length
    : 0;

  const top3Recall = rankCases.length > 0
    ? rankCases.filter((r) => r.top3Hit).length / rankCases.length
    : 0;

  const top5Recall = rankCases.length > 0
    ? rankCases.filter((r) => r.top5Hit).length / rankCases.length
    : 0;

  const wrongTop3Rate = rankCases.length > 0
    ? rankCases.filter((r) => r.wrongTop3).length / rankCases.length
    : 0;

  // Duplicate：只统计有 duplicateRule 的用例
  const dupCases = results.filter((r) => r.intent === 'duplicate');
  const duplicateViolationRate = dupCases.length > 0
    ? dupCases.filter((r) => r.duplicateViolation).length / dupCases.length
    : 0;

  // AvoidCut：只统计有 avoidCutRule 的用例
  const avoidCases = results.filter((r) => r.intent === 'avoid_cut');
  const avoidCutViolationRate = avoidCases.length > 0
    ? avoidCases.filter((r) => r.avoidCutViolation).length / avoidCases.length
    : 0;

  // insufficient_material 准确率
  const insufficientAccuracy = insufficientCases.length > 0
    ? insufficientCases.filter((r) => r.insufficientCorrect).length / insufficientCases.length
    : 0;

  // 总分：加权计算
  const overallScore =
    mustHitRate * 30 +
    top3Recall * 25 +
    top5Recall * 15 +
    (1 - wrongTop3Rate) * 10 +
    (1 - duplicateViolationRate) * 10 +
    (1 - avoidCutViolationRate) * 10;

  return {
    totalCases: total,
    passedCases: passed,
    failedCases: total - passed,
    passRate: passed / total,
    mustHitRate,
    top1HitRate,
    top3Recall,
    top5Recall,
    wrongTop3Rate,
    duplicateViolationRate,
    avoidCutViolationRate,
    insufficientAccuracy,
    overallScore
  };
}

// ============================================================
// 输出结果
// ============================================================

function printResults(results: CaseResult[], metrics: BenchmarkMetrics) {
  console.log('');
  console.log('========================================');
  console.log('  视频素材检索 Benchmark 结果');
  console.log('========================================');

  console.log('\n【总体指标】');
  console.log(`  总用例数: ${metrics.totalCases}`);
  console.log(`  通过: ${metrics.passedCases} / 失败: ${metrics.failedCases}`);
  console.log(`  通过率: ${(metrics.passRate * 100).toFixed(1)}%`);
  console.log(`  总分: ${metrics.overallScore.toFixed(1)} / 100`);

  console.log('\n【详细指标】');
  console.log(`  Must Hit Rate:      ${(metrics.mustHitRate * 100).toFixed(1)}%  (目标 >= 85%)`);
  console.log(`  Top1 Hit Rate:      ${(metrics.top1HitRate * 100).toFixed(1)}%`);
  console.log(`  Top3 Recall:        ${(metrics.top3Recall * 100).toFixed(1)}%  (目标 >= 90%)`);
  console.log(`  Top5 Recall:        ${(metrics.top5Recall * 100).toFixed(1)}%  (目标 >= 95%)`);
  console.log(`  Wrong Top3 Rate:    ${(metrics.wrongTop3Rate * 100).toFixed(1)}%  (越低越好)`);
  console.log(`  Duplicate Violation: ${(metrics.duplicateViolationRate * 100).toFixed(1)}%  (目标 = 0%)`);
  console.log(`  AvoidCut Violation:  ${(metrics.avoidCutViolationRate * 100).toFixed(1)}%  (目标 = 0%)`);
  console.log(`  Insufficient Acc:   ${(metrics.insufficientAccuracy * 100).toFixed(1)}%  (目标 >= 80%)`);

  // 失败用例详情
  const failedCases = results.filter((r) => !r.passed);
  if (failedCases.length > 0) {
    console.log('\n【失败用例详情】');
    for (const r of failedCases) {
      console.log(`\n  ${r.caseId} [${r.intent}]`);
      console.log(`    Query: ${r.query.slice(0, 50)}${r.query.length > 50 ? '...' : ''}`);
      for (const reason of r.failReasons) {
        console.log(`    ❌ ${reason}`);
      }
      console.log(`    Top5:`);
      r.top5.slice(0, 5).forEach((clip, i) => {
        console.log(
          `      ${i + 1}. [${clip.matchScore.toFixed(3)}] ${clip.fileName} - ${clip.content.slice(0, 25)}`
        );
      });
    }
  }

  console.log('\n========================================');
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  console.log('加载黄金测试集...');
  const benchmark = loadBenchmark();
  console.log(`测试集: ${benchmark.name}`);
  console.log(`版本: ${benchmark.version}`);
  console.log(`用例数: ${benchmark.cases.length}`);

  console.log('\n预热搜索索引...');
  await searchVideoClips({ query: 'test', limit: 1 });

  console.log('\n运行测试用例...');
  const results: CaseResult[] = [];

  for (let i = 0; i < benchmark.cases.length; i++) {
    const testCase = benchmark.cases[i];
    process.stdout.write(`  ${i + 1}/${benchmark.cases.length} ${testCase.id}... `);
    const result = await runCase(testCase);
    results.push(result);
    console.log(result.passed ? '✅' : '❌');
  }

  const metrics = calculateMetrics(results);
  printResults(results, metrics);

  // 检查是否达到门槛
  console.log('\n【门槛检查】');
  const thresholds = {
    mustHitRate: 0.85,
    top3Recall: 0.90,
    top5Recall: 0.95,
    duplicateViolationRate: 0,
    avoidCutViolationRate: 0,
    insufficientAccuracy: 0.80
  };

  let allPassed = true;
  for (const [key, threshold] of Object.entries(thresholds)) {
    const actual = metrics[key as keyof BenchmarkMetrics] as number;
    const passed = key.includes('Rate') && key.includes('Violation')
      ? actual <= threshold
      : actual >= threshold;
    const status = passed ? '✅' : '❌';
    console.log(`  ${status} ${key}: ${(actual * 100).toFixed(1)}% (目标: ${(threshold * 100).toFixed(0)}%)`);
    if (!passed) allPassed = false;
  }

  console.log(`\n  门槛结果: ${allPassed ? '✅ 全部达标' : '❌ 存在未达标项'}`);
  console.log('');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
