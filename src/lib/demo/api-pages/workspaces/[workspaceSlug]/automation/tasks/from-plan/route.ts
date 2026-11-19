import { NextResponse, type NextRequest } from 'next/server';
import {
  createDraftTaskFromVideoPlan,
  getTaskAgentPlan
} from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import type { CreateVideoPlanOutput } from '@/lib/agent/tools';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<unknown> };

function isVideoPlan(value: unknown): value is CreateVideoPlanOutput {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    typeof record.topic === 'string' &&
    typeof record.script === 'string' &&
    Array.isArray(record.timeline) &&
    typeof record.coverage === 'object'
  );
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = (await params) as { workspaceSlug: string };
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const plan = body.plan;
  if (!isVideoPlan(plan)) {
    return NextResponse.json(
      { error: 'validation', message: '缺少有效的视频剪辑方案' },
      { status: 400 }
    );
  }

  const task = createDraftTaskFromVideoPlan(
    result.context.workspace.id,
    result.context.user.id,
    plan
  );

  return NextResponse.json(
    {
      task,
      agentPlan: getTaskAgentPlan(task),
      editorUrl: `/dashboard/workspaces/${workspaceSlug}?taskId=${task.id}`
    },
    { status: 201 }
  );
}
