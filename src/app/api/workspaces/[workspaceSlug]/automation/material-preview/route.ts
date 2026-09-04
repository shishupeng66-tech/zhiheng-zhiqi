import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspacePermission, getWorkspaceBySlug } from '@/lib/workspaces/service';
import { createVideoPlanTool } from '@/lib/agent/tools';
import type { ToolExecutionContext } from '@/lib/agent/tool-registry';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ workspaceSlug: string }> };

/**
 * 自动剪辑 —— 素材匹配预览（真实执行 search_video_assets + create_video_plan）。
 *
 * 输入：{ script?: string }
 * 输出：{ ok, total, segments: [{ order, fileName, scriptText, sourceStart, sourceEnd, durationSec, matchLevel, matchScore }] }
 *
 * 只做素材匹配预览，不落库、不生成任务、不进入正式剪辑链路（正式链路仍由 agent-run 触发）。
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const script = typeof body.script === 'string' ? body.script.trim() : '';
  if (!script) {
    return NextResponse.json(
      { error: 'validation', message: '缺少脚本内容，请先生成或输入脚本' },
      { status: 400 }
    );
  }

  const workspace = getWorkspaceBySlug(workspaceSlug);
  if (!workspace) {
    return NextResponse.json(
      { error: 'workspace_not_found', message: '工作空间不存在' },
      { status: 404 }
    );
  }

  const context = result.context as unknown as {
    user?: { id?: string; name?: string; role?: string };
    workspaceRole?: string;
  };
  const ctx: ToolExecutionContext = {
    userId: context.user?.id ?? '',
    userName: context.user?.name ?? '知衡助手',
    userRole: context.user?.role ?? 'member',
    workspaceId: workspace.id,
    workspaceRole: context.workspaceRole ?? 'editor'
  };

  try {
    const plan = await createVideoPlanTool.execute(
      {
        userRequest: script,
        script,
        platform: '抖音',
        targetDuration: 30,
        videoRatio: '9:16'
      },
      ctx
    );

    const segments = (plan.timeline ?? []).map((item) => ({
      order: item.order,
      fileName:
        item.asset?.fileName ?? item.asset?.relativePath?.split('/').pop() ?? `素材${item.order}`,
      scriptText: (item.scriptText ?? '').trim(),
      sourceStart: item.asset?.sourceStart ?? null,
      sourceEnd: item.asset?.sourceEnd ?? null,
      durationSec:
        item.asset?.sourceStart != null && item.asset?.sourceEnd != null
          ? Math.round((item.asset.sourceEnd - item.asset.sourceStart) * 10) / 10
          : 0,
      matchLevel: item.matchLevel ?? '',
      matchScore: item.matchScore ?? 0
    }));

    return NextResponse.json({ ok: true, total: segments.length, segments });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'material_preview_failed',
        message: error instanceof Error ? error.message : '素材匹配失败，请稍后重试'
      },
      { status: 500 }
    );
  }
}
