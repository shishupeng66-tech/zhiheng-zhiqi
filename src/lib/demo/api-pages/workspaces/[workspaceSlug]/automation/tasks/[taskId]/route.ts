import { NextResponse, type NextRequest } from 'next/server';
import {
  getAutomationVideoTask,
  getTaskAgentPlan,
  getTaskCurrentConfig,
  getTaskExecutionSnapshot,
  parseAutomationVideoTaskInput,
  updateAutomationVideoDraftTask
} from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<unknown> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { workspaceSlug, taskId } = (await params) as { workspaceSlug: string; taskId: string };
  const result = await requireWorkspacePermission(workspaceSlug, 'workspace:view');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const task = getAutomationVideoTask(result.context.workspace.id, taskId);
  if (!task) {
    return NextResponse.json({ error: 'not_found', message: '任务不存在' }, { status: 404 });
  }

  return NextResponse.json({
    task,
    agentPlan: getTaskAgentPlan(task),
    currentConfig: getTaskCurrentConfig(task),
    executionSnapshot: getTaskExecutionSnapshot(task)
  });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug, taskId } = (await params) as { workspaceSlug: string; taskId: string };
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const input = parseAutomationVideoTaskInput(body);
    const task = updateAutomationVideoDraftTask(result.context.workspace.id, taskId, input);
    return NextResponse.json({
      task,
      agentPlan: task ? getTaskAgentPlan(task) : null,
      currentConfig: task ? getTaskCurrentConfig(task) : null,
      executionSnapshot: task ? getTaskExecutionSnapshot(task) : null
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'validation',
        message: error instanceof Error ? error.message : '保存草稿失败'
      },
      { status: 400 }
    );
  }
}
