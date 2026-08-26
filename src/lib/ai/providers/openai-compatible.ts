import type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  ChatToolCall,
  LlmProviderConfig,
  StreamDelta,
  StreamOptions
} from '../types';

/**
 * OpenAI 兼容适配器（v1 唯一实现）。
 * 适用于 OpenAI / DeepSeek / VolcEngine Ark / 任意 OpenAI 兼容网关：
 * 仅需切换 baseUrl 与 model，无需为每个厂商重复代码。
 *
 * 不在此处引入任何第三方 SDK，直接使用 fetch，保持零额外依赖与可控的超时/错误处理。
 */

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/** 判断错误是否为 "不支持 tool calling" 类型 */
export function isToolUnsupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('unsupported') ||
    msg.includes('tool_choice') ||
    msg.includes('tool_calls') ||
    msg.includes('function call') ||
    msg.includes('function_call') ||
    msg.includes('不支持') ||
    msg.includes('invalid tool') ||
    msg.includes('invalid function')
  );
}

/** 非流式 chat 调用（支持 tools） */
export async function openaiCompatibleChat(
  config: LlmProviderConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<ChatResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      stream: false,
      temperature: opts.temperature ?? 0.7
    };

    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
      if (opts.tool_choice) {
        body.tool_choice = opts.tool_choice;
      }
    }

    const res = await fetch(buildUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: opts.signal ?? controller.signal
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`LLM 请求失败（${res.status}）：${txt.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: ChatToolCall[];
        };
        finish_reason?: string;
      }>;
    };

    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? '';
    const toolCalls = choice?.message?.tool_calls ?? [];
    const finishReason = choice?.finish_reason ?? 'unknown';

    return { text, toolCalls, latencyMs: Date.now() - started, finishReason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 流式生成：解析 SSE data: 帧，产出 StreamDelta 事件。
 * 支持 content delta 和 tool_call delta。
 */
export async function* openaiCompatibleStream(
  config: LlmProviderConfig,
  messages: ChatMessage[],
  opts: StreamOptions = {}
): AsyncGenerator<StreamDelta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120000);
  let res: Response;
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7
    };

    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
      if (opts.tool_choice) {
        body.tool_choice = opts.tool_choice;
      }
    }

    res = await fetch(buildUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(body),
      signal: opts.signal ?? controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM 流式请求失败（${res.status}）：${txt.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          yield { type: 'done' };
          return;
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  type?: string;
                  function?: {
                    name?: string;
                    arguments?: string;
                  };
                }>;
              };
              finish_reason?: string;
            }>;
          };

          const choice = json.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (delta?.content) {
            yield { type: 'content', content: delta.content };
          }

          if (delta?.tool_calls && delta.tool_calls.length > 0) {
            for (const tc of delta.tool_calls) {
              yield {
                type: 'tool_call',
                toolCallIndex: tc.index,
                toolCallId: tc.id,
                toolCallName: tc.function?.name,
                toolCallArguments: tc.function?.arguments
              };
            }
          }

          if (choice.finish_reason) {
            yield { type: 'done', finishReason: choice.finish_reason };
          }
        } catch {
          /* 跳过无法解析的帧 */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
