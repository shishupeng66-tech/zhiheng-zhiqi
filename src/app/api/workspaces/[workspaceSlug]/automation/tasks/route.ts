import { NextResponse, type NextRequest } from 'next/server';
import {
  createAutomationVideoTask,
  listAutomationVideoAssets,
  listAutomationVideoTasks,
  parseAutomationVideoTaskInput,
  regenerateAutomationVideoTask,
  softDeleteAutomationVideoTask
} from '@/lib/workspaces/automation-editing';
import {
  getMoneyPrinterEngineStatus,
  startMoneyPrinterTaskWorker
} from '@/lib/workspaces/moneyprinter-engine';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ workspaceSlug: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'workspace:view');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  return NextResponse.json({
    tasks: listAutomationVideoTasks(result.context.workspace.id),
    assets: listAutomationVideoAssets(result.context.workspace.id),
    engine: getMoneyPrinterEngineStatus()
  });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: '请求数据格式错误' },
      { status: 400 }
    );
  }

  try {
    const input = parseAutomationVideoTaskInput(body);
    const task = createAutomationVideoTask(
      result.context.workspace.id,
      result.context.user.id,
      input
    );
    startMoneyPrinterTaskWorker(task.id);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'validation', message: error instanceof Error ? error.message : '参数校验失败' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';
  if (!taskId) {
    return NextResponse.json({ error: 'validation', message: '缺少任务 ID' }, { status: 400 });
  }

  regenerateAutomationVideoTask(result.context.workspace.id, taskId);
  startMoneyPrinterTaskWorker(taskId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'review:approve');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const taskId = request.nextUrl.searchParams.get('taskId') ?? '';
  if (!taskId) {
    return NextResponse.json({ error: 'validation', message: '缺少任务 ID' }, { status: 400 });
  }

  softDeleteAutomationVideoTask(result.context.workspace.id, taskId);
  return NextResponse.json({ ok: true });
}
