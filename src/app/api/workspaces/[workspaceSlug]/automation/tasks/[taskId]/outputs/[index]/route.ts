import { NextResponse, type NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAutomationVideoTask } from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<Record<string, string>> };

function isInside(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getEngineTasksDir() {
  const engineDir = path.resolve(
    process.env.MONEYPRINTER_ENGINE_DIR || 'engines/moneyprinterturbo'
  );
  return path.join(engineDir, 'storage', 'tasks');
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { workspaceSlug, taskId, index } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'workspace:view');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const task = getAutomationVideoTask(result.context.workspace.id, taskId);
  const outputIndex = Number(index);
  const filePath = Array.isArray(task?.outputVideos) ? task.outputVideos[outputIndex] : '';
  const engineTasksDir = getEngineTasksDir();

  if (!filePath || !isInside(engineTasksDir, filePath)) {
    return NextResponse.json({ error: 'not_found', message: '视频输出不存在' }, { status: 404 });
  }

  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `inline; filename="${path.basename(filePath)}"`
      }
    });
  } catch {
    return NextResponse.json({ error: 'not_found', message: '视频文件不存在' }, { status: 404 });
  }
}
