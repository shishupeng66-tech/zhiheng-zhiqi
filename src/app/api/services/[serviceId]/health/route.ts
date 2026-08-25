import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  checkHealth,
  recoverService,
  getDeveloperCommands
} from '@/lib/service-manager/auto-start';
import { getService } from '@/lib/service-manager/registry';
import '@/lib/service-manager/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
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

  const health = await checkHealth(serviceId);

  // 兜底自动恢复：发现 offline 时异步触发一次，不阻塞当前响应
  if (health.status === 'offline') {
    void recoverService(serviceId).catch(() => undefined);
  }

  const isSuperAdmin = user.role === 'super_admin';

  return NextResponse.json({
    id: def.id,
    capabilityName: def.capabilityName,
    status: health.status,
    latencyMs: health.latencyMs,
    metrics: health.metrics ?? {},
    error: health.error ?? null,
    autoRecoverAttempted: health.status === 'offline',
    developerCommands: isSuperAdmin ? getDeveloperCommands(serviceId) : null
  });
}
