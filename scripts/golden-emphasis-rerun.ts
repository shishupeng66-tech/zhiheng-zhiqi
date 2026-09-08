/**
 * 节内重点词 / 全篇视觉包装 —— 黄金链路重跑（LLM 逐节规划 → 独立文本对象 Text Overlay）。
 *
 * 验证：LLM 阅读整篇脚本逐节判断哪些信息值得视觉强化（text_single / text_group / sticker /
 * none），生成 visualPackagingPlan 保存到任务数据；执行层用「独立 Text Overlay 多轨机制」
 * （一个信息 = 一个独立文本对象，时间重叠、固定槽位、向上弹入/烟雾消散）；sticker 无可靠
 * 资源时降级 text_group；keywordTrack 置空；subtitle 36 条 TTS_NATIVE 不退化、titleTrack=0。
 *
 * 用法（仓库根目录）：
 *   npx tsx scripts/golden-emphasis-rerun.ts
 *
 * 环境依赖（脚本内已设置）：
 *   DATABASE_PATH=./data/zhiheng_local.db
 *   VOICE_SERVICE_URL=http://127.0.0.1:5015
 *   VOICE_DEFAULT_ID=zh_male_guanggaojieshuo_uranus_bigtts
 *   ZHIHENG_DRAFT_NAME_PREFIX=ZHIHENG-GOLDEN-FULL-PACKAGING
 *   ZHIHENG_PJD_ROOT=D:\剪映智剪测试\pyJianYingDraft-fork-v0
 *   ZHIJING_PYTHON=D:\剪映智剪测试\poc-venv\Scripts\python.exe
 */
process.env.DATABASE_PATH = process.env.DATABASE_PATH || './data/zhiheng_local.db';
process.env.VOICE_SERVICE_URL = process.env.VOICE_SERVICE_URL || 'http://127.0.0.1:5015';
process.env.VOICE_DEFAULT_ID =
  process.env.VOICE_DEFAULT_ID || 'zh_male_guanggaojieshuo_uranus_bigtts';
process.env.ZHIHENG_DRAFT_NAME_PREFIX =
  process.env.ZHIHENG_DRAFT_NAME_PREFIX || 'ZHIHENG-GOLDEN-RESOURCE-DIRECTOR';
process.env.ZHIHENG_PJD_ROOT =
  process.env.ZHIHENG_PJD_ROOT || 'D:\\剪映智剪测试\\pyJianYingDraft-fork-v0';
process.env.ZHIJING_PYTHON =
  process.env.ZHIJING_PYTHON || 'D:\\剪映智剪测试\\poc-venv\\Scripts\\python.exe';

import { runAgentAutoEditPipeline } from '../src/lib/workspaces/agent-auto-edit';
import { executeJianYingDraftTask } from '../src/lib/workspaces/jianying-assembly';

/** 固定测试脚本（规格第一节 7 句，以 。 分隔；不改脚本/不改 voice/不改 speed）。 */
const FIXED_SCRIPT = [
  '如果你想做一款饮料，但连配方方向、包装形式、渠道定位都还没想清楚，就直接问工厂最低多少钱一瓶，这一步很容易踩坑。',
  '因为饮料代加工的报价，不是只由一瓶水决定的。',
  '它会受到配方复杂度、原料成本、包装形式、起订量、生产工艺、打样次数和质检要求影响。',
  '同样是饮料，低糖茶、果汁、功能饮料、气泡饮料，成本结构完全不一样。',
  '如果前期需求没说清楚，工厂只能给你一个很粗的价格，后面一改配方、一换瓶型、一加功能成分，价格就可能完全变掉。',
  '所以真正靠谱的做法不是先追最低价，而是先把产品方向确认清楚，再让工厂根据方案评估成本。',
  '做饮料项目，先确认方案，再谈报价，才不会越做越乱。'
].join('\n');

