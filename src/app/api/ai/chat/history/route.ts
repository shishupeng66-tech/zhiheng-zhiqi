import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPath } from '@/lib/storage';
import fs from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface ChatHistoryEntry {
  sessionId: string;
  title: string;
  messageCount: number;
  updatedAt: string | null;
}

/** 会话文件名前缀：<userId>- */
function filePrefix(userId: string) {
  return `${userId}-`;
}

/**
 * GET /api/ai/chat/history
 * 返回当前用户最近的聊天记录（chats 目录），按更新时间倒序，最多 20 个会话。
 * ?sessionId=xxx 返回指定会话完整消息。
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId');

  try {
    const chatsDir = await getPath('chats');
    const prefix = filePrefix(user.id);

    // 指定会话 → 返回完整消息
    if (sessionId) {
      const filePath = path.join(chatsDir, `${prefix}${sessionId}.json`);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return NextResponse.json({
          sessionId,
          messages: Array.isArray(parsed.messages) ? parsed.messages : []
        });
      } catch {
        return NextResponse.json({ sessionId, messages: [] });
      }
    }

    // 全部会话摘要
    let files: string[] = [];
    try {
      files = await fs.readdir(chatsDir);
    } catch {
      files = [];
    }
    const entries: ChatHistoryEntry[] = [];
    for (const file of files) {
      if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
      const sid = file.slice(prefix.length, -'.json'.length);
      try {
        const raw = await fs.readFile(path.join(chatsDir, file), 'utf-8');
        const parsed = JSON.parse(raw);
        const messages: { role: string; content: string }[] = Array.isArray(parsed.messages)
          ? parsed.messages
          : [];
        const firstUser = messages.find((m) => m.role === 'user');
        entries.push({
          sessionId: sid,
          title: firstUser?.content?.slice(0, 40) ?? '（空会话）',
          messageCount: messages.length,
          updatedAt: parsed.updatedAt ?? null
        });
      } catch {
        // 跳过损坏文件
      }
    }
    entries.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    return NextResponse.json({ sessions: entries.slice(0, 20) });
  } catch {
    return NextResponse.json({ error: 'history_read_failed' }, { status: 500 });
  }
}
