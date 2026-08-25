import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  recoverService,
  checkHealth,
  getDeveloperCommands
} from '@/lib/service-manager/auto-start';
import { getService } from '@/lib/service-manager/registry';
import '@/lib/service-manager/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/services/[serviceId]/recover
 * 语义：恢复服务在线状态。内部可能执行启动脚本。
 * 所有登录用户可调用。阻塞等待直到成功或超时。
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  const { serviceId } = await params;

  const def = getService(serviceId);
  if (!def) {
    return NextResponse.json({ error: 'not_found', message: '未知服务' }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized', message: '请先登录' }, { status: 401 });
  }

  // 先检查一次，已经在线就直接返回
  const before = await checkHealth(serviceId);
  if (before.status === 'online') {
    return NextResponse.json({
      ok: true,
      status: 'online',
      latencyMs: before.latencyMs,
      metrics: before.metrics ?? {},
      launched: false
    });
  }

  const result = await recoverService(serviceId);
  const after = await checkHealth(serviceId);
  const isSuperAdmin = user.role === 'super_admin';

  if (result.ok && after.status === 'online') {
    return NextResponse.json({
      ok: true,
      status: 'online',
      latencyMs: after.latencyMs,
      metrics: after.metrics ?? {},
      launched: result.launched,
      developerCommands: isSuperAdmin ? getDeveloperCommands(serviceId) : null
    });
  }

  return NextResponse.json(
    {
      ok: false,
      status: 'error',
      error: result.error ?? '恢复失败',
      launched: result.launched,
      developerCommands: isSuperAdmin ? getDeveloperCommands(serviceId) : null
    },
    { status: 200 }
  );
}
