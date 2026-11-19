import { NextResponse, type NextRequest } from 'next/server';
import {
  generateAutomationVideoCopy,
  generateAutomationVideoKeywords
} from '@/lib/ai/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const workspaceSlug = (await params).workspaceSlug;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, message: 'AI服务暂时不可用，请稍后重试。' },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? '');

  try {
    if (action === 'video_copy') {
      const topic = String(body.topic ?? '').trim();
      if (!topic) {
        return NextResponse.json(
          { error: 'validation', message: '请先输入视频主题。' },
          { status: 400 }
        );
      }
      const payload = await generateAutomationVideoCopy({
        topic,
        style: typeof body.style === 'string' ? body.style : undefined,
        language: typeof body.language === 'string' ? body.language : undefined,
        existingScript: typeof body.existingScript === 'string' ? body.existingScript : undefined
      });
      return NextResponse.json(payload);
    }

    if (action === 'keywords') {
      const script = String(body.script ?? '').trim();
      if (!script) {
        return NextResponse.json(
          { error: 'validation', message: '请先输入视频文案。' },
          { status: 400 }
        );
      }
      const payload = await generateAutomationVideoKeywords(script);
      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: 'unsupported_action' }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'AI服务暂时不可用，请稍后重试。' },
      { status: 503 }
    );
  }
}
