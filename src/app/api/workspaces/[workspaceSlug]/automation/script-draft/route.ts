import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { findVideoScriptStyle } from '@/features/workspaces/automation-editing/script-styles';
import { generateVideoScriptDraft } from '@/lib/workspaces/script-generation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ workspaceSlug: string }> };

/**
 * 自动剪辑 —— 脚本草案生成。
 *
 * 输入：{ topic?: string, styleId: string }
 * 输出：{ ok: true, styleId, styleName, keywords, script, charCount, estimatedDurationSec }
 *
 * 只生成脚本草案（供页面预览 / 编辑 / 确认），不进入正式自动剪辑链路。
 * 正式链路仍由 /automation/agent-run（一键生成）触发。
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const styleId = typeof body.styleId === 'string' ? body.styleId : '';
  const topic = typeof body.topic === 'string' ? body.topic : '';

  const style = findVideoScriptStyle(styleId);
  if (!style) {
    return NextResponse.json(
      { error: 'validation', message: '未知脚本风格：' + styleId },
      { status: 400 }
    );
  }

  try {
    const draft = await generateVideoScriptDraft({ topic, style });
    return NextResponse.json({ ok: true, ...draft });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'script_generation_failed',
        message: error instanceof Error ? error.message : '脚本生成失败，请稍后重试'
      },
      { status: 500 }
    );
  }
}
