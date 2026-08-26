# 知衡助手 Agent V1 - Phase 2A 实施报告

## 概述

本阶段将知衡助手从"会真实聊天"升级为"具备标准 Tool Calling 和 Agent 编排能力"。实现了完整的 Agent 基础设施，包括 LLM Tool Calling 支持、Tool Registry、Agent Orchestrator、SSE 流式事件、UI Tool 状态展示等。

---

## 1. Tool Calling 如何实现

### 1.1 统一 LLM Client 扩展

在现有 `src/lib/ai/` 基础上扩展，保持单一 LLM Client 架构，不新增第二套。

**修改文件：**
- `src/lib/ai/types.ts` — 新增 Tool 相关类型
- `src/lib/ai/providers/openai-compatible.ts` — 支持 tools/tool_choice/tool_calls
- `src/lib/ai/index.ts` — 新增 `chatWithTools()` 和 `streamWithTools()` 入口

### 1.2 新增类型定义

```typescript
// Tool 函数定义（OpenAI-compatible 格式）
interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

// Tool Call 结果
interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// ChatMessage 扩展 tool_calls 字段
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ChatToolCall[];
}
```

### 1.3 Provider 兼容原则

- 继续使用「系统管理 → 模型与接口」配置的默认 LLM
- 不硬编码任何特定厂商（OpenAI / DeepSeek / 豆包 / 通义 / 智谱）
- 适用于所有 OpenAI-compatible 协议的模型

### 1.4 不支持 Tool Calling 时的处理

通过 `isToolUnsupportedError()` 函数检测错误信息中的关键词：
- `unsupported` / `tool_choice` / `tool_calls` / `function call` / `不支持` / `invalid tool`

检测到后，Agent 返回明确错误：
> "当前配置模型不支持知衡助手工具调用，请更换支持 Tool Calling 的模型。"

**不会静默退化成假 Agent。**

---

## 2. 当前默认模型是否真的支持 Tool Calling

本阶段代码已具备完整的 Tool Calling 支持能力，但是否能实际工作取决于：

1. **当前配置的默认 LLM 模型**是否支持 Tool Calling
2. **模型的 Base URL**是否正确实现了 OpenAI-compatible 协议

### 验证方式

配置好支持 Tool Calling 的模型后，在知衡助手中输入：

> "我们现在有哪些视频剪辑风格？"

如果：
- ✅ 显示「正在获取视频剪辑风格列表」状态
- ✅ 最终回答列出了 5 种视频剪辑 Skill
- → 说明模型支持 Tool Calling

如果：
- ❌ 显示错误提示「当前配置模型不支持知衡助手工具调用」
- → 说明模型不支持，需要更换

### 常见支持 Tool Calling 的模型

| 厂商 | 支持模型示例 |
|------|-------------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-3.5-turbo-1106+ |
| DeepSeek | deepseek-chat (V2+) |
| 字节豆包 | doubao-pro-32k |
| 阿里通义 | qwen-plus, qwen-max |
| 智谱 | glm-4, glm-4-flash |

---

## 3. Agent Orchestrator 工作流程

### 3.1 核心文件

`src/lib/agent/orchestrator.ts`

### 3.2 工作流程

```
用户消息
   ↓
构建 System Prompt（角色设定 + 用户信息 + 路由 + 企业定位上下文）
   ↓
获取 Tool definitions（从 ToolRegistry）
   ↓
┌──────────────────────────────────┐
│  Agent 循环（最多 6 轮）          │
│  ┌────────────────────────────┐  │
│  │ 调用 LLM (带 tools)        │  │
│  └───────────┬────────────────┘  │
│              ↓                   │
│         有 tool_calls?           │
│         /          \             │
│       否            是           │
│       ↓             ↓            │
│   输出文本     推送 tool_started  │
│     结束        执行 Tool        │
│              推送 tool_completed │
│              添加 tool 结果消息  │
│                  ↓               │
│              下一轮循环           │
└──────────────────────────────────┘
   ↓
超出最大轮次？→ 返回友好错误
   ↓
推送 done 事件
```

### 3.3 关键参数

- `MAX_TOOL_ROUNDS = 6` — 最大 Tool 调用轮次，防止无限循环
- `temperature = 0.7` — LLM 生成温度

### 3.4 System Prompt 构建

自动注入（不依赖 Tool）：
- 角色设定：知衡助手
- 职责说明
- 用户信息（姓名 + 角色）
- 当前页面路由
- **企业定位上下文**（Company Context，自动加载）

---

## 4. Tool Registry 结构

### 4.1 核心文件

`src/lib/agent/tool-registry.ts`

### 4.2 Tool 接口定义

