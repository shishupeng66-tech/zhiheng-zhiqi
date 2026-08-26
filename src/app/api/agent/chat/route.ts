import { type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { type ChatMessage } from '@/lib/ai';
import { runAgent, type AgentStreamEvent } from '@/lib/agent/orchestrator';
import type { AgentContext } from '@/lib/agent/types';
import type { ToolExecutionContext } from '@/lib/agent/tool-registry';

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
  // 保留最近 20 条
  return normalized.slice(-20);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const messages = normalizeMessages(body.messages);

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return new Response(JSON.stringify({ error: 'invalid_messages' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 从请求中获取 context（前端传入，但服务端重新校验关键信息）
  const context = body.context as Record<string, unknown> | undefined;
  const route = typeof context?.route === 'string' ? context.route : '';

  // 构建 Agent Context
  // V1：workspace 字段预留，当前用户体系尚未绑定 workspace
  const agentCtx: AgentContext = {
    route,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    },
    workspace: null,
    entity: null
  };

  // 构建 Tool 执行上下文（服务端获取，不信任前端传入的权限信息）
  const toolCtx: ToolExecutionContext = {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    workspaceId: null,
    workspaceRole: null
  };

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent(agentCtx, toolCtx, messages)) {
          const sseLine = formatSseEvent(event);
          controller.enqueue(encoder.encode(sseLine));

          // 如果是错误或 done 事件，关闭流
          if (event.type === 'error' || event.type === 'done') {
            break;
          }
        }
      } catch (e) {
        const errorEvent: AgentStreamEvent = {
          type: 'error',
          error: e instanceof Error ? e.message : '未知错误',
          errorCode: 'stream_error'
        };
        controller.enqueue(encoder.encode(formatSseEvent(errorEvent)));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

/** 将事件对象格式化为 SSE data: 行 */
function formatSseEvent(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
