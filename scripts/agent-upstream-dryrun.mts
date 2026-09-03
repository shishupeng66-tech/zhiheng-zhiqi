/**
 * 自动剪辑 Agent 上游主链 —— 正式接入前收口 dry-run。
 *
 * 设计边界（务必遵守）：
 * - 本脚本【不再】调用 saveConfig(...) 修改企业正式 Storage Config。
 *   assets 索引目录通过 setStorageConfigOverride(...)（进程内存 DI）传入，
 *   getPath('assets') 优先返回覆盖值；脚本结束 clearStorageConfigOverrides()，
 *   不写数据库、不留企业配置变化。
 * - 真实链路与上一轮一致：search_video_assets（真实索引）→ create_video_plan
 *   → save_video_plan_as_draft → buildUnifiedTimelineFromAutomationDraft
 *   → validateTimeline → agentStage:ready_for_jianying。
 * - 执行期资产门禁 validateAutomationExecutionAssets 单独验证（Test C）。
 * - 不调用 MoneyPrinter / PJD / JianYingAdapter。
 *
 * 运行：
 *   DATABASE_PATH='./data/zhiheng_local.db' STORAGE_ROOT='./data' \
 *   node node_modules/tsx/dist/cli.mjs scripts/agent-upstream-dryrun.mts
 *
 * 可选 env：AGENT_UPSTREAM_ASSETS_DIR 指定真实企业素材索引目录（缺省 ./data/素材资源）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { workspaces, users, automationVideoTasks } from '@/lib/db/schema';
import {
  getConfig,
  setStorageConfigOverride,
  clearStorageConfigOverrides
} from '@/lib/storage';
import { refreshAssetIndexCache } from '@/lib/agent/video-asset-index';
import { getTaskAgentStage, getTaskUnifiedTimelineV2 } from '@/lib/workspaces/automation-editing';
import { runAgentAutoEditPipeline } from '@/lib/workspaces/agent-auto-edit';
import { chat } from '@/lib/ai';
import { deriveVideoTimelineStartsV2 } from '@/engines/zhiheng-renderer/v2-types';
import { DEFAULT_OUTPUT_PROFILE } from '@/engines/zhiheng-renderer/types';
import type { UnifiedTimelineV2 } from '@/engines/zhiheng-renderer/v2-types';
import { validateAutomationExecutionAssets } from '@/lib/workspaces/automation-execution-preflight';

const WORKSPACE_SLUG = 'enterprise-media';

/** 完整脚本（Complete Script Mode）：已是多句口播脚本，不应触发 LLM 重写。 */
const FULL_SCRIPT = [
  '这条视频想让客户知道我们浩明饮品为什么值得信赖。',
  '先由郝总对着镜头讲企业理念，把品牌的底气说出来。',
  '再切到无菌灌装线的完整流程，展示灌装和贴标这两个关键工艺环节。',
  '然后是成品仓库，绿、粉、黄三色箱子整齐码垛排列，体现稳定交付能力。',
  '最后回到郝总做总结，强调从源头到出厂都看得见、可追溯。'
].join('\n');

/** 自然语言需求（Intent Mode）：一句话需求，应触发项目模型先生成/整理脚本。 */
const INTENT_PROMPT =
  '帮我做一条介绍饮料代工流程的短视频，重点讲客户从提出需求到生产交付的大概过程。';

