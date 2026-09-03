/**
 * 最小闭环集成测试（Phase C）：
 *   TS JianYingAdapter → JSON Contract（stdin）→ Python CLI Worker → PJD → 明文草稿
 *
 * 前提（外部环境）：
 *   - Python venv（含 pyJianYingDraft）路径，通过 ZHIJING_PYTHON 指定
 *   - ffmpeg 生成的最小测试素材位于 assetRoot/fixtures/
 *
 * 本测试不写剪映官方草稿目录、不启动剪映。
 * 运行：ZHIJING_PYTHON=<venv python> npx tsx scripts/test-minimal-closed-loop.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { JianYingAdapter } from '../src/engines/jianying-adapter';
import { loadFixture } from '../src/engines/jianying-adapter/contract';
import type { JianYingJob } from '../src/engines/jianying-adapter/types';
import type { UnifiedTimelineV2 } from '../src/engines/zhiheng-renderer/v2-types';

const TEST_OUTPUT_ROOT = process.env.ZHIJING_TEST_OUTPUT
  ?? 'D:\\剪映智剪测试\\jianying-adapter-test-output';

async function main(): Promise<number> {
  const assetRoot = path.join(TEST_OUTPUT_ROOT, 'assets');
  const draftRoot = path.join(TEST_OUTPUT_ROOT, 'drafts');
  const draftName = 'adapter-minimal-e2e';

  // 从共享 fixture 构造 Job（assetId 已与素材目录匹配：fixtures/*）
  const fixtureJob = loadFixture<JianYingJob>('job-minimal.json');
  const timeline = fixtureJob.timeline as UnifiedTimelineV2;

  console.log('[1/4] 构造 JianYingAdapter ...');
  const adapter = new JianYingAdapter({
    assetRoot,
    draftRoot,
    pythonCommand: process.env.ZHIJING_PYTHON ?? 'python',
    timeoutMs: 120_000
  });
  console.log('  capabilities:', JSON.stringify(adapter.getCapabilities()));

  console.log('[2/4] generateDraft（TS → Worker → PJD）...');
  const result = await adapter.generateDraft({
    draftName,
    timeline,
    jobId: 'closed-loop-001',
    options: { backupPlaintext: true, failOnWarning: false }
  });

  console.log('[3/4] Result:', JSON.stringify(result, null, 2));

  console.log('[4/4] 草稿产物核验 ...');
  if (!result.ok) {
    console.error('集成失败:', result.error);
    return 1;
  }

  const draftDir = result.draftDir!;
  const draftContent = path.join(draftDir, 'draft_content.json');
  if (!fs.existsSync(draftContent)) {
    console.error('draft_content.json 缺失:', draftDir);
    return 1;
  }
  const content = JSON.parse(fs.readFileSync(draftContent, 'utf-8'));
  const videoTracks = (content.tracks ?? []).filter((t: { type?: string }) => t.type === 'video');
  const videoSegs = videoTracks.reduce(
    (n: number, t: { segments?: unknown[] }) => n + (t.segments?.length ?? 0),
    0
  );
  console.log('  draftDir:', draftDir);
  console.log('  duration:', result.duration, 's');
  console.log('  tracks:', JSON.stringify(result.tracks));
  console.log('  draft_content.json video segments:', videoSegs);
  console.log('  validation passed:', result.validationReport.passed);
  console.log('  warnings:', result.warnings.length);

  if (videoSegs !== 1 || !result.validationReport.passed) {
    console.error('草稿结构核验未通过');
    return 1;
  }

  console.log('[OK] 最小闭环集成测试通过。明文草稿保留于:', draftDir);
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error('集成测试异常:', err);
    process.exit(1);
  });