```typescript
interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;              // Tool 唯一标识，传给 LLM
  description: string;       // Tool 描述，传给 LLM
  inputSchema: ZodSchema;    // 输入参数 Zod Schema
  riskLevel: 'low' | 'high'; // 风险等级
  requiredPermission?: string; // 所需权限
  displayName: string;       // 用户友好名称（UI 展示）
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
}
```

### 4.3 Tool 执行上下文

```typescript
interface ToolExecutionContext {
  userId: string;
  userName: string;
  userRole: string;
  workspaceId: string | null;
  workspaceRole: string | null;
}
```

**所有字段均由服务端注入，不信任前端传入的权限信息。**

### 4.4 JSON Schema 生成

通过 `zodToJsonSchema()` 函数将 Zod Schema 转换为 OpenAI-compatible 的 JSON Schema 格式。支持：
- `ZodObject` → `type: object` + `properties` + `required`
- `ZodString` → `type: string`
- `ZodNumber` → `type: number`
- `ZodBoolean` → `type: boolean`
- `ZodArray` → `type: array` + `items`
- `ZodOptional` → 从 required 中排除

不引入 `zod-to-json-schema` 等额外依赖，保持轻量。

### 4.5 注册方式

```typescript
// 在 src/lib/agent/tools/index.ts 中
toolRegistry.register(myTool);
```

通过副作用导入触发注册：
```typescript
// orchestrator.ts 中
import './tools';
```

---

## 5. 已实现哪些测试 Tool

### 5.1 list_video_skills

- **名称**: `list_video_skills`
- **展示名**: 获取视频剪辑风格列表
- **风险等级**: low
- **权限要求**: 无
- **参数**: 无
- **作用**: 列出 `skills/video-editing/` 中所有可用的视频剪辑 Skill
- **返回**: 每个 Skill 的 id、name、description、contentType、category、status、version

### 5.2 get_video_skill

- **名称**: `get_video_skill`
- **展示名**: 读取视频剪辑风格详情
- **风险等级**: low
- **权限要求**: 无
- **参数**:
  - `skillId` (可选): Skill ID，如 `executive-ip`
  - `name` (可选): Skill 名称，如 `老板IP观点型`
  - `contentType` (可选): 内容类型，如 `知识科普`
- **作用**: 读取单个 Skill 的完整 skill.json
- **返回**: 完整的 VideoEditingSkill 对象（脚本规则、镜头规则、配音、字幕、BGM 等）

### 5.3 get_company_context_summary

- **名称**: `get_company_context_summary`
- **展示名**: 读取企业定位信息
- **风险等级**: low
- **权限要求**: 无
- **参数**: 无
- **作用**: 读取企业定位上下文的摘要信息
- **返回**: 企业名称、行业、品牌定位、目标受众、内容方向、Guardrails 等

> **注意**: 企业核心 Guardrails 仍由 Context Loader 自动注入 System Prompt，不依赖 LLM 主动调用 Tool。Tool 仅用于用户明确询问时的补充查询。

---

## 6. SSE / 流式事件格式

### 6.1 协议

使用 **Server-Sent Events (SSE)** 协议：
- Content-Type: `text/event-stream; charset=utf-8`
- Cache-Control: `no-cache, no-transform`
- Connection: `keep-alive`
- 每条事件格式：`data: {json}\n\n`

### 6.2 事件类型

| 事件类型 | 说明 | 字段 |
|---------|------|------|
| `assistant_delta` | 助手文本增量 | `content` |
| `tool_started` | Tool 开始执行 | `tool`, `toolDisplayName` |
| `tool_completed` | Tool 执行完成 | `tool`, `toolDisplayName` |
| `confirmation_required` | 需要用户确认 | `confirmation` |
| `error` | 错误 | `error`, `errorCode` |
| `done` | 完成 | - |

### 6.3 事件流示例

```
data: {"type":"tool_started","tool":"list_video_skills","toolDisplayName":"获取视频剪辑风格列表"}

data: {"type":"tool_completed","tool":"list_video_skills","toolDisplayName":"获取视频剪辑风格列表"}

data: {"type":"assistant_delta","content":"我们目前有"}

data: {"type":"assistant_delta","content":"5 种视频剪辑风格"}

data: {"type":"done"}
```

### 6.4 未来扩展性

事件格式设计预留了以下能力：
- 文本流（已实现）
- Tool 状态（已实现）
- 确认卡片（已预留结构）
- 任务进度（可新增事件类型）

---

## 7. UI 如何展示 Tool 状态

### 7.1 修改文件

- `src/features/assistant/store.ts` — 新增 Tool 状态管理
- `src/features/assistant/zhiheng-assistant.tsx` — 新增 Tool 状态展示

### 7.2 Tool 状态数据结构

```typescript
interface ToolStatusItem {
  id: string;
  toolName: string;        // 内部名称
  displayName: string;     // 展示名称（产品语言）
  status: 'running' | 'completed';
}
```