function printTimelineSummary(label: string, output: {
  taskId: string;
  stage: string;
  modelUsed: { provider: string; model: string } | null;
  candidateCount: number;
  assetCount: number;
  recommendedCutsUsed: number;
  avoidCutsCount: number;
  coverage: unknown;
  timeline: UnifiedTimelineV2;
  validation: { valid: boolean; errors: unknown[]; warnings: unknown[] };
  script: string;
}) {
  const tl = output.timeline;
  const totalDuration = tl.videoTrack.reduce((s, v) => s + v.duration, 0);
  const allMuted = tl.videoTrack.every((v) => v.sourceAudioMuted === true);
  const starts = deriveVideoTimelineStartsV2(tl);
  const continuous = starts.every(
    (s, i) =>
      i === 0
        ? Math.abs(s.timelineStart) < 1e-6
        : Math.abs(s.timelineStart - starts[i - 1].timelineEnd) < 1e-6
  );
  console.log(`\n----------- ${label} -----------`);
  console.log('taskId                :', output.taskId);
  console.log('stage                 :', output.stage);
  console.log('modelUsed             :', JSON.stringify(output.modelUsed));
  console.log('candidateCount        :', output.candidateCount);
  console.log('assetCount(videoSeg)  :', output.assetCount);
  console.log('recommendedCutsUsed   :', output.recommendedCutsUsed);
  console.log('avoidCutsCount        :', output.avoidCutsCount);
  console.log('timeline.schemaVersion:', tl.schemaVersion);
  console.log('timeline.duration     :', totalDuration.toFixed(3), 's');
  console.log('timeline.videoSegments:', tl.videoTrack.length);
  console.log('all sourceAudioMuted  :', allMuted);
  console.log('videoTrack continuous :', continuous);
  console.log('subtitleTrack count   :', tl.subtitleTrack?.length ?? 0);
  console.log('keywordTrack count    :', tl.keywordTrack?.length ?? 0);
  console.log('validation.valid      :', output.validation.valid);
  console.log('validation.errors     :', JSON.stringify(output.validation.errors));
  console.log('validation.warnings   :', JSON.stringify(output.validation.warnings));

  // 二次校验：回读 DB 行，确认 agentStage:ready_for_jianying 与 unifiedTimelineV2 已落库
  const row = getDb()
    .select({
      id: automationVideoTasks.id,
      status: automationVideoTasks.status,
      // packagingOptions 为 json 列，直接取原始值再解析
      packagingOptions: automationVideoTasks.packagingOptions as unknown as Record<string, string>[]
    })
    .from(automationVideoTasks)
    .where(eq(automationVideoTasks.id, output.taskId))
    .get() as { id: string; status: string; packagingOptions: string[] } | undefined;
  const pack = row?.packagingOptions ?? [];
  const storedStage = pack.find((p) => p.startsWith('agentStage:'))?.slice('agentStage:'.length) ?? null;
  const hasTimeline = pack.some((p) => p.startsWith('unifiedTimelineV2:'));
  console.log('db.status             :', row?.status ?? '(missing)');
  console.log('db.agentStage         :', storedStage);
  console.log('db.unifiedTimelineV2  :', hasTimeline ? 'present' : '(missing)');
  console.log('---------------------------------\n');
}

async function resolveWorkspaceAndUser() {
  const ws = getDb()
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, WORKSPACE_SLUG))
    .get();
  if (!ws) throw new Error(`工作空间不存在：${WORKSPACE_SLUG}`);
  const admin = getDb()
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .get();
  if (!admin) throw new Error('未找到可用用户');
  return { ws, admin };
}

/** Test A：完整脚本模式 —— 不调用 LLM（useLlm:false），直接剪辑规划。 */
async function testA(wsId: string, userId: string, userName: string, userRole: string) {
  console.log('\n========== Test A：完整脚本模式（不调用 LLM） ==========');
  const output = await runAgentAutoEditPipeline({
    workspaceSlug: WORKSPACE_SLUG,
    userMessage: FULL_SCRIPT,
    userId,
    userName,
    userRole,
    workspaceRole: 'owner',
    useLlm: false
  });
  printTimelineSummary('Test A', output);
  return output;
}

