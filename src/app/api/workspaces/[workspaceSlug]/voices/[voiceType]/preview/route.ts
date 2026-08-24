import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { getVoiceServiceUrl } from '@/lib/voice-service/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

/**
 * 实时生成指定音色的试听音频：服务端代理到本地 Voice Service 的 /v1/tts/preview，
 * 由 Voice Service 按 (voice_type, 文本, 参数) 缓存 mp3。任何工作空间成员（scripts:manage）
 * 均可试听。
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug, voiceType } = await params;
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
  const text = searchParams.get('text')?.slice(0, 200) || undefined;
  const speed = Number(searchParams.get('speed') ?? '1');
  const volume = Number(searchParams.get('volume') ?? '1');

  const url = `${getVoiceServiceUrl()}/v1/tts/preview?voice_type=${encodeURIComponent(
    voiceType
  )}${text ? `&text=${encodeURIComponent(text)}` : ''}&speed=${Number.isFinite(speed) ? speed : 1}&volume=${
    Number.isFinite(volume) ? volume : 1
  }`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'preview_failed', message: '试听生成失败，请稍后重试。' },
        { status: 502 }
      );
    }
    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(buffer.byteLength)
      }
    });
  } catch (error) {
    console.error('[voices:preview] 代理试听失败', error);
    return NextResponse.json(
      { error: 'preview_failed', message: '无法连接语音服务。' },
      { status: 502 }
    );
  }
}
