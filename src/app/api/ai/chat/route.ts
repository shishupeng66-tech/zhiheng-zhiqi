import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { stream, type ChatMessage } from '@/lib/ai';
import { getPath } from '@/lib/storage';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const normalized: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const role = record.role;
    const content = record.content;
    if (
      (role !== 'system' && role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string' ||
      !content.trim()
    ) {
      continue;
    }
    normalized.push({ role, content: content.trim() });
  }
  return normalized.slice(-20);
}

/** 会话文件名：<userId>-<sessionId>.json */
function sessionFileName(userId: string, sessionId: string) {
  return `${userId}-${sessionId}.json`;
}

/** 追加保存一条消息到聊天记录（客户企业数据，位于 chats 目录） */
async function appendChatRecord(
  userId: string,
  sessionId: string,
  message: { role: 'user' | 'assistant'; content: string }
) {
  try {
    const chatsDir = await getPath('chats');
    await fs.mkdir(chatsDir, { recursive: true });
    const filePath = path.join(chatsDir, sessionFileName(userId, sessionId));
    let records: { role: 'user' | 'assistant'; content: string; at: string }[] = [];
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.messages)) {
        records = parsed.messages;
      }
    } catch {
      // 首次写入
    }
    records.push({ ...message, at: new Date().toISOString() });
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          sessionId,
          userId,
          messages: records,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch {
    // 聊天记录落盘失败不影响对话本身
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const messages = normalizeMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return NextResponse.json({ error: 'invalid_messages' }, { status: 400 });
  }

  // 会话 ID：客户端可传（恢复历史），否则新建
  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : randomUUID();

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let assistantText = '';
      try {
        const prompt: ChatMessage[] = [
          {
            role: 'system',
            content:
              '你是知衡智企企业 AI 助手。回答要直接、务实，围绕企业管理、AI 工作空间、自动化剪辑、知识资产与业务流程。不要暴露模型供应商、模型 ID、Base URL 或 API 信息。'
          },
          ...messages
        ];
        for await (const chunk of stream(prompt)) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch {
        controller.enqueue(encoder.encode('AI服务暂时不可用，请稍后重试。'));
      } finally {
        // 落盘：用户最后一条消息 + 助手回复
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUser) {
          await appendChatRecord(user.id, sessionId, {
            role: 'user',
            content: lastUser.content
          });
        }
        if (assistantText.trim()) {
          await appendChatRecord(user.id, sessionId, {
            role: 'assistant',
            content: assistantText.trim()
          });
        }
        controller.close();
      }
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Session-Id': sessionId
    }
  });
}