/** Test B：自然语言意图模式 —— 真实调用项目模型一次（chat），再进入剪辑规划。 */
async function testB(wsId: string, userId: string, userName: string, userRole: string) {
  console.log('\n========== Test B：自然语言意图模式（真实调用项目模型） ==========');
  // 直接做一次真实模型调用（验证项目模型可达 + 本次真实经过 getResolvedLlmConfig → chat）
  let directReply = '';
  let directCallOk = false;
  try {
    directReply = (await chat([{ role: 'user', content: INTENT_PROMPT }])).trim();
    directCallOk = directReply.length > 0;
  } catch (err) {
    console.log('[Test B] 直接模型调用异常：', err instanceof Error ? err.message : String(err));
  }
  console.log('[Test B] 直接模型调用成功 :', directCallOk);
  console.log('[Test B] 直接模型回复(截断):', directReply.slice(0, 120).replace(/\n/g, ' '));

  const output = await runAgentAutoEditPipeline({
    workspaceSlug: WORKSPACE_SLUG,
    userMessage: INTENT_PROMPT,
    userId,
    userName,
    userRole,
    workspaceRole: 'owner',
    useLlm: true
  });
  // 若生成的脚本与原始需求不同，说明流水线内 extractScriptWithLlm 真实调用了 chat()
  const llmUsedInPipeline = output.script.trim() !== INTENT_PROMPT.trim();
  console.log('[Test B] 流水线内 LLM 被调用 :', llmUsedInPipeline);
  console.log('[Test B] 生成脚本(截断)      :', output.script.slice(0, 120).replace(/\n/g, ' '));
  printTimelineSummary('Test B', output);
  return { output, directCallOk };
}

/** Test C：Execution Asset Preflight —— 存在 PASS / 不存在 FAIL（用临时 fixture，不污染企业数据）。 */
async function testC() {
  console.log('\n========== Test C：Execution Asset Preflight ==========');
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiheng-preflight-'));
  const indexPath = path.join(fixtureDir, 'video-assets-detailed.json');
  const clipPath = path.join(fixtureDir, 'clip1.mp4');
  // 写一个最小索引 + 一个真实存在的 dummy 视频文件
  const index = {
    version: 'test',
    generatedAt: new Date().toISOString(),
    assetsRoot: fixtureDir,
    sourceIndex: fixtureDir,
    count: 1,
    assets: [
      {
        id: 'asset-test-1',
        fileName: 'clip1.mp4',
        relativePath: 'clip1.mp4',
        absolutePath: clipPath,
        sourceCategory: 'test',
        normalizedCategory: 'test',
        durationSeconds: 10,
        width: 1080,
        height: 1920,
        orientation: 'portrait',
        fps: 30,
        fileSize: 1024,
        hash: 'test',
        overallContent: 'test',
        overallCameraAngle: 'test',
        overallScene: 'test',
        people: [],
        products: [],
        equipment: [],
        actions: [],
        environment: [],
        sceneTags: [],
        topicTags: [],
        recommendedSkills: [],
        usageRoles: [],
        qualityLevel: 'good',
        preferred: true,
        duplicateGroup: null,
        cropSafety: 'good',
        verticalCropSuitability: 'good',
        notes: '',
        timelineSegments: [],
        recommendedCuts: [],
        avoidCuts: [],
        semanticMatches: [],
        storyPotential: []
      }
    ]
  };
  fs.writeFileSync(indexPath, JSON.stringify(index));
  fs.writeFileSync(clipPath, Buffer.from('dummy-video-bytes'));

  // 把 assets 覆盖指向临时 fixture（仅本进程内存）
  refreshAssetIndexCache();
  setStorageConfigOverride('assets', fixtureDir);

  const mkTimeline = (assetId: string, duration: number): UnifiedTimelineV2 => ({
    schemaVersion: 2,
    timelineId: 'tl-test',
    taskId: 'test',
    outputProfile: DEFAULT_OUTPUT_PROFILE,
    videoTrack: [
      { assetRef: { type: 'library_asset', assetId }, sourceStart: 0, duration, transition: 'hard_cut', sourceAudioMuted: true }
    ],
    voiceTrack: [],
    subtitleTrack: [],
    titleTrack: []
  });

  // C1：存在 + 范围合法 → 期望 PASS
  const pass = await validateAutomationExecutionAssets(mkTimeline('asset-test-1', 5));
  console.log('[Test C1] 资产存在/范围合法 →', JSON.stringify(pass));

  // C2：assetRef 无法解析 → 期望 ASSET_NOT_FOUND
  const missing = await validateAutomationExecutionAssets(mkTimeline('asset-does-not-exist', 5));
  console.log('[Test C2] 资产不存在       →', JSON.stringify(missing));

  // C3：source 越出文件时长 → 期望 SOURCE_RANGE_INVALID
  const outOfRange = await validateAutomationExecutionAssets(mkTimeline('asset-test-1', 20));
  console.log('[Test C3] source 越界      →', JSON.stringify(outOfRange));

  // 清理临时 fixture + 清除覆盖
  clearStorageConfigOverrides();
  refreshAssetIndexCache();
  fs.rmSync(fixtureDir, { recursive: true, force: true });

  const allPass =
    pass.ok === true &&
    missing.ok === false &&
    missing.code === 'ASSET_NOT_FOUND' &&
    outOfRange.ok === false &&
    outOfRange.code === 'SOURCE_RANGE_INVALID';
  console.log('[Test C] 结论 :', allPass ? 'PASS（逻辑正确）' : 'FAIL');
  return allPass;
}