### 7.3 展示规则

1. **消息内容为空 + 有 Tool 运行中**：显示 Tool 状态列表（替代"思考中..."）
2. **消息已有内容 + 仍有 Tool 运行中**：在消息下方显示运行中的 Tool
3. **Tool 完成后**：状态从"正在"变为"已完成"，图标从 spinner 变为 check

### 7.4 展示示例

```
⚡ 正在获取视频剪辑风格列表
✓ 已完成读取企业定位信息
```

### 7.5 不展示的内容

- ❌ JSON 数据
- ❌ 函数名（tool 内部名称仅用于调试）
- ❌ Provider / API 信息
- ❌ tool_call_id
- ❌ 技术错误堆栈

用户看到的是产品语言，不是技术细节。

---

## 8. 权限如何验证

### 8.1 服务端权限检查

Tool 执行前统一检查：
```
LLM 发起 tool_call
   ↓
Orchestrator.executeTool()
   ↓
┌─ 从 Tool 定义获取 requiredPermission
├─ 从 ToolExecutionContext 获取用户角色
└─ 调用 checkPermission() 校验
   ↓
通过 → 执行 Tool
不通过 → 返回"权限不足"错误
```

### 8.2 ToolExecutionContext 来源

**完全由服务端构建**，从 `getCurrentUser()` 获取：
- `userId` / `userName` / `userRole`

**不信任前端传入的任何权限信息**（userId、role、workspaceRole 等）。

### 8.3 V1 权限模型

当前为简化版本，基于用户角色：
- `super_admin` / `admin` → 有权限
- 其他角色 → 无权限（仅对有 requiredPermission 的 Tool）

后续可接入完整的 RBAC 权限体系。

---

## 9. Plan-Confirm-Execute 如何预留

### 9.1 风险等级机制

每个 Tool 都有 `riskLevel`：
- `low` — 自动执行，无需确认
- `high` — 需要用户确认后才能执行

### 9.2 确认流程

```
LLM 发起 high risk tool_call
   ↓
Orchestrator 检测到 riskLevel === 'high'
   ↓
推送 confirmation_required 事件
   ↓
UI 展示确认卡片
   ↓
用户确认 → 继续执行
用户取消 → 终止流程
```

### 9.3 事件结构

```typescript
{
  type: 'confirmation_required',
  confirmation: {
    actionId: string;       // Tool call ID
    title: string;          // 操作标题
    description: string;    // 操作描述
    riskLevel: 'high';      // 风险等级
  }
}
```

### 9.4 当前状态

- ✅ 框架已就绪（riskLevel、confirmation_required 事件、UI 事件处理占位）
- ⏳ 暂无 high risk Tool 注册（V1 只有 3 个 low risk Tool）
- 🔮 未来 `execute_video_task` 等 Tool 将使用 high risk + 确认机制

---

## 10. 实际测试结果

### 10.1 静态验证

- ✅ TypeScript typecheck 通过
- ✅ Next.js build 通过
- ✅ 旧纯聊天 API (`/api/ai/chat`) 未被破坏
- ✅ 旧 `chat()` / `stream()` 函数保持向后兼容

### 10.2 功能测试用例

配置好支持 Tool Calling 的模型后，可通过以下用例验证：

| 测试用例 | 输入 | 期望行为 |
|---------|------|---------|
| 列出风格 | "我们现在有哪些视频剪辑风格？" | 调用 `list_video_skills` → 返回 5 个 Skill → 用自然语言回答 |
| 风格详情 | "老板IP风格有什么规则？" | 调用 `get_video_skill` → 读取老板IP观点型 skill.json → 回答规则 |
| 企业边界 | "企业内容有哪些不能乱说的东西？" | 调用 `get_company_context_summary` → 读取 Guardrails → 回答事实边界 |
| 普通聊天 | "你好" | 不调用任何 Tool，直接回答（验证纯聊天未被破坏） |
| 不支持模型 | 使用不支持 Tool Calling 的模型 | 返回明确错误提示，不静默降级 |

### 10.3 测试脚本

已提供测试脚本：`scripts/test-agent-tools.ts`

用法：
```bash
npx tsx scripts/test-agent-tools.ts
```

> 注意：需要先配置好默认 LLM 模型（支持 Tool Calling），并确保 SQLite 数据库可用。

---

