import type { ChatMessage, LlmProviderConfig } from '../types';

/**
 * OpenAI 兼容适配器（v1 唯一实现）。
 * 适用于 OpenAI / DeepSeek / VolcEngine Ark / 任意 OpenAI 兼容网关：
 * 仅需切换 baseUrl 与 model，无需为每个厂商重复代码。
 *
 * 不在此处引入任何第三方 SDK，直接使用 fetch，保持零额外依赖与可控的超时/错误处理。
 */

export interface OpenAICompatibleChatResult {
  text: string;
  latencyMs: number;
}

interface ChatOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export async function openaiCompatibleChat(
  config: LlmProviderConfig,
  messages: ChatMessage[],
  opts: ChatOpts = {}
): Promise<OpenAICompatibleChatResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await fetch(buildUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        temperature: 0.7
      }),
      signal: opts.signal ?? controller.signal
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`LLM 请求失败（${res.status}）：${txt.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    return { text, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** 流式生成：解析 SSE data: 帧，逐块产出增量文本。 */
export async function* openaiCompatibleStream(
  config: LlmProviderConfig,
  messages: ChatMessage[],
  opts: ChatOpts = {}
): AsyncGenerator<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(buildUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({ model: config.model, messages, stream: true, temperature: 0.7 }),
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
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* 跳过无法解析的帧 */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
