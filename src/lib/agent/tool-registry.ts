import type { ZodSchema } from 'zod';
import type { ChatTool } from '@/lib/ai/types';

/** Tool 风险等级 */
export type ToolRiskLevel = 'low' | 'high';

/** Tool 执行上下文（服务端注入，不来自 LLM） */
export interface ToolExecutionContext {
  userId: string;
  userName: string;
  userRole: string;
  workspaceId: string | null;
  workspaceRole: string | null;
}

/** Tool 定义 */
export interface AgentTool<TInput = unknown, TOutput = unknown> {
  /** Tool 名称（唯一标识，传给 LLM） */
  name: string;
  /** Tool 描述（传给 LLM，指导何时调用） */
  description: string;
  /** 输入参数的 Zod Schema（用于校验 + 生成 JSON Schema） */
  inputSchema: ZodSchema<TInput>;
  /** 风险等级 */
  riskLevel: ToolRiskLevel;
  /** 所需权限（服务端校验） */
  requiredPermission?: string;
  /** 用户友好的 Tool 名称（UI 展示用） */
  displayName: string;
  /** 执行函数（服务端执行，浏览器不可调用） */
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
}

/** Tool 注册中心 */
class ToolRegistry {
  private tools = new Map<string, AgentTool<any, any>>();

  register<TInput, TOutput>(tool: AgentTool<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool 重复注册：${tool.name}`);
    }
    this.tools.set(tool.name, tool as AgentTool<any, any>);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name) as AgentTool | undefined;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): AgentTool[] {
    return Array.from(this.tools.values()) as AgentTool[];
  }

  /** 生成 OpenAI-compatible 的 tools 定义数组 */
  toChatTools(): ChatTool[] {
    return this.list().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema)
      }
    }));
  }
}

/** 全局单例 */
export const toolRegistry = new ToolRegistry();

/**
 * 简易 Zod → JSON Schema 转换（兼容 Zod v4）。
 * 仅支持 Tool 参数常用的结构：object + properties + required。
 * 不引入 zod-to-json-schema 等额外依赖。
 */
function zodToJsonSchema(schema: ZodSchema): Record<string, unknown> {
  // Zod v4: _def.type 为小写类型名（object/string/number/boolean/array/optional/enum）
  const anySchema = schema as unknown as {
    _def: {
      type: string;
      shape?: Record<string, ZodSchema>;
      innerType?: ZodSchema;
      element?: ZodSchema;
      entries?: string[];
    };
    description?: string;
  };

  const defType = anySchema._def.type;
  const description = anySchema.description;

  switch (defType) {
    case 'object': {
      const shape = anySchema._def.shape ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        const valAny = value as unknown as {
          _def: { type: string };
        };
        // 非 optional 类型加入 required
        if (valAny._def.type !== 'optional') {
          required.push(key);
        }
      }
      const result: Record<string, unknown> = {
        type: 'object',
        properties
      };
      if (required.length > 0) {
        result.required = required;
      }
      if (description) {
        result.description = description;
      }
      return result;
    }
    case 'string': {
      const result: Record<string, unknown> = { type: 'string' };
      if (description) result.description = description;
      return result;
    }
    case 'number': {
      const result: Record<string, unknown> = { type: 'number' };
      if (description) result.description = description;
      return result;
    }
    case 'boolean': {
      const result: Record<string, unknown> = { type: 'boolean' };
      if (description) result.description = description;
      return result;
    }
    case 'array': {
      const element = anySchema._def.element;
      const result: Record<string, unknown> = {
        type: 'array',
        items: element ? zodToJsonSchema(element) : {}
      };
      if (description) result.description = description;
      return result;
    }
    case 'optional': {
      const inner = anySchema._def.innerType;
      return inner ? zodToJsonSchema(inner) : {};
    }
    case 'enum': {
      // Zod v4: _def.entries 是对象 { value: value }，需转为数组
      const entries = anySchema._def.entries as unknown as Record<string, string> | undefined;
      const result: Record<string, unknown> = {
        type: 'string',
        enum: entries ? Object.values(entries) : []
      };
      if (description) result.description = description;
      return result;
    }
    default:
      return { type: 'string' };
  }
}
