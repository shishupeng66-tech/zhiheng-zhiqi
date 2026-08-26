export interface LlmProviderConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
}

/** Tool 函数定义（OpenAI-compatible 格式） */
export interface ChatToolFunction {
  name: string;
  description?: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/** Tool 定义 */
export interface ChatTool {
  type: 'function';
  function: ChatToolFunction;
}

/** Tool Call 参数 */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ChatToolCall[];
}

/** Tool choice 选项 */
export type ChatToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/** 非流式 chat 调用选项 */
export interface ChatOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  tools?: ChatTool[];
  tool_choice?: ChatToolChoice;
  temperature?: number;
}

/** 非流式 chat 结果 */
export interface ChatResult {
  text: string;
  toolCalls: ChatToolCall[];
  latencyMs: number;
  finishReason: string;
}

/** 流式 delta 事件 */
export interface StreamDelta {
  type: 'content' | 'tool_call' | 'done';
  content?: string;
  toolCallIndex?: number;
  toolCallId?: string;
  toolCallName?: string;
  toolCallArguments?: string;
  finishReason?: string;
}

/** 流式 chat 调用选项 */
export interface StreamOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  tools?: ChatTool[];
  tool_choice?: ChatToolChoice;
  temperature?: number;
}
