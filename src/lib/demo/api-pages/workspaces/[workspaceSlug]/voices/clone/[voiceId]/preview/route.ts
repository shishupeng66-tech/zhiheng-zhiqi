/**
 * Phase 3-A · 声音复刻试听
 *
 *   GET /api/workspaces/[workspaceSlug]/voices/clone/[voiceId]/preview
 *
 * 直接读取 voice_clones.demoAudioPath 返回 audio/mpeg。
 * 鉴权：scripts:manage（与提交时同）。
 */
import { type NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';

import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { getDb } from '@/lib/db';
import { voiceClones } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ workspaceSlug: string; voiceId: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { workspaceSlug, voiceId } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'scripts:manage');
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        message: result.reason === 'unauthenticated' ? '请先登录。' : '权限不足。'
      },
      {
        status: result.reason === 'unauthenticated' ? 401 : 403
      }
    );
  }

  const db = getDb();
  const row = db.select().from(voiceClones).where(eq(voiceClones.id, voiceId)).get();

  if (!row) {
    return NextResponse.json(
      { error: 'not_found', message: '未找到该复刻记录。' },
      { status: 404 }
    );
  }

  if (row.status !== 'ready' || !row.demoAudioPath) {
    return NextResponse.json(
      {
        error: 'not_ready',
        message: `复刻尚未就绪（当前 status=${row.status}）。`
      },
      { status: 409 }
    );
  }

  if (!fs.existsSync(row.demoAudioPath)) {
    return NextResponse.json(
      {
        error: 'missing_demo_audio',
        message: `试听文件不存在（${row.demoAudioPath}）。`
      },
      { status: 410 }
    );
  }

  const buffer = fs.readFileSync(row.demoAudioPath);
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'private, max-age=300'
    }
  });
}
