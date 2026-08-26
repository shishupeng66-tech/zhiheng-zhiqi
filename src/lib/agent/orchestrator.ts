import {
  chatWithTools,
  isToolUnsupportedError,
  type ChatMessage,
  type ChatToolCall
} from '@/lib/ai';
import { toolRegistry, type ToolExecutionContext } from './tool-registry';
import { loadCompanyContext, formatCompanyContextPrompt } from './company-context';
import type { AgentContext } from './types';
// 触发 Tool 注册（副作用导入）
import './tools';

/** 最大 Tool 调用轮次，防止无限循环 */
export const MAX_TOOL_ROUNDS = 6;

/** Agent 流式事件类型 */
export type AgentStreamEventType =
  | 'assistant_delta'
  | 'tool_started'
  | 'tool_completed'
  | 'confirmation_required'
  | 'error'
  | 'done';

/** Agent 流式事件 */
export interface AgentStreamEvent {
  type: AgentStreamEventType;
  /** 文本内容（assistant_delta 时使用） */
  content?: string;
  /** Tool 名称（tool_started / tool_completed 时使用） */
  tool?: string;
  /** Tool 展示名称（UI 展示用） */
  toolDisplayName?: string;
  /** 错误信息（error 时使用） */
  error?: string;
  /** 错误代码 */
  errorCode?: string;
  /** Tool 执行结果（tool_completed 时使用） */
  toolResult?: unknown;
  /** Tool 调用参数（tool_started 时使用，JSON 字符串） */
  toolArguments?: string;
  /** 确认需要的信息（confirmation_required 时使用） */
  confirmation?: {
    actionId: string;
    title: string;
    description: string;
    riskLevel: 'low' | 'high';
  };
}

/**
 * Agent Orchestrator
 *
 * 职责：
 * 1. 接收用户消息
 * 2. 组装 Agent Context（企业定位 + 用户信息 + 路由）
 * 3. 把 Tool definitions 传给 LLM
 * 4. 解析 tool_calls
 * 5. 调 Tool Registry 执行（推送 tool_started / tool_completed 事件）
 * 6. 把 tool result 再返回 LLM
 * 7. 循环直到得到最终回答
 * 8. 最大循环次数保护
 */
export class AgentOrchestrator {
  private messages: ChatMessage[] = [];
  private toolCtx: ToolExecutionContext;
  private agentCtx: AgentContext;
  private rounds = 0;

  constructor(agentCtx: AgentContext, toolCtx: ToolExecutionContext) {
    this.agentCtx = agentCtx;
    this.toolCtx = toolCtx;
  }

  /**
   * 运行 Agent 循环，产出流式事件。
   *
   * 事件流示例：
   *   { type: 'tool_started', tool: 'list_video_skills', toolDisplayName: '获取视频剪辑风格列表' }
   *   { type: 'tool_completed', tool: 'list_video_skills', toolDisplayName: '获取视频剪辑风格列表' }
   *   { type: 'assistant_delta', content: '我们目前有...' }
   *   { type: 'assistant_delta', content: '5 种视频剪辑风格' }
   *   { type: 'done' }
   */
  async *run(userMessages: ChatMessage[]): AsyncGenerator<AgentStreamEvent> {
    try {
      // 1. 构建 system prompt
      const systemPrompt = await this.buildSystemPrompt();
      this.messages = [{ role: 'system', content: systemPrompt }, ...userMessages];

      // 2. 获取 Tool 定义
      const tools = toolRegistry.toChatTools();

      // 3. Agent 循环
      while (this.rounds < MAX_TOOL_ROUNDS) {
        this.rounds++;

        let result;
        try {
          result = await chatWithTools(this.messages, {
            tools,
            tool_choice: 'auto',
            temperature: 0.7
          });
        } catch (e) {
          // 检测是否为不支持 tool calling 的错误
          if (isToolUnsupportedError(e)) {
            yield {
              type: 'error',
              error: '当前配置模型不支持知衡助手工具调用，请更换支持 Tool Calling 的模型。',
              errorCode: 'tool_calling_unsupported'
            };
            return;
          }
          throw e;
        }

        const { text, toolCalls, finishReason } = result;

        // 4. 如果没有 tool_calls，输出文本并结束
        if (!toolCalls || toolCalls.length === 0) {
          // 添加 assistant 消息到历史
          this.messages.push({
            role: 'assistant',
            content: text
          });

          if (text && text.trim()) {
            yield* this.streamText(text);
          }

          break;
        }

        // 5. 有 tool_calls：先输出文本（如果有），然后执行工具
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: text,
          tool_calls: toolCalls
        };
        this.messages.push(assistantMsg);

        if (text && text.trim()) {
          yield* this.streamText(text);
        }

        // 6. 逐个执行 tool_calls
        let needsConfirmation = false;
        for (const toolCall of toolCalls) {
          const tool = toolRegistry.get(toolCall.function.name);
          const displayName = tool?.displayName ?? toolCall.function.name;

          // 推送 tool_started 事件
          yield {
            type: 'tool_started',
            tool: toolCall.function.name,
            toolDisplayName: displayName,
            toolArguments: toolCall.function.arguments
          };

          const toolResult = await this.executeTool(toolCall);

          // 推送 tool_completed 事件
          yield {
            type: 'tool_completed',
            tool: toolCall.function.name,
            toolDisplayName: displayName,
            toolResult: toolResult.data
          };

          // 如果需要确认，暂停并返回确认事件
          if (toolResult.requiresConfirmation) {
            yield {
              type: 'confirmation_required',
              confirmation: {
                actionId: toolCall.id,
                title: toolResult.confirmationTitle || displayName,
                description: toolResult.confirmationDesc || '',
                riskLevel: 'high'
              }
            };
            needsConfirmation = true;
            break;
          }

          // 添加 tool 结果消息
          this.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(toolResult.data)
          });
        }

