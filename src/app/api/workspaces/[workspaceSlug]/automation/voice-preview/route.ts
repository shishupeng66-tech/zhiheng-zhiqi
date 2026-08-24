import { readFile } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { generateVoiceAudio } from '@/lib/voice-service/client';
import { resolveSpeechVoiceId } from '@/lib/voice-service/speech-voice-catalog';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function POST(request: NextRequest, { params }: Ctx) {
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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = String(body.text ?? '').trim();
  if (!text) {
    return NextResponse.json(
      { error: 'validation', message: '请先输入要试听的文案。' },
      { status: 400 }
    );
  }

  try {
    const audio = await generateVoiceAudio({
      text,
      voiceId: resolveSpeechVoiceId(String(body.voiceId ?? 'auto')),
      speed: clampNumber(body.speed, 1, 0.5, 2),
      volume: clampNumber(body.volume, 1, 0, 2),
      emotion: 'neutral',
      style: 'business'
    });
    const buffer = await readFile(audio.audio_path);
    return new Response(buffer, {
      headers: {
        'Content-Type': audio.mime_type || 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Audio-Duration': String(audio.duration),
        'X-Audio-Format': audio.format
      }
    });
  } catch (error) {
    console.error('[voice-preview] failed', error);
    return NextResponse.json(
      { error: 'voice_preview_failed', message: '试听生成失败，请稍后重试。' },
      { status: 500 }
    );
  }
}
