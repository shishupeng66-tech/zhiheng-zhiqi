import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { stream, type ChatMessage } from '@/lib/ai';

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

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
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
          controller.enqueue(encoder.encode(chunk));
        }
      } catch {
        controller.enqueue(encoder.encode('AI服务暂时不可用，请稍后重试。'));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
