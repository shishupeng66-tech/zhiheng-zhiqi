import { getDefaultProviderConfig } from '@/lib/settings/store';
import {
  openaiCompatibleChat,
  openaiCompatibleStream,
  isToolUnsupportedError
} from './providers/openai-compatible';
import type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  LlmProviderConfig,
  StreamDelta,
  StreamOptions
} from './types';

export * from './types';
export { isToolUnsupportedError };

/** 将 DB 中的字段键值对转换为统一的 LLM Provider 配置。 */
export function dbConfigToLlmProvider(
  provider: string,
  config: Record<string, string>,
  enabled: boolean,
  isDefault: boolean
): LlmProviderConfig {
  return {
    provider,
    baseUrl: config['base_url'] ?? '',
    apiKey: config['api_key'] ?? '',
    model: config['model'] ?? '',
    enabled,
    isDefault
  };
}

/** 解析当前默认（或首个启用）的 LLM 配置用于业务调用。 */
export async function getResolvedLlmConfig(): Promise<LlmProviderConfig | null> {
  const resolved = await getDefaultProviderConfig('llm');
  if (!resolved) return null;
  return dbConfigToLlmProvider(resolved.provider, resolved.config, true, true);
}

function assertConfigReady(cfg: LlmProviderConfig): void {
  if (!cfg) throw new Error('未配置默认 LLM');
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    throw new Error('LLM 配置不完整（缺少 Base URL / API Key / Model）');
  }
}

/** 业务调用入口：非流式对话（纯文本，向后兼容）。 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const cfg = await getResolvedLlmConfig();
  assertConfigReady(cfg!);
  const r = await openaiCompatibleChat(cfg!, messages);
  return r.text;
}

/** 业务调用入口：非流式对话（完整结果，支持 tools）。 */
export async function chatWithTools(
  messages: ChatMessage[],
  opts: Omit<ChatOptions, 'signal'> = {}
): Promise<ChatResult> {
  const cfg = await getResolvedLlmConfig();
  assertConfigReady(cfg!);
  return openaiCompatibleChat(cfg!, messages, opts);
}

/** 业务调用入口：流式对话（纯文本，向后兼容）。 */
export async function* stream(messages: ChatMessage[]): AsyncGenerator<string> {
  const cfg = await getResolvedLlmConfig();
  assertConfigReady(cfg!);
  for await (const delta of openaiCompatibleStream(cfg!, messages)) {
    if (delta.type === 'content' && delta.content) {
      yield delta.content;
    }
  }
}

/** 业务调用入口：流式对话（完整 delta，支持 tools）。 */
export async function* streamWithTools(
  messages: ChatMessage[],
  opts: Omit<StreamOptions, 'signal'> = {}
): AsyncGenerator<StreamDelta> {
  const cfg = await getResolvedLlmConfig();
  assertConfigReady(cfg!);
  yield* openaiCompatibleStream(cfg!, messages, opts);
}

/** 测试给定 LLM 配置连通性（不返回任何 secret）。 */
export async function testLlm(
  config: LlmProviderConfig
): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const started = Date.now();
  try {
    if (!config.baseUrl || !config.apiKey || !config.model) {
      throw new Error('配置不完整（缺少 Base URL / API Key / Model）');
    }
    const r = await openaiCompatibleChat(
      config,
      [
        {
          role: 'user',
          content: '请用一句话说明你现在已经成功连接到知衡智企。'
        }
      ],
      { timeoutMs: 30000 }
    );
    return {
      ok: true,
      message: `连接成功，模型回复：${r.text.slice(0, 120)}`,
      latencyMs: r.latencyMs
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : '未知错误',
      latencyMs: Date.now() - started
    };
  }
}
