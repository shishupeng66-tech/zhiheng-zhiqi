import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { runTemplateRoute } from '@/lib/workspaces/template-route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 模板分步生成 · 第二步：使用用户确认的方案完整生成剪映草稿。
 * POST /api/workspaces/:slug/automation/template-finalize
 * body: {
 *   templateId,
 *   businessContext,
 *   explicitTextPlan,   // 用户确认后的 slotId → 文本（第一步 template-plan 返回）
 *   mediaPlan?,         // 可选覆盖素材计划
 *   draftName?
 * }
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ workspaceSlug: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { workspaceSlug } = await ctx.params;
  const ws = getWorkspaceBySlug(workspaceSlug);
  if (!ws) return NextResponse.json({ ok: false, error: 'WORKSPACE_NOT_FOUND' }, { status: 404 });

  let body: {
    templateId?: string;
    businessContext?: string;
    explicitTextPlan?: Record<string, string>;
    mediaPlan?: Record<string, unknown>;
    draftName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }
  if (!body.templateId) {
    return NextResponse.json({ ok: false, error: 'MISSING_TEMPLATE_ID' }, { status: 400 });
  }
  if (!body.explicitTextPlan || Object.keys(body.explicitTextPlan).length === 0) {
    return NextResponse.json({ ok: false, error: 'MISSING_TEXT_PLAN' }, { status: 400 });
  }

  const result = await runTemplateRoute({
    workspaceSlug,
    templateId: body.templateId,
    businessContext: body.businessContext || '',
    stage: 'final',
    explicitTextPlan: body.explicitTextPlan,
    mediaPlan: body.mediaPlan as never,
    draftName: body.draftName
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error || '生成剪映草稿失败',
        textFillCount: result.textFillCount,
        textFillTotal: result.textFillTotal,
        constraintFailures: result.constraintFailures ?? [],
        mediaPlanCount: result.mediaPlanCount ?? 0
      },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    task: { id: result.draftName, status: 'ready', title: result.draftName },
    draftName: result.draftName,
    draftPath: result.draftPath,
    templateId: result.templateId,
    textFillCount: result.textFillCount,
    textFillTotal: result.textFillTotal,
    constraintFailures: result.constraintFailures ?? [],
    mediaPlanCount: result.mediaPlanCount ?? 0,
    structureVerified: result.structureVerified,
    voice: result.voice,
    stage: 'final'
  });
}
