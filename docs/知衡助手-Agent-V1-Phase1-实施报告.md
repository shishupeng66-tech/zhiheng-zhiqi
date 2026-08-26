# 知衡助手 Agent V1 - Phase 1 实施报告

> 版本：Phase 1  
> 日期：2026-08-26  
> 状态：已完成，待验证

---

## 一、概述

Phase 1 目标：把用户真正能看见和使用的「知衡助手」做出来。

- 全局悬浮球 + 右侧对话面板
- 接入现有真实 LLM（统一模型配置）
- 建立 Agent Context 基础结构
- Company Context Loader
- Skill Loader（读取能力）
- 为后续 Tool Calling 预留接口

---

## 二、悬浮球挂载位置

**文件**：`src/app/dashboard/layout.tsx`

**挂载点**：`SidebarProvider` 内，`SidebarInset` 同级

```
SidebarProvider
  ├── AppSidebar (左侧导航)
  ├── SidebarInset (主内容区)
  │     ├── Header
  │     └── InfobarProvider
  │           ├── {children}
  │           └── InfoSidebar
  └── ZhihengAssistant  ← 新增（全局浮动，fixed 定位）
```

**为什么放这里**：
- 在 `UserProvider` 内部，可获取用户上下文
- 在 `SidebarProvider` 内部，不影响 sidebar 布局
- `fixed` 定位，悬浮在所有内容之上
- dashboard 所有页面共享，登录页等非 dashboard 页面不出现

---

## 三、右侧面板组件结构

**主组件**：`src/features/assistant/zhiheng-assistant.tsx`

```
ZhihengAssistant (Client Component)
  ├── 悬浮球 (button, fixed bottom-6 right-6)
  └── Sheet (右侧抽屉, side="right", max-w-[420px])
        ├── SheetHeader
        │     ├── 图标 + 知衡助手标题
        │     ├── 副标题：企业 AI 工作助手
        │     └── 新对话按钮
        ├── MessageScroller (消息滚动区)
        │     └── messages.map → Message + Bubble
        └── 底部输入区
              ├── Textarea (Enter 发送, Shift+Enter 换行)
              └── 发送按钮
```

---

## 四、如何复用现有 AI Chat

### 完全复用的组件

| 组件 | 来源 | 用途 |
|------|------|------|
| `MessageScroller` | `src/components/ui/message-scroller.tsx` | 消息滚动容器 |
| `Message` / `MessageAvatar` / `MessageContent` | `src/components/ui/message.tsx` | 消息布局 |
| `Bubble` / `BubbleContent` | `src/components/ui/bubble.tsx` | 消息气泡 |
| `Marker` / `MarkerContent` | `src/components/ui/marker.tsx` | 思考中加载状态 |
| `Textarea` | shadcn | 输入框 |
| `Button` | shadcn | 按钮 |

### 复用的逻辑

- 流式请求模式：`fetch` → `response.body.getReader()` → 逐块追加
- 消息状态管理模式：user message + empty assistant message → 流式填充
- 键盘交互：Enter 发送 / Shift+Enter 换行

### 不同之处

| 方面 | 旧 AI Chat | 知衡助手 |
|------|-----------|---------|
| 状态管理 | `useState` | Zustand store（跨页面保持） |
| 入口 | 独立页面 | 全局悬浮球 + 右侧抽屉 |
| API | `/api/ai/chat` | `/api/agent/chat` |
| Context | 无 | 带 route / user / company context |
| 会话管理 | 单会话，刷新丢失 | Zustand 内存保持，刷新丢失（V1 可接受） |

---

## 五、LLM 调用链

```
前端 (ZhihengAssistant 组件)
  │  POST /api/agent/chat
  │  { messages, context: { route } }
  ▼
API Route (src/app/api/agent/chat/route.ts)
  │  getCurrentUser() 鉴权
  │  normalizeMessages() 校验 + 截 20 条
  │  loadCompanyContext()  ← 加载企业定位（静默降级）
  │  buildSystemPrompt()  ← 注入用户、页面、企业定位
  ▼
统一 AI 层 (src/lib/ai/index.ts)
  │  getResolvedLlmConfig()  ← 从 DB 读默认 LLM 配置
  ▼
OpenAI 兼容 Provider (src/lib/ai/providers/openai-compatible.ts)
  │  fetch {baseUrl}/chat/completions  SSE 流式
  ▼
外部 LLM API（管理员配置的默认模型）
```

