import { NextResponse, type NextRequest } from 'next/server';
import {
  executeAutomationVideoDraftTask,
  getTaskExecutionSnapshot
} from '@/lib/workspaces/automation-editing';
import { startMoneyPrinterTaskWorker } from '@/lib/workspaces/moneyprinter-engine';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<unknown> };

export async function POST(_request: NextRequest, { params }: Ctx) {
  const { workspaceSlug, taskId } = (await params) as { workspaceSlug: string; taskId: string };
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  try {
    const { task, snapshot } = await executeAutomationVideoDraftTask(
      result.context.workspace.id,
      taskId
    );
    startMoneyPrinterTaskWorker(taskId);
    return NextResponse.json({
      task,
      executionSnapshot: task ? (getTaskExecutionSnapshot(task) ?? snapshot) : snapshot
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'execution_validation',
        message: error instanceof Error ? error.message : '任务确认执行失败'
      },
      { status: 400 }
    );
  }
}
