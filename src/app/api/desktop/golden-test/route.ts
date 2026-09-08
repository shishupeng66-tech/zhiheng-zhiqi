import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { runAgentAutoEditPipeline } from '@/lib/workspaces/agent-auto-edit';
import { executeJianYingDraftTask } from '@/lib/workspaces/jianying-assembly';

/**
 * 桌面固定黄金测试（Agent-native Editing 全链路）：
 *   Product UI → Agent → 素材检索 → LLM(视觉包装规划) → TTS → Timeline → Validator
 *   → Preflight → JianYingAdapter → Worker EXE → pyJianYingDraft → 剪映草稿
 *
 * 与开发期 scripts/golden-emphasis-rerun.ts 同一脚本/同一 voice/同一链路；
 * userId 从本地 DB 动态取超级管理员（不硬编码），不改剪辑语义。
 */

const FIXED_SCRIPT = [
  '如果你想做一款饮料，但连配方方向、包装形式、渠道定位都还没想清楚，就直接问工厂最低多少钱一瓶，这一步很容易踩坑。',
  '因为饮料代加工的报价，不是只由一瓶水决定的。',
  '它会受到配方复杂度、原料成本、包装形式、起订量、生产工艺、打样次数和质检要求影响。',
  '同样是饮料，低糖茶、果汁、功能饮料、气泡饮料，成本结构完全不一样。',
  '如果前期需求没说清楚，工厂只能给你一个很粗的价格，后面一改配方、一换瓶型、一加功能成分，价格就可能完全变掉。',
  '所以真正靠谱的做法不是先追最低价，而是先把产品方向确认清楚，再让工厂根据方案评估成本。',
  '做饮料项目，先确认方案，再谈报价，才不会越做越乱。'
].join('\n');

function getAdminUser() {
  const db = getDb();
  const admin = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, 'super_admin'))
    .limit(1)
    .get();
  return admin;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const withAssembly = body.assembly !== false;

  const admin = getAdminUser();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'blocked',
        error: '未找到超级管理员，请先完成首次初始化（桌面控制台 → 首次初始化）'
      },
      { status: 400 }
    );
  }

  const log: string[] = [];
  const push = (m: string) => {
    log.push(m);
    console.log(`[desktop-golden] ${m}`);
  };

  try {
    const t0 = Date.now();
    push('开始黄金链路（Agent-native Editing）…');
    const output = await runAgentAutoEditPipeline({
      workspaceSlug: 'enterprise-media',
      userMessage: FIXED_SCRIPT,
      userId: admin.id,
      userName: admin.name || '管理员',
      userRole: 'admin',
      workspaceRole: 'admin',
      useLlm: false
    });
    const t1 = Date.now();
    push(
      `上游完成 stage=${output.stage} taskId=${output.taskId} script=${output.script.length}字 candidate=${output.candidateCount} asset=${output.assetCount} recommendedCuts=${output.recommendedCutsUsed} avoidCuts=${output.avoidCutsCount} 耗时=${((t1 - t0) / 1000).toFixed(1)}s`
    );
    push(`validation.valid=${output.validation.valid}`);
    if (!output.validation.valid) {
      push(`validation.errors=${JSON.stringify(output.validation.errors)}`);
    }

    const timeline = output.timeline as {
      subtitleTrack?: unknown[];
      titleTrack?: unknown[];
      textOverlayTrack?: unknown[];
      keywordTrack?: unknown[];
    };
    push(
      `subtitleTrack=${timeline.subtitleTrack?.length ?? 0} titleTrack=${timeline.titleTrack?.length ?? 0} textOverlayTrack=${timeline.textOverlayTrack?.length ?? 0} keywordTrack=${timeline.keywordTrack?.length ?? 0}`
    );

    let assembly = null;
    if (output.stage === 'ready_for_jianying' && withAssembly) {
      push('切入剪映总装…');
      assembly = await executeJianYingDraftTask('workspace-enterprise-media', output.taskId);
      push(`assembly status=${assembly.status}`);
      if (assembly.status === 'ok') {
        push(
          `草稿生成 OK draftName=${assembly.draftName} duration=${assembly.duration}s tracks=${JSON.stringify(assembly.tracks)}`
        );
        push(`DRAFT_PATH=${assembly.draftPath}`);
      } else {
        push(`assembly=${JSON.stringify(assembly)}`);
      }
    }

    return NextResponse.json({
      ok: output.validation.valid && (!withAssembly || (assembly && assembly.status === 'ok')),
      stage: output.stage,
      taskId: output.taskId,
      validation: {
        valid: output.validation.valid,
        errors: output.validation.errors,
        warnings: output.validation.warnings
      },
      timelineStats: {
        subtitleTrack: timeline.subtitleTrack?.length ?? 0,
        titleTrack: timeline.titleTrack?.length ?? 0,
        textOverlayTrack: timeline.textOverlayTrack?.length ?? 0,
        keywordTrack: timeline.keywordTrack?.length ?? 0
      },
      assembly:
        assembly && assembly.status === 'ok'
          ? {
              status: assembly.status,
              draftName: assembly.draftName,
              draftPath: assembly.draftPath,
              duration: assembly.duration,
              tracks: assembly.tracks
            }
          : assembly
            ? { status: assembly.status }
            : null,
      log,
      elapsedMs: Date.now() - t0
    });
  } catch (err) {
    push(`FAILED: ${(err as Error).message}`);
    return NextResponse.json({ ok: false, stage: 'error', error: (err as Error).message, log });
  }
}
