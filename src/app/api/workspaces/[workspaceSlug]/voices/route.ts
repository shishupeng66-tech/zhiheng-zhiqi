import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { listVoices, countVoices, countEnabledVoices } from '@/lib/voice-catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const workspaceSlug = (await params).workspaceSlug;
  const result = await requireWorkspacePermission(workspaceSlug, 'scripts:manage');
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        message: result.reason === 'unauthenticated' ? '请先登录。' : '权限不足。'
      },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get('search')?.trim() || undefined;
  const gender = searchParams.get('gender')?.trim() || undefined;
  const enabledOnly = searchParams.get('enabledOnly') === 'true';
  const scene = searchParams.get('scene')?.trim() || undefined;
  const language = searchParams.get('language')?.trim() || undefined;

  const voices = listVoices({ search, gender, enabledOnly, scene, language });

  return NextResponse.json({
    voices,
    total: countVoices(),
    enabledCount: countEnabledVoices(),
    filteredCount: voices.length
  });
}