async function main() {
  const t0 = Date.now();
  console.log('[golden-emphasis-rerun] 开始黄金链路…');
  const output = await runAgentAutoEditPipeline({
    workspaceSlug: 'enterprise-media',
    userMessage: FIXED_SCRIPT,
    userId: '8cc706ae-0869-432f-a19a-10d99c5071e2',
    userName: '管理员',
    userRole: 'admin',
    workspaceRole: 'editor',
    useLlm: false
  });
  const t1 = Date.now();
  console.log(
    `[golden-emphasis-rerun] 上游完成 stage=${output.stage} taskId=${output.taskId} ` +
      `script=${output.script.length}字 candidate=${output.candidateCount} ` +
      `asset=${output.assetCount} recommendedCuts=${output.recommendedCutsUsed} ` +
      `avoidCuts=${output.avoidCutsCount} 耗时=${((t1 - t0) / 1000).toFixed(1)}s`
  );
  console.log('[golden-emphasis-rerun] validation.valid=', output.validation.valid);
  if (!output.validation.valid) {
    console.log('[golden-emphasis-rerun] validation.errors=', JSON.stringify(output.validation.errors));
  }

  // 打印 LLM 全篇视觉包装规划（titleHook + sections + resourceSelection）
  const plan = (output.visualPackagingPlan ?? { sections: [] }) as {
    titleHook?: { displayText?: string; reason?: string; resourceSelection?: Record<string, unknown> };
    sections: Array<{
      sectionId: number;
      sectionText: string;
      layoutMode?: string;
      packaging?: Array<{
        type: string;
        sourceText?: string;
        displayText?: string;
        targetText?: string;
        groupItems?: Array<{ sourceText?: string; displayText?: string } | string>;
        resourceSelection?: Record<string, unknown>;
        reason?: string;
        priority?: number;
      }>;
    }>;
  };
  console.log(
    `\n[golden-emphasis-rerun] === LLM 视觉包装规划（${plan.sections?.length ?? 0} 节，含资源选择）===`
  );
  if (plan.titleHook?.displayText) {
    console.log(
      `titleHook: ${plan.titleHook.displayText}（${plan.titleHook.reason ?? ''}）资源=${JSON.stringify(plan.titleHook.resourceSelection ?? {})}`
    );
  }
  for (const sec of plan.sections ?? []) {
    console.log(`第${sec.sectionId}节 [${sec.layoutMode ?? 'small_emphasis'}]：${sec.sectionText}`);
    for (const p of sec.packaging ?? []) {
      const gi = (p.groupItems ?? [])
        .map((g) =>
          typeof g === 'string'
            ? `${g}→${g}`
            : `${g?.sourceText ?? ''}→${g?.displayText ?? ''}`
        )
        .join(' | ');
      console.log(
        `  type=${p.type} source=${JSON.stringify(p.sourceText ?? p.targetText ?? '')} display=${JSON.stringify(p.displayText ?? '')} group=[${gi}] resource=${JSON.stringify(p.resourceSelection ?? {})}`
      );
    }
  }
  const ps = output.visualPackagingStats;
  if (ps) {
    console.log('\n[golden-emphasis-rerun] === 包装统计 ===');
    console.log(JSON.stringify(ps, null, 1));
  }

  // 打印 emphasis 轨明细（独立文本覆盖轨 textOverlayTrack，含 laneIndex）
  const ot = (output.timeline as { textOverlayTrack?: Array<Record<string, unknown>> }).textOverlayTrack ?? [];
  const kt2 = output.timeline.keywordTrack ?? [];
  console.log(`[golden-emphasis-rerun] keywordTrack=${kt2.length}（应为 0） textOverlayTrack=${ot.length} 条（独立文本对象）：`);
  for (const s of ot) {
    console.log(
      `   [${s.id}] text=${JSON.stringify(s.text)} start=${s.start} end=${s.end} lane=${s.laneIndex} slot=${s.slotIndex} x=${s.positionX} y=${s.positionY} eff=${s.effectResourceId}`
    );
  }
  // lane 分布
  const byLane = new Map<number, string[]>();
  for (const s of ot) {
    const l = Number(s.laneIndex ?? 0);
    const arr = byLane.get(l) ?? [];
    arr.push(`${s.text}(${s.start}-${s.end})`);
    byLane.set(l, arr);
  }
  console.log(`\n=== lane 分布（${byLane.size} 条轨道池）===`);
  for (const [l, items] of [...byLane.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Lane ${l + 1}: ${items.join(' → ')}`);
  }

  // 贴图 / 音效
  const stk = (output.timeline as { stickerTrack?: Array<Record<string, unknown>> }).stickerTrack ?? [];
  const sfx = (output.timeline as { packagingSfx?: Array<Record<string, unknown>> }).packagingSfx ?? [];
  console.log(`\n=== 贴图（${stk.length}）===\n`);
  for (const s of stk) {
    console.log(`  ${s.stickerKey} ${s.start}-${s.end} x=${s.positionX} y=${s.positionY}`);
  }
  console.log(`\n=== 音效（${sfx.length}）===\n`);
  for (const s of sfx) {
    console.log(`  ${s.sfxKey} start=${s.start} dur=${s.duration}`);
  }
  // overlap 检查（overlay 允许重叠 —— 这是预期行为；同轨 no-overlap 由独立轨保证）
  const st = output.timeline.subtitleTrack ?? [];
  const sr = new Set(st.map((x) => (x as { source?: string }).source));
  console.log(
    `[golden-emphasis-rerun] subtitleTrack=${st.length} 条, titleTrack=${(output.timeline.titleTrack ?? []).length}, sources=${[...sr].join(',')}`
  );

  if (output.stage === 'ready_for_jianying') {
    console.log('[golden-emphasis-rerun] 切入剪映总装…');
    const assembly = await executeJianYingDraftTask(
      'workspace-enterprise-media',
      output.taskId
    );
    console.log('[golden-emphasis-rerun] assembly status=', assembly.status);
    if (assembly.status === 'ok') {
      console.log(
        `[golden-emphasis-rerun] 草稿生成 OK draftName=${assembly.draftName} ` +
          `duration=${assembly.duration}s tracks=${JSON.stringify(assembly.tracks)}`
      );
      console.log('DRAFT_PATH=' + assembly.draftPath);
    } else {
      console.log('[golden-emphasis-rerun] assembly=', JSON.stringify(assembly, null, 2));
    }
  }

  console.log('TASK_ID=' + output.taskId);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[golden-emphasis-rerun] FAILED:', e);
    process.exit(1);
  });
