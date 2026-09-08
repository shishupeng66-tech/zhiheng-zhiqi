import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { runTemplateRoute } from '@/lib/workspaces/template-route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 模板分步生成 · 第一步：生成方案（脚本文案 + 素材计划），不生成草稿。
 * POST /api/workspaces/:slug/automation/template-plan
 * body: { templateId, businessContext }
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

  let body: { templateId?: string; businessContext?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }
  if (!body.templateId) {
    return NextResponse.json({ ok: false, error: 'MISSING_TEMPLATE_ID' }, { status: 400 });
  }

  const result = await runTemplateRoute({
    workspaceSlug,
    templateId: body.templateId,
    businessContext: body.businessContext || '',
    stage: 'script'
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || '生成方案失败' }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    templateId: result.templateId,
    textFillCount: result.textFillCount,
    textFillTotal: result.textFillTotal,
    constraintFailures: result.constraintFailures ?? [],
    mediaPlanCount: result.mediaPlanCount ?? 0,
    textPlan: result.textPlan ?? {},
    mediaPlan: result.mediaPlan ?? {}
  });
}
