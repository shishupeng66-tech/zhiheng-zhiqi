import { NextResponse, type NextRequest } from 'next/server';
import { runAgentAutoEditPipeline } from '@/lib/workspaces/agent-auto-edit';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import {
  executeJianYingDraftTask,
  type JianYingAssemblyResult
} from '@/lib/workspaces/jianying-assembly';
import { updateJianYingAssemblyResult } from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ workspaceSlug: string }> };

/**
 * 自动剪辑 Agent 上游主链真实执行入口。
 *
 * 复用项目既有 Agent 工具（create_video_plan / save_video_plan_as_draft）与默认 LLM 配置，
 * 不调用 MoneyPrinter。默认执行器 = 剪映（JianYingAdapter）：
 *   上游生成 UnifiedTimelineV2 + 校验通过 + agentStage:ready_for_jianying
 *   → 立即切入剪映总装 executeJianYingDraftTask（后台执行，前端轮询任务 API 看进度）。
 * MoneyPrinter 仅保留为旧的手动任务流（tasks POST）的 legacy 执行器，不进本主链。
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
  const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!userMessage) {
    return NextResponse.json(
      { error: 'validation', message: '缺少视频需求或脚本（message）' },
      { status: 400 }
    );
  }

  const useLlm = body.useLlm !== false;
  const context = result.context as unknown as {
    user?: { id?: string; name?: string; role?: string };
    workspaceRole?: string;
  };

  try {
    const output = await runAgentAutoEditPipeline({
      workspaceSlug,
      userMessage,
      userId: context.user?.id ?? '',
      userName: context.user?.name,
      userRole: context.user?.role,
      workspaceRole: context.workspaceRole,
      useLlm
    });

    // 默认执行器 = 剪映：上游就绪后立即切入 JianYing 总装（后台执行，不阻塞 HTTP）。
    // MoneyPrinter 不进入本主链（legacy 仅保留在旧手动任务流）。
    let finalStage = output.stage;
    let assembly: JianYingAssemblyResult | null = null;
    if (output.stage === 'ready_for_jianying') {
      const workspace = getWorkspaceBySlug(workspaceSlug);
      if (workspace) {
        // 先同步置为「正在生成剪映草稿」，让 UI 立刻可见；随后后台真实执行。
        updateJianYingAssemblyResult(workspace.id, output.taskId, 'generating_jianying_draft');
        void Promise.resolve()
          .then(() => executeJianYingDraftTask(workspace.id, output.taskId))
          .then((r) => {
            assembly = r;
          })
          .catch((err) => {
            try {
              updateJianYingAssemblyResult(
                workspace.id,
                output.taskId,
                'failed',
                undefined,
                `剪映草稿生成失败：${err instanceof Error ? err.message : '未知错误'}`
              );
            } catch {
              /* 二次写库失败不再抛出 */
            }
          });
        finalStage = 'generating_jianying_draft';
      }
    }

    return NextResponse.json(
      {
        task: {
          id: output.taskId,
          title: output.plan.title,
          status: 'draft'
        },
        editorUrl: output.editorUrl,
        stage: finalStage,
        videoRatio: output.plan.videoRatio,
        targetDuration: output.plan.targetDuration,
        modelUsed: output.modelUsed,
        candidateCount: output.candidateCount,
        assetCount: output.assetCount,
        recommendedCutsUsed: output.recommendedCutsUsed,
        avoidCutsCount: output.avoidCutsCount,
        coverage: output.coverage,
        script: output.script,
        timeline: output.timeline,
        validation: output.validation,
        jianyingAdapterInterface: output.jianyingAdapterInterface,
        executionEngine: 'jianying'
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'agent_run_failed',
        message: error instanceof Error ? error.message : '自动剪辑 Agent 上游执行失败'
      },
      { status: 500 }
    );
  }
}