## 11. 修改文件列表

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/lib/agent/tool-registry.ts` | Tool 注册中心 |
| `src/lib/agent/orchestrator.ts` | Agent 编排器 |
| `src/lib/agent/tools/index.ts` | 3 个测试 Tool 实现 |
| `scripts/test-agent-tools.ts` | Agent Tool Calling 测试脚本 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/lib/ai/types.ts` | 新增 Tool 相关类型（ChatTool, ChatToolCall, ChatOptions 等） |
| `src/lib/ai/providers/openai-compatible.ts` | 支持 tools/tool_choice/tool_calls，新增 isToolUnsupportedError |
| `src/lib/ai/index.ts` | 新增 chatWithTools() / streamWithTools()，导出 isToolUnsupportedError |
| `src/app/api/agent/chat/route.ts` | 改为使用 Agent Orchestrator + SSE 事件流 |
| `src/features/assistant/store.ts` | 新增 Tool 状态管理（toolStatuses, addToolStatus 等） |
| `src/features/assistant/zhiheng-assistant.tsx` | 解析 SSE 事件，展示 Tool 状态 |

### 未修改（保持原样）

| 文件 | 说明 |
|------|------|
| `src/app/api/ai/chat/route.ts` | 旧通用聊天 API，保持不变 |
| `src/lib/agent/company-context.ts` | 企业上下文加载器，保持不变 |
| `src/lib/agent/skill-loader.ts` | Skill 加载器，保持不变 |
| `src/lib/agent/types.ts` | Agent 类型定义，保持不变 |
| `/dashboard/ai-chat` 页面 | 旧 AI 聊天页面，保持不变 |

---

## 12. typecheck/build 结果

- ✅ `tsc --noEmit` — 通过（0 errors）
- ✅ `next build` — 通过（0 errors）

---

## 13. 等 Codex 素材索引完成后，search_video_assets 应该如何接入

### 13.1 接入步骤

当 Codex 的「90 条精选视频素材逐秒语义索引」完成后，按以下步骤接入：

#### 第一步：确定索引 Schema

确认 Codex 产出的索引文件格式，包括：
- `timelineSegments` — 逐秒语义分段
- `recommendedCuts` — 推荐剪辑点
- `avoidCuts` — 避免剪辑点
- `semanticMatches` — 语义匹配
- `storyPotential` — 故事潜力评分
- `cropSafety` — 裁剪安全区
- `quality` — 画质评分
- `duplicateGroup` — 重复素材分组

#### 第二步：创建素材索引读取服务

```
src/lib/agent/video-asset-index.ts
```

职责：
- 加载索引文件（JSON / SQLite / 向量库）
- 提供搜索接口（按关键词、语义、时长、画质等）
- 带内存缓存

#### 第三步：注册 search_video_assets Tool

在 `src/lib/agent/tools/` 中新增：

```typescript
const searchVideoAssetsTool: AgentTool = {
  name: 'search_video_assets',
  displayName: '搜索视频素材',
  description: '根据关键词、风格、时长等条件搜索视频素材库...',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词'),
    skillId: z.string().optional().describe('剪辑风格 ID'),
    minDuration: z.number().optional(),
    maxDuration: z.number().optional(),
    minQuality: z.number().optional(),
    limit: z.number().optional().default(20)
  }),
  riskLevel: 'low', // 只读操作，低风险
  requiredPermission: undefined,
  execute: async (input) => {
    // 调用素材索引服务
    return searchVideoAssets(input);
  }
};
```

#### 第四步：更新 System Prompt

在 Orchestrator 的 System Prompt 中增加素材搜索相关的使用指导。

#### 第五步：测试验证

用例：
- "帮我找一些工厂车间的素材"
- "找几个适合老板IP风格的开场镜头"
- "搜索 10-30 秒的产品展示素材"

### 13.2 注意事项

1. **不要在 Phase 2A 实现** — 等 Codex Schema 确定后再接
2. **保持 Tool 接口一致** — 遵循现有 Tool Registry 模式
3. **只读操作，riskLevel = low** — 搜索不修改任何数据
4. **结果分页** — 避免一次返回过多素材
5. **返回字段精简** — 只返回 Agent 需要的字段（id、路径、时长、缩略图、语义标签等），不返回完整索引
6. **后续可升级为向量搜索** — 当前用关键词搜索即可，后续可接入向量数据库

---

## 总结

Phase 2A 完成了知衡助手的 Agent 核心基础设施建设：

- ✅ 统一 LLM Client 支持 Tool Calling
- ✅ Tool Registry 注册中心
- ✅ Agent Orchestrator 编排器（6 轮循环保护）
- ✅ 3 个安全测试 Tool（验证 Tool Calling 全链路）
- ✅ SSE 结构化流式事件（文本 + Tool 状态 + 确认预留）
- ✅ UI Tool 状态展示（产品语言，无技术细节）
- ✅ 权限验证框架（服务端校验，不信任前端）
- ✅ Plan-Confirm-Execute 框架（riskLevel + confirmation_required）
- ✅ 旧纯聊天功能不被破坏
- ✅ typecheck 和 build 均通过

为后续 Phase（视频素材搜索、视频生成执行等）打下了坚实的基础设施基础。