        if (needsConfirmation) {
          return;
        }

        // 继续下一轮（LLM 根据 tool 结果生成最终回答）
      }

      // 7. 检查是否超出最大轮次
      if (this.rounds >= MAX_TOOL_ROUNDS) {
        yield {
          type: 'error',
          error: '任务步骤过多，已自动停止。请简化问题后重试。',
          errorCode: 'max_rounds_exceeded'
        };
        return;
      }

      yield { type: 'done' };
    } catch (e) {
      yield {
        type: 'error',
        error: e instanceof Error ? e.message : '未知错误',
        errorCode: 'internal_error'
      };
    }
  }

  /**
   * 构建 system prompt
   */
  private async buildSystemPrompt(): Promise<string> {
    const parts: string[] = [];

    parts.push('你是知衡助手，知衡智企企业 AI 工作平台的智能助手。');
    parts.push(
      '你的职责是帮助用户高效完成工作，包括但不限于：视频内容策划、自动化剪辑、知识查询、业务分析等。'
    );
    parts.push('回答要直接、务实，围绕企业实际场景。');
    parts.push('不要暴露模型供应商、模型 ID、Base URL 或 API 信息。');
    parts.push('不要显示"作为AI语言模型"之类的套话。');
    parts.push('你可以使用提供的工具来获取准确信息，不要编造企业事实或视频规则。');
    parts.push(
      '当用户询问视频风格、剪辑规则、企业信息等需要准确数据的问题时，优先调用对应工具获取信息再回答。'
    );

    // 用户信息
    parts.push(`当前用户：${this.agentCtx.user.name}（${this.agentCtx.user.role}）`);

    // 当前页面
    if (this.agentCtx.route) {
      parts.push(`当前页面：${this.agentCtx.route}`);
    }

    // 企业定位上下文（自动注入，不依赖 Tool）
    try {
      const companyContext = await loadCompanyContext();
      const companyContextText = formatCompanyContextPrompt(companyContext);
      if (companyContextText) {
        parts.push('');
        parts.push(companyContextText);
      }
    } catch {
      // 静默失败
    }

    return parts.join('\n');
  }

  /**
   * 执行单个 Tool 调用
   */
  private async executeTool(toolCall: ChatToolCall): Promise<{
    data: unknown;
    requiresConfirmation: boolean;
    confirmationTitle?: string;
    confirmationDesc?: string;
  }> {
    const tool = toolRegistry.get(toolCall.function.name);

    if (!tool) {
      return {
        data: { error: `未知工具：${toolCall.function.name}` },
        requiresConfirmation: false
      };
    }

    // 权限检查
    if (tool.requiredPermission) {
      const hasPermission = await this.checkPermission(tool.requiredPermission);
      if (!hasPermission) {
        return {
          data: { error: '权限不足，无法执行此操作' },
          requiresConfirmation: false
        };
      }
    }

    // 解析参数
    let input: unknown;
    try {
      input = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      return {
        data: { error: '工具参数解析失败' },
        requiresConfirmation: false
      };
    }

    // 校验参数
    try {
      tool.inputSchema.parse(input);
    } catch (e) {
      return {
        data: { error: `参数校验失败：${e instanceof Error ? e.message : '未知错误'}` },
        requiresConfirmation: false
      };
    }

    // 高风险 Tool 需要确认
    if (tool.riskLevel === 'high') {
      return {
        data: null,
        requiresConfirmation: true,
        confirmationTitle: tool.displayName,
        confirmationDesc: tool.description
      };
    }

    // 执行 Tool
    try {
      const result = await tool.execute(input, this.toolCtx);
      return { data: result, requiresConfirmation: false };
    } catch (e) {
      return {
        data: { error: `工具执行失败：${e instanceof Error ? e.message : '未知错误'}` },
        requiresConfirmation: false
      };
    }
  }

  /**
   * 权限检查（V1：简单基于角色，后续接入完整权限体系）
   */
  private async checkPermission(_permission: string): Promise<boolean> {
    const role = this.toolCtx.userRole;
    return role === 'super_admin' || role === 'admin';
  }

  /**
   * 将文本拆分成小块模拟流式输出
   * 因为非流式 Tool Calling 模式下，LLM 返回完整文本
   * 为了保持 UI 体验一致，模拟逐字输出
   */
  private *streamText(text: string): Generator<AgentStreamEvent> {
    const chunkSize = 2;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      yield { type: 'assistant_delta', content: chunk };
    }
  }
}

/**
 * 便捷函数：创建并运行 Agent
 */
export async function* runAgent(
  agentCtx: AgentContext,
  toolCtx: ToolExecutionContext,
  userMessages: ChatMessage[]
): AsyncGenerator<AgentStreamEvent> {
  const agent = new AgentOrchestrator(agentCtx, toolCtx);
  yield* agent.run(userMessages);
}
