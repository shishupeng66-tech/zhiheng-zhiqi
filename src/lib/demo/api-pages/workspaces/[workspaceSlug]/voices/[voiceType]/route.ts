import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { getVoice, setVoiceEnabled } from '@/lib/voice-catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug, voiceType } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'voices:manage');
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        message:
          result.reason === 'unauthenticated'
            ? '请先登录。'
            : '权限不足，仅超级管理员或工作空间所有者可调整业务音色。'
      },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const existing = getVoice(voiceType);
  if (!existing) {
    return NextResponse.json({ error: 'not_found', message: '音色不存在。' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { enabledForProduction?: boolean };
  const enabled = Boolean(body.enabledForProduction);
  const updated = setVoiceEnabled(voiceType, enabled);

  return NextResponse.json({ voice: updated });
}