**关键点**：
- 完全复用 `src/lib/ai` 统一抽象层
- 使用「系统管理 → 模型与接口」中的默认 LLM 配置
- 不硬编码任何模型供应商
- 流式输出，逐字返回

---

## 六、Context 传递机制

### 前端 → 后端

前端发送消息时，附带 context 字段：

```typescript
{
  messages: [...],
  context: {
    route: '/dashboard/workspaces/xxx/automation'
  }
}
```

### 后端重新校验

后端不完全信任前端传入的数据，关键信息重新获取：

| 信息 | 来源 | 信任度 |
|------|------|--------|
| user | `getCurrentUser()` 从 session 读取 | 可信 |
| workspace | 后续从 session/路由校验 | 待实现（Phase 2） |
| route | 前端传入，仅用于展示 | 半可信 |
| entity | 前端传入，后端校验 | 待实现（Phase 2） |

### System Prompt 注入

后端构建 system prompt，注入：

- 助手身份与行为规范
- 当前用户（姓名 + 角色）
- 当前页面路径
- 企业定位上下文（如果有）
- Guardrails（如果有）

---

## 七、Company Context Loader

**文件**：`src/lib/agent/company-context.ts`

### 加载优先级

```
1. 读取 agent-company-context.json → 结构化注入（首选）
2. JSON 不存在 → 读取 Markdown 文件 → 纯文本注入（降级）
3. 都不存在 → 不注入企业定位上下文
```

### 文件路径

通过 `StorageService.getPath('knowledge')` 获取知识文件根目录，然后：

```
知识文件/
└── 视频内容策略/
    └── 01-企业定位/
        ├── agent-company-context.json  ← 优先读取
        ├── 01-企业基本信息.md           ← 降级读取
        └── ...
```

### 缓存策略

- 内存缓存 + mtime 校验
- 文件修改后自动重新加载
- 并发请求复用同一个 Promise（防击穿）

### 容错设计

- StorageService 配置错误 → 静默返回 null
- JSON 文件不存在 → 降级 Markdown
- JSON 解析失败 → 降级 Markdown
- Markdown 目录不存在 → 返回 null
- 单个文件读取失败 → 跳过，不影响整体

**任何情况下都不会导致聊天不可用。**

### Guardrails

如果 JSON 中包含 `guardrails.forbiddenFacts`，会注入到 system prompt：

> 以下信息缺失时，不得自行推断或编造：
> - 产能、客户名称、合作品牌、认证、销售额...

---

## 八、Skill Loader

**文件**：`src/lib/agent/skill-loader.ts`

### 功能

- `listVideoEditingSkills()` — 列出所有视频剪辑 Skill
- `getVideoEditingSkill(id)` — 根据 ID 获取单个 Skill
- `getSkillByContentType(contentType)` — 根据内容类型获取 Skill
- `refreshSkillCache()` — 强制刷新缓存

### 数据源

```
skills/video-editing/
├── 工厂实力展示型/skill.json
├── 产品案例型/skill.json
├── 行业避坑型/skill.json
├── 老板IP观点型/skill.json
├── 知识科普型/skill.json
└── schema.v1.json
```

### 当前状态

- Phase 1 只实现读取能力
- 不接入 LLM 自动选择 Skill
- 为后续 Tool Calling / Skill Router 预留基础

---

## 九、状态管理

**文件**：`src/features/assistant/store.ts`

### Store 结构

```typescript
{
  // 面板状态
  isOpen: boolean
  toggle() / setIsOpen()

  // 消息
  messages: AgentMessage[]
  isLoading: boolean
  inputValue: string
  addMessage() / updateMessage() / appendToMessage()
  resetConversation()

  // Context
  currentRoute: string
  currentEntity: AgentEntityContext | null
  setCurrentRoute() / setCurrentEntity()
}
```