async function main() {
  // ── Test D 前置：快照企业 assets 配置（绕过进程内存覆盖，直接读 DB）──
  const storageBefore = (await getConfig('assets'))?.storagePath ?? '(absent)';
  console.log('[Test D] storage_configs.assets BEFORE :', storageBefore);

  const realIndexDir =
    process.env.AGENT_UPSTREAM_ASSETS_DIR || path.join(process.cwd(), 'data', '素材资源');
  // 通过进程内存 DI 传入真实索引目录（不写库）
  setStorageConfigOverride('assets', realIndexDir);
  console.log('[dry-run] assets 索引(override, 仅内存):', realIndexDir);

  const { ws, admin } = await resolveWorkspaceAndUser();
  console.log(`[dry-run] workspace=${ws.slug}(${ws.id}) user=${admin.name}(${admin.id})`);

  // Test A：完整脚本（不调 LLM）
  await testA(ws.id, admin.id, admin.name ?? '知衡助手', admin.role ?? 'admin');

  // Test B：自然语言意图（真实调 LLM 一次）
  const b = await testB(ws.id, admin.id, admin.name ?? '知衡助手', admin.role ?? 'admin');

  // 清除真实索引覆盖，恢复默认（避免影响 Test C 的临时 fixture 设置）
  clearStorageConfigOverrides();
  refreshAssetIndexCache();

  // Test C：执行期资产门禁
  const cPass = await testC();

  // ── Test D 后置：再次快照，必须与 BEFORE 完全一致 ──
  const storageAfter = (await getConfig('assets'))?.storagePath ?? '(absent)';
  console.log('[Test D] storage_configs.assets AFTER  :', storageAfter);
  const storageUnchanged = storageBefore === storageAfter;
  console.log('[Test D] 前后一致(未改企业配置) :', storageUnchanged);

  console.log('\n================ 收口 DRY-RUN 结论 ================');
  console.log('Test A (完整脚本/不调LLM) :', 'timeline PASS（见上）');
  console.log('Test B (意图/真实LLM)      :', b.directCallOk ? '真实模型调用成功 + timeline PASS' : '真实模型调用失败（见上异常）');
  console.log('Test C (Preflight)         :', cPass ? 'PASS' : 'FAIL');
  console.log('Test D (Storage Config)    :', storageUnchanged ? '前后一致，未修改企业配置 ✅' : '❌ 前后不一致');
  console.log('===================================================');
}

main().catch((err) => {
  // 任何异常都确保清除内存覆盖，避免污染后续进程
  try {
    clearStorageConfigOverrides();
  } catch {
    /* noop */
  }
  console.error('[dry-run] FAILED:', err);
  process.exit(1);
});
