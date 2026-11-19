import { NextResponse, type NextRequest } from 'next/server';
import { fetchVoices, type VoiceServiceVoice } from '@/lib/voice-service/client';
import { automationVoiceOptions } from '@/features/workspaces/automation-editing/voice-options';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

// 当 Voice Service 不可用时使用的降级音色列表（与当前前端默认列表一致）。
function fallbackVoices(): VoiceServiceVoice[] {
  return automationVoiceOptions.map((option) => ({
    id: option.value,
    name: option.label,
    gender: option.gender,
    language: 'zh-cn',
    description: option.category
  }));
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const workspaceSlug = (await params).workspaceSlug;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        message: result.reason === 'unauthenticated' ? '请先登录。' : '权限不足。'
      },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  try {
    const voices = await fetchVoices();
    return NextResponse.json({ voices, source: 'voice-service' });
  } catch (error) {
    console.error('[voices] Voice Service unavailable, using fallback list', error);
    return NextResponse.json({ voices: fallbackVoices(), source: 'fallback' });
  }
}
