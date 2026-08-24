import { getDefaultProviderConfig } from '@/lib/settings/store';
import { openaiCompatibleChat, openaiCompatibleStream } from './providers/openai-compatible';
import type { ChatMessage, LlmProviderConfig } from './types';

export * from './types';

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

/** 业务调用入口：非流式对话。生产环境由各业务模块调用，而非直接耦合具体厂商 SDK。 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const cfg = await getResolvedLlmConfig();
  assertConfigReady(cfg!);
  const r = await openaiCompatibleChat(cfg!, messages);
  return r.text;
}

/** 业务调用入口：流式对话。 */
export async function* stream(messages: ChatMessage[]): AsyncGenerator<string> {
  const cfg = await getResolvedLlmConfig();
  assertConfigReady(cfg!);
  yield* openaiCompatibleStream(cfg!, messages);
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
    const r = await openaiCompatibleChat(config, [{ role: 'user', content: 'ping' }], {
      timeoutMs: 20000
    });
    return {
      ok: true,
      message: `连通成功，模型返回 ${r.text.length} 字`,
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