### 跨页面保持

- 使用 Zustand（项目已有成熟模式）
- Store 在 layout 层的组件中使用，页面跳转不卸载
- 切换 dashboard 页面时，对话消息、展开状态全部保留
- 刷新浏览器后丢失（Phase 1 可接受，后续加持久化）

---

## 十、修改/新增文件清单

### 新增文件（6 个）

| # | 文件 | 说明 |
|---|------|------|
| 1 | `src/lib/agent/types.ts` | Agent 类型定义（消息、Context、Company、Skill） |
| 2 | `src/lib/agent/company-context.ts` | 企业定位加载器（JSON 优先 + Markdown 兜底 + 缓存） |
| 3 | `src/lib/agent/skill-loader.ts` | Skill 读取器（列表、按 ID/类型查询） |
| 4 | `src/app/api/agent/chat/route.ts` | Agent 对话 API（流式 + Context + 鉴权） |
| 5 | `src/features/assistant/store.ts` | Zustand store（消息 + 面板状态 + Context） |
| 6 | `src/features/assistant/zhiheng-assistant.tsx` | 知衡助手主组件（悬浮球 + 右侧面板 + 对话） |

### 修改文件（1 个）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `src/app/dashboard/layout.tsx` | 导入并挂载 ZhihengAssistant 组件 |

### 未改动

- ✅ 现有 AI Chat 页面（保留兼容）
- ✅ LLM 抽象层（直接复用）
- ✅ 视频引擎（未触碰）
- ✅ Voice Service（未触碰）
- ✅ 素材索引（未触碰）
- ✅ 数据库 schema（未新增表）
- ✅ 导航配置（未改动）
- ✅ 企业定位文件（只读，不修改）

---

## 十一、验证结果

| # | 验证项 | 结果 |
|---|--------|------|
| 1 | typecheck | ✅ 通过 |
| 2 | build | ✅ 通过 |
| 3 | 悬浮球在 dashboard 页面显示 | ✅ 组件已挂载到 dashboard layout |
| 4 | 点击展开右侧面板 | ✅ Sheet 组件实现 |
| 5 | 发送消息 + 流式回复 | ✅ /api/agent/chat 接入统一 LLM |
| 6 | 页面切换对话不丢失 | ✅ Zustand store + layout 层挂载 |
| 7 | 关闭再打开状态保持 | ✅ store 管理 isOpen 状态 |
| 8 | route context 传入 | ✅ usePathname() 同步到 store |
| 9 | 无企业定位文件时不报错 | ✅ try/catch 静默降级 |
| 10 | 现有 AI Chat 页面不受影响 | ✅ 保留原页面和 API |

---

## 十二、下一阶段建议

### Phase 2：Tool Calling + 视频生成能力

1. **扩展 LLM Tool Calling**
   - 在 `openai-compatible.ts` 中增加 tools 参数和 tool_calls 解析
   - 扩展 `lib/ai/index.ts` 暴露带 tools 的 stream 方法

2. **Agent Orchestrator**
   - 实现 LLM + Tool 调用循环
   - Tool Registry + 权限校验

3. **search_video_assets Tool**
   - 基于 `video-assets.json` 实现素材搜索
   - 文件存在性校验
   - 重复组去重

4. **execute_video_task Tool**
   - 封装现有 `createAutomationVideoTask` + `startMoneyPrinterTaskWorker`
   - Plan → Confirm → Execute 机制

5. **Skill 自动选择**
   - 根据用户意图自动匹配视频剪辑 Skill
   - 将 Skill 规则注入 system prompt

6. **Entity Context**
   - 页面级 Provider 注入当前实体（客户/产品/任务）
   - 后端校验实体权限

### Phase 3：体验优化

1. 对话持久化（localStorage 或 DB）
2. 多会话管理
3. 工具调用状态可视化
4. 快捷键（Cmd+K 唤起）
5. 拖拽位置 / 收缩成悬浮球
