# 知衡助手 Agent V1 — 架构审计与实施方案

> 版本：V1.1  
> 日期：2026-08-26  
> 状态：审计完成，待评审后实施  
> 更新说明：V1.1 修正素材索引结论（JSON 优先）、Company Context Loader（JSON 优先 + guardrails）、V1 缺口清单

---

## 一、现有 AI 聊天架构审计

### 1.1 代码位置总览

| 层级 | 文件路径 | 说明 |
|------|---------|------|
| 页面 | `src/app/dashboard/ai-chat/page.tsx` | Server Component，渲染 AiChatDemo |
| 主组件 | `src/features/ai-chat/components/ai-chat-demo.tsx` | Client Component，消息管理 + 流式渲染 |
| UI 组件 | `src/components/ui/{message,bubble,marker,message-scroller}.tsx` | 聊天气泡、输入框等 |
| API Route | `src/app/api/ai/chat/route.ts` | POST /api/ai/chat，流式响应 |
| 统一 AI 层 | `src/lib/ai/index.ts` | chat() / stream() / testLlm() |
| Provider 适配器 | `src/lib/ai/providers/openai-compatible.ts` | OpenAI 兼容协议，原生 fetch |
| 类型定义 | `src/lib/ai/types.ts` | ChatMessage、LlmProviderConfig |

### 1.2 调用链路

```
前端 (useState 管理消息)
  │  POST /api/ai/chat { messages }
  │  response.body.getReader() 读纯文本流
  ▼
API Route (api/ai/chat/route.ts)
  │  getCurrentUser() 鉴权
  │  normalizeMessages() 校验 + 截 20 条
  │  拼接 system prompt（硬编码）
  │  创建 ReadableStream
  ▼
统一 AI 层 (lib/ai/index.ts)
  │  getDefaultProviderConfig('llm') 读 DB 配置
  ▼
OpenAI 兼容 Provider
  │  fetch {baseUrl}/chat/completions  SSE 流式
  ▼
外部 LLM API（DeepSeek / 豆包 / 任意兼容网关）
```

### 1.3 关键审计结论

| 审计项 | 状态 | 说明 |
|-------|------|------|
| 聊天页面 | ✅ 有 | `/dashboard/ai-chat` |
| 统一 LLM Client | ✅ 有 | `src/lib/ai/` 抽象层 |
| Provider 可替换 | ✅ 是 | 所有 OpenAI 兼容模型，配置化 |
| Tool Calling | ❌ 不支持 | 类型有预留（`tool` role、`tool_call_id`），实现全无 |
| 流式 Tool Call | ❌ 不支持 | 流式解析只提取 `delta.content`，忽略 `delta.tool_calls` |
| 聊天持久化 | ❌ 无 | 纯 React useState，刷新丢失 |
| Conversation 表 | ❌ 无 | DB 中无 conversations / chat_messages 表 |
| 用户信息注入 | ⚠️ 仅鉴权 | 只校验登录，不注入用户身份到 prompt |
| Workspace 上下文 | ❌ 无 | 全局页面，不绑定 workspace |
| Agent 能力 | ❌ 无 | 纯对话，无工具调用，无规划能力 |

### 1.4 Tool Calling 最小改动点

当前 `ChatMessage` 类型已预留 `tool` role 和 `tool_call_id`，但实现层完全缺失。最小改动需要：

1. **`openai-compatible.ts`** — 请求体增加 `tools` 和 `tool_choice` 参数
2. **`openai-compatible.ts`** — 非流式响应解析 `message.tool_calls`
3. **`openai-compatible.ts`** — 流式响应解析 `delta.tool_calls`（增量拼接）
4. **`lib/ai/index.ts`** — 暴露带 tools 参数的 chat / stream 方法
5. **`api/ai/chat/route.ts`** — `normalizeMessages()` 允许 `tool` role 通过

**改动量**：约 150 行代码，纯后端，不影响现有聊天功能。

---

## 二、现有 LLM 调用链审计

### 2.1 配置解析链路

```
provider_profiles 表（画像：module/provider/enabled/isDefault）
  ↓
provider_settings 表（键值对：key/value/isSecret）
  ↓
getDefaultProviderConfig('llm')  [lib/settings/store.ts]
  ↓ （AES-256-GCM 解密 secret 字段）
dbConfigToLlmProvider()  [lib/ai/index.ts]
  ↓
LlmProviderConfig { provider, baseUrl, apiKey, model, enabled, isDefault }
  ↓
openaiCompatibleChat / openaiCompatibleStream  [lib/ai/providers/openai-compatible.ts]
```

### 2.2 配置字段

| 字段 | 存储位置 | 加密 | 说明 |
|------|---------|------|------|
| base_url | provider_settings | 明文 | API 网关地址 |
| api_key | provider_settings | AES-256-GCM | API 密钥 |
| model | provider_settings | 明文 | 模型 ID |
| temperature | — | — | 硬编码 0.7，不可配置 |

### 2.3 所有 LLM 调用点

| # | 文件 | 函数 | 用途 | 流式 |
|---|------|------|------|------|
| 1 | `src/app/api/ai/chat/route.ts` | `stream()` | AI 助手对话 | ✅ |
| 2 | `src/lib/ai/automation-editing.ts` | `chat()` | 生成视频文案 | ❌ |
| 3 | `src/lib/ai/automation-editing.ts` | `chat()` | 生成视频关键词 | ❌ |
| 4 | `src/lib/settings/test.ts` | `testLlm()` | 连通性测试 | ❌ |

### 2.4 换模型需要改什么

**OpenAI 兼容模型（DeepSeek / 豆包 / 通义 / 智谱等）**：  
→ 零代码改动，在「系统管理 → 模型与接口」页面改配置即可。

**非兼容模型（如 Anthropic 原生、Gemini 原生）**：  
→ 需新增 provider 适配器（`src/lib/ai/providers/` 下新建），约 200 行。

---

## 三、视频生成完整链路审计

### 3.1 整体架构

```
前端 / Agent
  │
  ▼
API 层 (src/app/api/workspaces/[workspaceSlug]/automation/)
  ├── tasks/route.ts          ← 创建/查询/删除任务
  ├── ai/route.ts             ← AI 生成脚本/关键词
  ├── assets/route.ts         ← 素材上传
  ├── voices/route.ts         ← 音色列表
  └── voice-preview/route.ts  ← 配音试听
  │
  ▼
Service 层 (src/lib/workspaces/)
  ├── automation-editing.ts   ← 任务 CRUD + 参数解析
  └── moneyprinter-engine.ts  ← 引擎调度 + Voice Service 集成
  │
  ▼
Worker 进程 (scripts/run-moneyprinter-task.ts)
  │
  ├─► Voice Service  ← 配音生成
  │
  └─► MoneyPrinterTurbo CLI (cli.py)  ← 视频渲染
       │
       └─► 输出: storage/tasks/{taskId}/final-1.mp4
```

### 3.2 Task Payload 关键字段

| 分类 | 字段 | 说明 |
|------|------|------|
| 基础 | `prompt` | 视频主题（必填） |
| 脚本 | `scriptText` | 手动指定脚本，空则 AI 生成 |
| 脚本 | `scriptLanguage` / `keywords` | 语言 / 关键词 |
| 素材 | `materialSource` | 企业素材库 / 在线素材 / 本地素材 |
| 素材 | `materialAssetIds` | 上传素材 ID 数组 |
| 素材 | `stitchMode` | 按顺序拼接 / 随机拼接 |
| 素材 | `matchByScript` | 按脚本关键词匹配素材 |
| 画面 | `videoRatio` | 竖屏 9:16 / 横屏 16:9 / 方屏 1:1 |
| 画面 | `clipDuration` | 片段时长（3秒/5秒/随机） |
| 配音 | `voiceMode` / `voiceName` / `voiceSpeed` / `voiceVolume` | 配音参数 |
| 音乐 | `musicSource` / `musicVolume` | BGM 参数 |
| 字幕 | `subtitleEnabled` / `subtitleFont` / `subtitleSize` / `subtitleColor` 等 | 字幕参数 |
| 扩展 | `packagingOptions` | 扩展字段（count、clipSpeed、customBgm 等） |

### 3.3 Agent 生成视频的最小调用链

**服务端直接调用（推荐，Agent Orchestrator 内部使用）**：

| 步骤 | 函数 | 说明 |
|------|------|------|
| 1 | `createAutomationVideoTask(workspaceId, userId, input)` | 创建任务，返回 task |
| 2 | `startMoneyPrinterTaskWorker(task.id)` | 启动渲染（异步） |
| 3 | `getAutomationVideoTask(workspaceId, taskId)` | 轮询状态 + outputVideos |

**最简 payload**：
```json
{
  "prompt": "无菌灌装科普视频",
  "scriptText": "预生成的脚本...",
  "materialAssetIds": ["asset-id-1", "asset-id-2"],
  "voiceName": "voice-guanggao",
  "videoRatio": "竖屏 9:16",
  "stitchMode": "按顺序拼接"
}
```

### 3.4 当前任务数据是否支持「打开高级编辑」预填

**结论：完全支持。**

`automation_video_tasks` 表存储了完整的任务参数（脚本、素材 ID、配音、字幕、BGM 等），自动化剪辑工作台页面本身就是通过读取任务数据来预填表单的。

Agent 生成方案后，只需：
1. 将方案保存为 `draft` 状态的任务（不启动渲染）
2. 「打开高级编辑」链接跳转到 `/dashboard/workspaces/{slug}/automation/tasks/{taskId}`
3. 工作台页面读取任务数据并预填所有参数

---

## 四、视频素材索引现状审计

### 4.1 现状总览

**核心结论：企业已有人工语义索引，但当前应用尚未接入为 Agent 可查询的数据源。**

| 维度 | 现状 |
|------|------|
| 人工语义索引 | ✅ 有 | `索引总表.md`，90 条精选素材，与真实文件 100% 匹配 |
| 索引位置 | 素材目录内 | `D:\知衡智企数据库\素材资源\索引总表.md`（与素材同级） |
| 真实精选视频 | 90 条 | 横屏 69 + 竖屏 21 |
| 匹配度 | 90/90 全匹配 | 缺失 0，冗余 0，时长错误 0 |
| 精确重复组 | 13 组，涉及 28 个文件 | 同一组内素材内容高度相似 |
| 上传素材索引 | ✅ SQLite 表 `automation_video_assets`（但字段极简，无语义） |
| 应用层接入 | ❌ 未接入 | 当前视频库只做文件系统扫描，不读取语义索引 |
| Agent 可查询 | ❌ 不可用 | 没有结构化的查询接口 |

### 4.2 人工索引包含的语义字段

`索引总表.md` 中已有的字段（人工维护）：

| 字段 | 说明 |
|------|------|
| 分类 | 如：生产线·灌装、真人口播、研发操作、样品陈列等 |
| 文件名 | 对应真实磁盘文件名 |
| 时长 | 视频时长（秒） |
| 拍摄内容 | 画面内容的文字描述 |
| 拍摄角度 | 如：平视、特写、俯拍、仰拍等 |
| 横竖屏 | 横屏 / 竖屏 |

### 4.3 上传素材表字段（极简，仅上传用）

```
id / workspaceId / uploadedBy / name / fileUrl / fileType / mimeType / size / status
```

**注意**：上传素材表是上传流程的记录，不是语义索引。语义索引目前以 Markdown 形式人工维护在素材目录中。

### 4.4 路径映射体系

| 素材来源 | 路径获取方式 | 示例 |
|---------|-------------|------|
| 本地素材目录 | `getPath('assets')` | `D:\知衡智企数据库\素材资源` |
| 视频成品目录 | `getPath('videos')` | `D:\知衡智企数据库\视频文件` |
| 上传素材 | `public/` + fileUrl | `public/uploads/automation-assets/{slug}/{uuid}.mp4` |

统一由 StorageService（`src/lib/storage/index.ts`）管理，配置存在 `storage_configs` 表。

### 4.5 当前索引的问题

1. **Markdown 格式，程序难以高效查询**：Agent 不能每次都解析整个 Markdown 文件来搜索素材
2. **应用层未接入**：视频库页面、自动化剪辑工作台都没有读取这个索引
3. **缺少结构化字段**：如分辨率、标签、重复组标记、优选标记等
4. **无统一查询接口**：Agent 需要一个 `search_video_assets` 工具来检索

**好消息**：索引内容本身已经高质量存在（90 条全匹配），V1 阶段只需要把它转化为程序可读的格式，不需要从零建索引。

---

## 五、Video Asset Search Tool 设计

### 5.1 方案选型

**推荐方案：B. JSON 索引文件（V1 优先）**

**索引总表.md → 生成/维护 video-assets.json → search_video_assets 读取 JSON → 返回前检查真实文件是否存在**

理由：
- 当前只有 90 条精选素材，JSON 文件完全够用，查询性能无压力
- 索引内容已经高质量存在（人工维护的 Markdown），只需转换格式
- 实现简单，不需要建表、不需要 migration
- Agent Tool 直接读 JSON 文件，代码量最小
- 文件放在素材目录旁，与现有 StorageService 路径体系一致
- 未来素材达到几千/几万条后，再评估 SQLite FTS / video_asset_catalog / 向量检索

**不选其他方案的原因**：
- A. 直接解析 Markdown：每次查询都要解析 Markdown，效率低，格式不稳定
- C. 写入 SQLite：90 条数据过度设计，增加 schema 维护成本，V1 不需要
- D. 独立 index 服务：完全不需要

### 5.2 JSON 索引文件约定

#### 文件位置

```
D:\知衡智企数据库\素材资源\video-assets.json
```

（与 `索引总表.md` 同级，通过 `getPath('assets')` + `video-assets.json` 定位）

#### JSON Schema

```json
{
  "version": 1,
  "generatedAt": "2026-08-26T10:00:00Z",
  "source": "索引总表.md",
  "totalCount": 90,
  "assets": [
    {
      "fileName": "GZ001_生产线灌装_01.mp4",
      "relativePath": "生产线·灌装/GZ001_生产线灌装_01.mp4",
      "category": "生产线·灌装",
      "durationSeconds": 8.5,
      "content": "无菌灌装生产线全景，工人操作灌装机，瓶子快速通过",
      "cameraAngle": "平视",
      "orientation": "horizontal",
      "width": 1920,
      "height": 1080,
      "tags": ["灌装", "生产线", "无菌", "自动化"],
      "duplicateGroup": "dup-gz-001",
      "preferred": true
    }
  ]
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `fileName` | string | 文件名（含扩展名） |
| `relativePath` | string | 相对于素材根目录的路径，用于拼接绝对路径 |
| `category` | string | 分类（如：生产线·灌装、真人口播） |
| `durationSeconds` | number | 时长（秒） |
| `content` | string | 拍摄内容描述 |
| `cameraAngle` | string | 拍摄角度 |
| `orientation` | string | `horizontal` / `vertical` / `square` |
| `width` / `height` | number | 分辨率 |
| `tags` | string[] | 标签数组 |
| `duplicateGroup` | string \| null | 重复组 ID，同一组内容高度相似 |
| `preferred` | boolean | 是否为优选素材（重复组中默认选 preferred 的） |

#### 重复组规则

- 同一 `duplicateGroup` 的素材，Agent 在一条成片中默认最多选择 1 个
- 优先选择 `preferred: true` 的素材
- 避免同一段内容重复出现在视频中

### 5.3 search_video_assets Tool 接口

**输入**：
```typescript
{
  query?: string;              // 自由文本搜索（匹配 content / tags / fileName）
  categories?: string[];       // 按分类筛选
  orientation?: 'horizontal' | 'vertical' | 'square';
  minDuration?: number;        // 最小时长（秒）
  maxDuration?: number;        // 最大时长
  cameraAngles?: string[];     // 按拍摄角度筛选
  tags?: string[];             // 按标签筛选
  excludeDuplicates?: boolean; // 同一重复组只返回 1 个（默认 true）
  limit?: number;              // 返回数量，默认 10
}
```

**输出**：
```typescript
Array<{
  fileName: string;
  absolutePath: string;        // 拼接后的磁盘绝对路径
  category: string;
  durationSeconds: number;
  content: string;
  cameraAngle: string;
  orientation: string;
  tags: string[];
  duplicateGroup: string | null;
  preferred: boolean;
  fileExists: boolean;         // 返回前实时检查文件是否真实存在
}>
```

### 5.4 实现要点

1. **JSON 加载 + 缓存**：启动时或首次调用时加载 JSON 到内存，mtime 校验自动刷新
2. **内存过滤**：90 条数据直接在内存中 filter + sort，性能足够
3. **文件存在性校验**：返回结果前，逐个用 `fs.stat()` 检查真实文件是否存在，不存在则标记 `fileExists: false` 或过滤掉
4. **绝对路径拼接**：`path.join(assetsRoot, asset.relativePath)`
5. **JSON 生成/维护**：由内容侧（WorkBuddy / Codex）负责从 `索引总表.md` 生成 `video-assets.json`，Agent 侧只读

### 5.5 未来升级路径

当素材量达到 1000+ 或需要更复杂的检索能力时：

```
JSON Index (V1)
    ↓ 素材量增长
SQLite + FTS5 (V2)
    ↓ 需要语义检索
向量数据库 (V3)
```

V1 的 JSON 设计与未来 SQLite 表结构完全兼容，迁移成本低。

---

## 六、Agent V1 工具集设计

### 6.1 设计原则

- 最少工具集，先打通自动剪辑闭环
- 低风险操作自动执行，高成本操作需确认
- 复用现有 Service，不重复造轮子
- 每个 Tool 做一件事，Agent 负责编排

### 6.2 V1 工具清单（6 个）

| # | Tool 名称 | 类型 | 风险 | 复用现有能力 | 说明 |
|---|----------|------|------|-------------|------|
| 1 | `search_video_assets` | 查询 | 低 | 需新建 JSON 索引读取 + 查询逻辑 | 搜索视频素材，返回带语义信息的素材列表 |
| 2 | `generate_video_script` | 生成 | 低 | 复用 `generateAutomationVideoCopy` | 根据主题生成视频脚本 + 关键词 |
| 3 | `list_voices` | 查询 | 低 | 复用 `listVoices()` | 列出可用音色（名称、场景、性别） |
| 4 | `create_video_plan` | 生成 | 低 | 需新建（纯逻辑，不触发渲染） | 生成完整剪辑方案：脚本 + 素材列表 + 配音 + 字幕 + BGM 参数 |
| 5 | `execute_video_task` | 执行 | 高（需确认） | 复用 `createAutomationVideoTask` + `startMoneyPrinterTaskWorker` | 真正创建任务并启动渲染 |
| 6 | `get_video_task_status` | 查询 | 低 | 复用 `getAutomationVideoTask` | 查询任务状态和输出结果 |

### 6.3 为什么不需要更多 Tool

- **不需要 `get_video_asset`**：search 返回的信息已足够，详情可在结果中查看
- **不需要 `generate_voice` / `select_voice`**：音色选择在 plan 阶段由 LLM 根据 list_voices 结果决定，配音生成在引擎执行时自动处理
- **不需要 `render_video`**：execute_video_task 已经包含创建 + 启动渲染
- **不需要单独的字幕/BGM Tool**：这些是 plan 的一部分，在 create_video_plan 中统一设置默认值

---

## 七、Agent 一次真实工作流程

### 场景

> 用户：「帮我做一条30秒视频，主题是为什么饮料代工厂要重视无菌灌装，老板IP风格，发布到抖音。」

### 执行时序

```
用户消息
  │
  ▼
┌─────────────────────────────────────────┐
│  Step 1: 理解意图 + 搜索素材             │
└─────────────────────────────────────────┘
  │
  ├─ Agent 调用: search_video_assets
  │   参数: { query: "无菌灌装 生产线 品控",
  │           categories: ["生产线·灌装", "研发操作", "工厂环境"],
  │           orientation: "vertical", limit: 15 }
  │
  ├─ Tool 返回: 12 个匹配素材（含文件名、时长、内容描述、角度）
  │
  ▼
┌─────────────────────────────────────────┐
│  Step 2: 生成脚本                        │
└─────────────────────────────────────────┘
  │
  ├─ Agent 调用: generate_video_script
  │   参数: { topic: "为什么饮料代工厂要重视无菌灌装",
  │           style: "老板IP科普",
  │           duration: "30秒",
  │           platform: "抖音" }
  │
  ├─ Tool 返回: { script: "大家好，我是XXX...",
  │               keywords: ["无菌灌装", "饮料代工厂", "食品安全"] }
  │
  ▼
┌─────────────────────────────────────────┐
│  Step 3: 选择音色                        │
└─────────────────────────────────────────┘
  │
  ├─ Agent 调用: list_voices
  │   参数: { scene: "解说", gender: "male" }
  │
  ├─ Tool 返回: [
  │     { voiceId: "voice-jieshuo", name: "解说小明", scene: "解说" },
  │     { voiceId: "voice-wenan", name: "温暖阿虎", scene: "情感" }
  │   ]
  │
  ▼
┌─────────────────────────────────────────┐
│  Step 4: 生成剪辑方案（Plan）            │
└─────────────────────────────────────────┘
  │
  ├─ Agent 调用: create_video_plan
  │   参数: {
  │     script: "...",
  │     assets: [asset1, asset2, ..., asset7],  // 从搜索结果中挑选
  │     voiceId: "voice-jieshuo",
  │     videoRatio: "竖屏 9:16",
  │     stitchMode: "按顺序拼接",
  │     subtitleStyle: "简洁商务字幕",
  │     musicSource: "AI 自动匹配音乐"
  │   }
  │
  ├─ Tool 返回: {
  │     planId: "plan-uuid",
  │     estimatedDuration: 32,
  │     assetCount: 7,
  │     voiceName: "解说小明",
  │     taskInput: { ... }  // 完整的 AutomationVideoTaskInput
  │   }
  │
  ▼
┌─────────────────────────────────────────┐
│  Step 5: 向用户展示方案，请求确认         │
└─────────────────────────────────────────┘
  │
  │  Agent 回复用户：
  │  "我已经准备好视频方案：
  │
  │   主题：为什么饮料代工厂要重视无菌灌装
  │   预计时长：32 秒
  │   使用素材：7 个（生产线·灌装 4个 + 研发操作 2个 + 工厂环境 1个）
  │   配音：解说小明
  │   比例：竖屏 9:16（抖音）
  │   字幕：简洁商务字幕
  │
  │   [开始生成]  [修改方案]  [打开高级编辑]"
  │
  ▼
┌─────────────────────────────────────────┐
│  Step 6: 用户确认 → 执行渲染             │
└─────────────────────────────────────────┘
  │
  ├─ 用户点击「开始生成」
  │
  ├─ Agent 调用: execute_video_task
  │   参数: { planId: "plan-uuid" }
  │
  ├─ Tool 返回: { taskId: "task-uuid", status: "generating" }
  │
  ▼
┌─────────────────────────────────────────┐
│  Step 7: 轮询状态 → 返回结果             │
└─────────────────────────────────────────┘
  │
  ├─ Agent 调用: get_video_task_status
  │   参数: { taskId: "task-uuid" }
  │
  ├─ 轮询 3~5 次（间隔 5 秒）
  │
  ├─ 最终返回: {
  │     status: "pending_review",
  │     outputVideos: ["D:/.../final-1.mp4"],
  │     duration: 31.5
  │   }
  │
  ▼
  Agent 回复用户：
  "视频已生成！时长 31.5 秒，点击查看。
   [播放视频]  [查看任务]  [重新生成]"
```

---

## 八、Plan → Confirm → Execute 机制

### 8.1 设计思路

Agent 不直接执行高成本操作，而是先生成 Plan 存入会话状态，用户确认后再 Execute。

### 8.2 实现方式

```
Agent Orchestrator
  │
  ├─ 低风险 Tool（search、generate_script、list_voices、create_plan、get_status）
  │   → 直接执行，结果返回给 LLM
  │
  └─ 高风险 Tool（execute_video_task）
      ├─ 第一次调用时：不执行，返回「需要用户确认」
      ├─ 将 plan 存入当前 conversation 的 pendingPlans
      ├─ 前端渲染「确认/取消」按钮
      └─ 用户确认后：真正执行 execute_video_task
```

### 8.3 具体实现

1. **Tool 元数据增加 `riskLevel: 'low' | 'high'`** 标记
2. **Orchestrator 检测高风险 Tool 调用** → 不执行，生成 `confirmation_required` 事件
3. **前端收到 confirmation 事件** → 渲染确认卡片
4. **用户确认** → 发送 `confirm` 消息到后端 → Orchestrator 继续执行被挂起的 Tool
5. **用户取消** → 发送 `cancel` 消息 → Orchestrator 丢弃 pending plan

### 8.4 数据结构

```typescript
interface PendingAction {
  planId: string;
  toolName: string;
  toolArgs: Record<string, any>;
  summary: string;           // 给用户看的方案摘要
  createdAt: number;
  expiresAt: number;         // 15 分钟过期
}
```

---

## 九、全局「知衡助手」UI 架构

### 9.1 挂载位置

**推荐：`src/app/dashboard/layout.tsx`**

理由：
- 所有 dashboard 页面共享此 layout
- 不影响登录页、首页等非 dashboard 页面
- 现有 dashboard layout 已有 Sidebar + Header 结构，可直接加悬浮球

### 9.2 架构设计

```
app/dashboard/layout.tsx
  │
  ├─ <DashboardShell />          ← 现有：Sidebar + Header + 内容区
  │
  └─ <ZhihengAssistant />        ← 新增：全局悬浮助手
       │
       ├─ 状态：Zustand Store（跨页面保持对话状态）
       ├─ 位置：fixed 定位，右下角
       ├─ 形态：悬浮球 / 展开面板（可切换）
       ├─ 面板：右侧抽屉式，宽度 420px
       └─ 内容：对话列表 + 输入框 + Tool 调用状态展示
```

### 9.3 状态保持方案

使用 **Zustand + localStorage** 实现跨页面对话保持：

- 对话消息存在 Zustand store 中
- 页面跳转时，store 不销毁（因为组件在 layout 层，不卸载）
- 刷新页面时，从 localStorage 恢复最近 N 条消息（V1 可先不做持久化，刷新丢失也可接受）

### 9.4 上下文感知

Agent 通过以下方式知道当前页面：

1. **当前 route**：监听 `usePathname()`，实时同步到 Agent Context
2. **当前 workspace**：从 session / workspace context 读取
3. **当前实体**：通过页面级 Provider 注入（如 CustomerPage 提供 `currentEntity`）

### 9.5 实体上下文注入机制

使用 React Context 实现「页面 → Agent」的上下文传递：

```typescript
// 定义
const AgentEntityContext = createContext<AgentEntity | null>(null);

// 客户详情页使用
<AgentEntityContext.Provider value={{ type: 'customer', id: customer.id, data: customer }}>
  {/* 页面内容 */}
</AgentEntityContext.Provider>

// ZhihengAssistant 组件读取
const entity = useContext(AgentEntityContext);
// 发送消息时附带 entity 信息
```

---

## 十、Agent Context 设计

### 10.1 Context 结构

```typescript
interface AgentContext {
  user: {
    id: string;
    name: string;
    role: string;           // super_admin / admin / member
    employeeNo: string;
  };
  workspace: {
    id: string;
    slug: string;
    name: string;
    role: string;           // owner / admin / member
  } | null;
  route: string;            // 当前路径，如 /dashboard/workspaces/...
  entity: {
    type: 'customer' | 'product' | 'video_task' | null;
    id: string | null;
    data?: Record<string, any>;  // 可选：实体摘要数据
  } | null;
  conversation: {
    id: string;
    createdAt: string;
  };
}
```

### 10.2 传递方式

- **服务端**：每次 API 请求时，从 session + workspace + 路由参数解析 context，注入到 system prompt
- **客户端**：发送消息时附带 context 字段，服务端校验后使用

### 10.3 System Prompt 注入示例

```
你是知衡智企的 AI 助手。

当前用户：{user.name}（{user.role}）
当前工作空间：{workspace.name}
当前页面：{route}
{entity ? `当前实体：${entity.type} - ${entity.data?.name}` : ''}

你可以使用以下工具：
- search_video_assets: 搜索视频素材
- generate_video_script: 生成视频脚本
- ...
```

---

## 十一、自动化剪辑工作台定位

### 11.1 双轨制

| 用户角色 | 主要入口 | 定位 |
|---------|---------|------|
| 普通员工 | 知衡助手 Agent | 自然语言描述需求，Agent 自动完成 |
| 高级用户 / 管理员 | 自动化剪辑工作台 | 精细控制每一个参数 |

### 11.2 Agent → 工作台的跳转

Agent 生成方案后，提供三个操作：

```
[开始生成]    → 直接调用 execute_video_task
[修改方案]    → 继续对话调整参数
[打开高级编辑] → 跳转到工作台，预填所有参数
```

「打开高级编辑」实现方式：
1. Agent 调用 `create_video_plan` 时，将方案保存为 `draft` 状态的任务（不启动渲染）
2. 跳转链接：`/dashboard/workspaces/{slug}/automation/tasks/{taskId}`
3. 工作台页面读取任务数据，预填所有四栏参数
4. 用户在工作台中调整后，手动点击「生成视频」

### 11.3 工作台 → Agent 的回流

工作台页面也可以有「问问助手」按钮，点击打开悬浮助手并带入当前任务上下文，Agent 可以基于当前任务给出建议或修改方案。

---

## 十二、技术栈选择

### 12.1 不引入重型框架

| 框架 | 不引入原因 |
|------|-----------|
| LangChain | 过度抽象，调试困难，本地可控性差 |
| LangGraph | 状态机复杂，V1 阶段不需要多轮复杂规划 |
| CrewAI / AutoGen | 多 Agent 架构，当前不需要 |
| Dify Agent | 外部依赖，与现有系统集成成本高 |

### 12.2 V1 技术栈

```
现有 LLM Client (lib/ai)
  +
Tool Calling（在 openai-compatible 基础上扩展）
  +
Agent Orchestrator（手写，约 300 行）
  +
Tool Registry（手写，约 100 行）
  +
现有业务 Service（automation-editing / moneyprinter-engine / voice-catalog）
  +
Zustand（前端状态管理，项目已有）
```

### 12.3 为什么手写 Orchestrator

- 逻辑清晰，每一步都可控可调试
- 与现有业务 Service 无缝对接
- 不需要学习新框架的 API 和概念
- 未来需要更复杂能力时，可以逐步演进
- 代码量小（V1 预计 500 行以内）

---

## 十三、数据和安全边界

### 13.1 架构原则

```
浏览器（Agent UI）
  │  POST /api/agent/chat { messages, context }
  ▼
Agent API Route（服务端）
  │  getCurrentUser() 鉴权
  │  校验 workspace 权限
  │  解析 Agent Context
  ▼
Agent Orchestrator（服务端）
  │  调用 LLM（带 tools）
  │  解析 tool_calls
  ▼
Tool Registry（服务端）
  │  权限校验（每个 Tool 有自己的权限要求）
  │  参数校验（Zod schema）
  ▼
业务 Service（服务端）
  │  automation-editing / moneyprinter-engine / ...
  ▼
数据库 / 文件系统 / 外部服务
```

**关键：所有 Tool 执行都在服务端，浏览器端只负责展示对话和确认操作。**

### 13.2 权限继承

Agent Tool 复用现有权限体系，不绕过任何权限检查：

| Tool | 权限要求 | 复用现有校验 |
|------|---------|-------------|
| `search_video_assets` | workspace 成员 | 同素材库页面权限 |
| `generate_video_script` | workspace 成员 | 同 AI 文案生成权限 |
| `list_voices` | workspace 成员 | 同音色库页面权限 |
| `create_video_plan` | workspace 成员 | 同工作台访问权限 |
| `execute_video_task` | `video:generate` 权限 | 同创建任务 API 权限 |
| `get_video_task_status` | workspace 成员 | 同任务列表权限 |

### 13.3 安全措施

1. **用户鉴权**：每次请求都走 `getCurrentUser()`，与现有 API 一致
2. **Workspace 权限**：校验用户是否为当前 workspace 成员
3. **Tool 级权限**：每个 Tool 定义所需权限，Registry 执行校验
4. **参数校验**：所有 Tool 参数用 Zod schema 校验
5. **路径安全**：文件操作必须在允许的目录内（同现有素材 API）
6. **速率限制**：Agent 对话也应遵循 API 速率限制
7. **审计日志**：高风险操作（execute_video_task）记录操作日志

---

## 十四、推荐目录结构

```
src/
├── lib/
│   ├── agent/                          ← 新增：Agent 核心
│   │   ├── orchestrator.ts             ← Agent 编排器（LLM + Tool 循环）
│   │   ├── types.ts                    ← Agent 类型定义
│   │   ├── context/                    ← Agent Context
│   │   │   ├── index.ts                ← 统一导出
│   │   │   ├── agent-context.ts        ← Agent Context 解析
│   │   │   └── company-context-loader.ts ← 企业定位加载（JSON 优先 + Markdown 兜底）
│   │   ├── tool-registry.ts            ← Tool 注册与调度
│   │   ├── permissions.ts              ← Tool 权限校验
│   │   └── tools/                      ← 各个 Tool 实现
│   │       ├── video-assets.ts         ← search_video_assets（读 JSON 索引）
│   │       ├── video-script.ts         ← generate_video_script
│   │       ├── voices.ts               ← list_voices
│   │       ├── video-plan.ts           ← create_video_plan
│   │       ├── video-task.ts           ← execute_video_task + get_status
│   │       └── index.ts                ← Tool 统一导出
│   │
│   ├── ai/                             ← 现有：扩展 tool calling
│   │   ├── index.ts                    ← 增加 chatWithTools / streamWithTools
│   │   ├── types.ts                    ← 增加 ToolCall 类型
│   │   └── providers/
│   │       └── openai-compatible.ts    ← 扩展 tools 参数 + 流式 tool_calls
│   │
│   └── video-asset-index/              ← 新增：视频素材 JSON 索引读取
│       ├── index.ts                    ← 加载 + 查询 + 缓存
│       └── types.ts                    ← JSON Schema 类型定义
│
├── app/
│   └── api/
│       └── agent/                      ← 新增：Agent API
│           ├── chat/route.ts           ← 对话接口（流式）
│           └── confirm/route.ts        ← 确认高风险操作
│
├── features/
│   └── zhiheng-assistant/              ← 新增：全局悬浮助手 UI
│       ├── zhiheng-assistant.tsx       ← 主组件（悬浮球 + 面板）
│       ├── chat-view.tsx               ← 对话视图
│       ├── tool-call-status.tsx        ← Tool 调用状态展示
│       ├── confirmation-card.tsx       ← 确认操作卡片
│       └── store.ts                    ← Zustand 状态管理
│
├── components/
│   └── agent-entity-provider.tsx       ← 页面级实体上下文 Provider
│
└── app/dashboard/layout.tsx            ← 现有：挂载 ZhihengAssistant
```

---

## 十五、V1 实施阶段规划

### 阶段 0：基础设施 — LLM Tool Calling（预计 1 天）

目标：让 LLM 支持 Tool Calling，为 Agent 打基础

- [ ] 扩展 `openai-compatible.ts` 支持 tools / tool_calls
- [ ] 扩展 `lib/ai/index.ts` 暴露带 tools 的 chat / stream 方法
- [ ] 扩展 `ChatMessage` 类型完善 tool 相关字段
- [ ] 验证：用 testLlm 验证 tool calling 可用

### 阶段 1：素材 JSON 索引 + search_video_assets（预计 0.5 天）

目标：让 Agent 可以搜索 90 条精选素材

- [ ] 实现 `video-asset-index` 模块（JSON 加载 + 内存查询 + mtime 缓存）
- [ ] 实现 `search_video_assets` Tool
- [ ] 文件存在性校验（返回前 fs.stat 检查）
- [ ] 重复组去重逻辑
- [ ] 验证：用 curl 测试素材搜索可用

### 阶段 2：Agent 后端核心（预计 2 天）

目标：Agent Orchestrator + Tool Registry + 6 个 Tool + Context

- [ ] Agent Orchestrator 核心（LLM + Tool 调用循环）
- [ ] Tool Registry + 权限校验
- [ ] 实现 6 个 V1 Tool
- [ ] Agent Context 解析（用户、workspace、route、entity）
- [ ] Company Context Loader（JSON 优先 + Markdown 兜底 + guardrails）
- [ ] Plan → Confirm → Execute 机制
- [ ] `/api/agent/chat` 流式接口
- [ ] 验证：用 curl 测试完整对话 + 工具调用 + 确认流程

### 阶段 3：全局悬浮助手 UI（预计 2 天）

目标：用户可以在任何页面使用知衡助手

- [ ] ZhihengAssistant 主组件（悬浮球 + 右侧面板）
- [ ] 对话视图（复用现有 message/bubble 组件）
- [ ] Tool 调用状态展示（思考中、调用工具、等待确认）
- [ ] 确认操作卡片
- [ ] Zustand store（跨页面状态保持）
- [ ] Agent Entity Context Provider
- [ ] 挂载到 dashboard layout
- [ ] 验证：跨页面跳转对话不中断

### 阶段 4：联调 + 打磨（预计 1 天）

目标：端到端可用

- [ ] 端到端测试：一句话 → 搜索素材 → 生成脚本 → 确认 → 生成视频
- [ ] 错误处理（LLM 失败、Tool 失败、权限不足）
- [ ] 加载状态和空状态
- [ ] 响应式适配
- [ ] 性能优化

**总计：约 6.5 天**

---

## 十六、第一阶段最少修改文件清单

（阶段 0 + 阶段 1，共 6 个文件）

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `src/lib/ai/types.ts` | 修改 | 完善 ToolCall 类型 |
| 2 | `src/lib/ai/providers/openai-compatible.ts` | 修改 | 增加 tools 参数 + 解析 tool_calls |
| 3 | `src/lib/ai/index.ts` | 修改 | 暴露 chatWithTools / streamWithTools |
| 4 | `src/lib/video-asset-index/types.ts` | 新建 | JSON Schema 类型定义 |
| 5 | `src/lib/video-asset-index/index.ts` | 新建 | JSON 加载 + 内存查询 + 缓存 |
| 6 | `src/lib/agent/tools/video-assets.ts` | 新建 | search_video_assets Tool 实现 |

---

## 十七、最终判断：距离目标还差什么

### 目标

> 用户对知衡助手说一句话 → Agent 自己选择素材 → 调用现有视频工具 → 生成一条视频

### 差距分析（7 个关键缺口）

| # | 能力 | 现状 | 差距 | 优先级 |
|---|------|------|------|--------|
| 1 | LLM Tool Calling | ❌ 不支持 | 需扩展 openai-compatible 适配器 | 🔴 最高 |
| 2 | Agent Orchestrator + Tool Registry | ❌ 无 | 需手写编排逻辑 + 注册机制 + 权限校验 | 🔴 最高 |
| 3 | 90 条精选素材 JSON Index + search_video_assets | ⚠️ 人工索引存在，未接入程序 | 需 JSON 读取模块 + Tool 封装 | 🔴 最高 |
| 4 | Video Skill Loader（视频生成能力封装） | ⚠️ 引擎可用，需封装为 Tool | 需将 createAutomationVideoTask + startWorker 封装为 execute_video_task | 🟠 高 |
| 5 | Company Context Loader | ❌ 无 | 需实现 JSON 优先 + Markdown 兜底 + guardrails | 🟠 高 |
| 6 | Plan → Confirm → Execute | ❌ 无 | 需确认机制（高风险操作需用户确认） | � 中高 |
| 7 | 全局知衡助手 UI | ❌ 无 | 需悬浮球 + 右侧面板 + 跨页面状态保持 | 🟠 高 |

### 已具备的能力（直接复用）

| 能力 | 状态 | 复用方式 |
|------|------|---------|
| 视频生成引擎 | ✅ MoneyPrinterTurbo 完整可用 | execute_video_task 直接调用 |
| Voice Service | ✅ 配音服务正常运行 | 引擎执行时自动调用 |
| 任务系统 | ✅ automation_video_tasks 完整 | 复用任务 CRUD + 状态查询 |
| 音色库 | ✅ voice_catalog 表 + listVoices | list_voices Tool 直接封装 |
| 脚本生成 | ✅ generateAutomationVideoCopy 已有 | generate_video_script Tool 直接封装 |
| LLM 抽象层 | ✅ 统一 OpenAI 兼容适配器 | 扩展 tool calling 即可 |
| 权限体系 | ✅ session + workspace + role | Tool Registry 复用现有校验 |
| StorageService | ✅ 路径统一管理 | 素材路径、知识文件路径统一获取 |
| 人工语义索引 | ✅ 90 条精选素材索引已存在 | 转换为 JSON 后直接读取 |

### 核心结论

**距离目标有 7 个关键能力缺失，但视频生成引擎本身已经完全可用。**

按依赖关系排序：

1. **LLM Tool Calling 能力**（1 天）  
   当前 LLM 抽象层只支持纯文本对话，不支持工具调用。需要在 `openai-compatible.ts` 中增加 `tools` 参数和 `tool_calls` 解析。这是 Agent 的基础。

2. **90 条精选素材 JSON Index + search_video_assets**（0.5 天）  
   人工语义索引已经高质量存在（90 条全匹配），只需封装为 JSON 读取模块 + Tool。Agent 才能知道哪个视频是"无菌灌装"、哪个是"研发操作"。

3. **Agent Orchestrator + Tool Registry**（1.5 天）  
   需要一个编排器来管理 LLM 调用、Tool 执行、状态流转。还需要把现有业务能力封装成标准化的 Tool。

4. **Video Skill Loader**（0.5 天）  
   将现有的 `createAutomationVideoTask` + `startMoneyPrinterTaskWorker` 封装为 `execute_video_task` Tool。

5. **Company Context Loader**（0.5 天）  
   读取 `agent-company-context.json`，注入企业定位和 guardrails 到 system prompt。JSON 不存在时降级读 Markdown。

6. **Plan → Confirm → Execute**（0.5 天）  
   高成本操作（生成视频）需要用户确认后才执行。

7. **全局知衡助手 UI**（2 天）  
   悬浮球 + 右侧面板 + 跨页面状态保持 + 实体上下文注入。

**好消息**：MoneyPrinterTurbo + Voice Service + 自动化剪辑工作台已经形成完整的生产链路，Agent 只需要作为"智能前端"来调用这些能力，不需要改动引擎层。

**总工作量：约 6.5 天可实现 V1 闭环。**

---

## 十八、企业内容定位库读取机制设计

> 说明：本章为纯设计，不创建、不修改任何企业定位文件。  
> 企业定位内容由 WorkBuddy 并行建设，Agent 侧只负责"如何读取"。  
> 所有文件路径、格式、Schema 均视为外部输入，Agent 侧做兼容和容错。

### 18.1 设计原则

1. **企业定位是外部输入**：Agent 不生成、不修改、不写入定位文件
2. **按需加载**：不是启动时全量读入内存，而是 Agent 需要时才加载
3. **容错优先**：文件缺失、格式不对、字段不全 → 降级处理，不报错
4. **与 StorageService 对齐**：通过 `getPath('knowledge')` 获取知识文件根目录，不硬编码路径
5. **缓存但可刷新**：内存缓存 + 文件 mtime 校验，文件更新后自动重新加载

### 18.2 文件发现机制

#### 根目录

通过 StorageService 获取：

```typescript
const knowledgeRoot = await getPath('knowledge');
// 如：D:\知衡智企数据库\知识文件
```

#### 约定目录结构

Agent 按以下约定路径查找企业定位文件（路径不存在则跳过）：

```
知识文件/
└── 视频内容策略/
    └── 01-企业定位/
        ├── 01-企业基本信息.md        # 公司简介、业务范围
        ├── 02-品牌定位.md            # 品牌调性、Slogan、视觉风格
        ├── 03-目标受众.md            # 客户画像、人群特征
        ├── 04-产品矩阵.md            # 产品线、核心卖点
        ├── 05-内容策略.md            # 内容方向、选题原则
        ├── 06-话术风格.md            # 语气、用词、禁忌词
        └── README.md                 # 目录说明（可选）
```

#### 发现逻辑

```typescript
// 伪代码
async function discoverCompanyContextFiles(): Promise<CompanyContextFile[]> {
  const knowledgeRoot = await getPath('knowledge');
  const baseDir = path.join(knowledgeRoot, '视频内容策略', '01-企业定位');

  // 检查目录是否存在
  if (!await fs.pathExists(baseDir)) {
    return []; // 目录不存在，返回空，不报错
  }

  // 读取目录下所有 .md 文件
  const files = await fs.readdir(baseDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));

  return mdFiles.map(filename => ({
    filename,
    absolutePath: path.join(baseDir, filename),
    // 从文件名提取语义 key，如 "01-企业基本信息" → "company_basic_info"
    key: filenameToKey(filename)
  }));
}
```

### 18.3 Context Loader 设计

#### 加载优先级

**优先读取 JSON，降级读取 Markdown。**

```
1. 读取 agent-company-context.json → 结构化注入（首选）
2. JSON 不存在 → 读取 Markdown 文件 → 纯文本注入（降级）
3. 都不存在 → 不注入企业定位上下文
```

#### 加载器层级

```
Agent Orchestrator
  │
  ▼
CompanyContextLoader  (单例，带缓存)
  │
  ├─ 优先加载：agent-company-context.json（结构化）
  ├─ 降级加载：Markdown 文件（纯文本）
  ├─ 格式解析（JSON → 结构化字段 / MD → 纯文本）
  ├─ 缓存管理（mtime 校验 + 内存缓存）
  └─ 缺失降级（文件不存在时返回空，不报错）
```

#### 核心接口

```typescript
interface CompanyContextLoader {
  // 获取结构化企业定位（JSON 存在时返回，否则返回 null）
  getStructured(): Promise<CompanyContextStructured | null>;

  // 获取纯文本形式的企业定位（JSON 或 Markdown，统一转成文本）
  getText(): Promise<string>;

  // 检查是否有企业定位数据
  isAvailable(): Promise<boolean>;

  // 获取 company guardrails（事实禁区清单）
  getGuardrails(): Promise<string[]>;

  // 强制刷新缓存
  refresh(): Promise<void>;
}
```

#### 结构化 JSON 约定（预期格式）

`agent-company-context.json` 预期包含（具体字段由 WorkBuddy 定义，Agent 侧做容错）：

```json
{
  "version": 1,
  "company": {
    "name": "企业名称",
    "industry": "所属行业",
    "businessScope": "业务范围",
    "introduction": "企业简介"
  },
  "brand": {
    "positioning": "品牌定位",
    "slogan": "品牌口号",
    "tone": "品牌调性"
  },
  "audience": {
    "primary": "主要受众",
    "secondary": "次要受众"
  },
  "products": [
    { "name": "产品名", "sellingPoints": ["卖点1", "卖点2"] }
  ],
  "contentStrategy": {
    "directions": ["内容方向1", "内容方向2"],
    "principles": ["选题原则1", "选题原则2"]
  },
  "voiceStyle": {
    "tone": "语气",
    "vocabulary": ["常用词"],
    "forbiddenWords": ["禁忌词"]
  },
  "guardrails": {
    "forbiddenFacts": [
      "产能",
      "客户名称",
      "合作品牌",
      "认证",
      "销售额",
      "成本",
      "行业排名",
      "从业年限",
      "具体经营数字"
    ]
  }
}
```

#### 注入到 System Prompt 的方式

```
你是知衡智企的 AI 助手，服务于「{企业名称}」。

【企业定位上下文】
{以下内容仅在定位文件存在时注入，不存在则省略此段}

--- 企业基本信息 ---
{结构化字段或 Markdown 内容}

--- 品牌定位 ---
{结构化字段或 Markdown 内容}

...（其他模块）

【企业事实 Guardrails】
以下信息缺失时，不得自行推断或编造：
- 产能、产量
- 客户名称、合作品牌
- 认证资质
- 销售额、成本、利润
- 行业排名、市场份额
- 从业年限、成立时间（除非明确给出）
- 其他具体经营数字

企业一般性内容可以使用常识性表达，但涉及上述企业专有事实时，
必须明确说明"需要确认"或"以官方数据为准"，不得虚构。
{以上内容结束}

请基于以上企业定位生成视频脚本和内容方案。
```

### 18.4 Schema 兼容策略

#### JSON 优先，Markdown 兜底

| 场景 | 处理方式 |
|------|---------|
| JSON 存在且格式正确 | 结构化注入，guardrails 从 JSON 读取 |
| JSON 存在但字段不全 | 用已有字段，缺失模块跳过 |
| JSON 不存在 | 降级读取 Markdown，纯文本注入 |
| JSON + Markdown 都存在 | 以 JSON 为准，Markdown 忽略 |
| 都不存在 | 不注入企业定位，Agent 用通用能力工作 |

#### 为什么优先 JSON

- 结构化字段更清晰，LLM 更容易准确理解
- guardrails 可以单独提取，作为系统级约束
- 避免 Markdown 格式不一致导致的理解偏差
- Markdown 保留给人阅读和维护，JSON 专供程序读取

### 18.5 缺失文件处理

| 缺失情况 | 处理方式 | 用户感知 |
|---------|---------|---------|
| 整个 `01-企业定位` 目录不存在 | 跳过企业定位注入，Agent 用通用能力工作 | 无感知，Agent 可能问更多问题来了解企业 |
| 某个模块文件缺失 | 跳过该模块，其他模块正常注入 | 无感知，Agent 在该方面可能输出较泛 |
| 文件为空或内容极少 | 跳过该模块 | 无感知 |
| 文件格式异常（非 UTF-8 等） | 捕获异常，跳过该模块，记录日志 | 无感知 |
| StorageService 未配置 knowledge 路径 | 使用默认路径，不存在则跳过 | 无感知 |

#### 降级策略示例

```typescript
async function buildCompanyContextPrompt(): Promise<string> {
  const files = await discoverCompanyContextFiles();

  if (files.length === 0) {
    return ''; // 没有任何定位文件，不注入
  }

  const sections: string[] = [];

  for (const file of files) {
    try {
      const content = await readFileWithCache(file.absolutePath);
      if (!content || content.trim().length < 10) continue;

      const moduleName = file.key.replace(/_/g, ' ');
      sections.push(`--- ${moduleName} ---\n${content.trim()}`);
    } catch (err) {
      // 单个文件读取失败不影响整体
      console.warn(`[CompanyContext] 读取失败: ${file.filename}`, err);
    }
  }

  if (sections.length === 0) return '';

  return `\n【企业定位上下文】\n${sections.join('\n\n')}\n`;
}
```

### 18.6 动态加载与缓存机制

#### 缓存策略

| 层级 | 说明 | 有效期 |
|------|------|--------|
| 内存缓存 | 已读取的文件内容 + mtime | 进程生命周期内 |
| 无磁盘缓存 | 直接读源文件，不生成中间文件 | — |

#### 刷新触发

1. **惰性校验**：每次读取时检查文件 mtime，变化则重新读取
2. **手动刷新**：提供 `refresh()` 方法，可由管理后台触发
3. **进程重启**：Node 进程重启后缓存自然清空

#### 为什么不用 watcher

- V1 阶段文件变化不频繁（企业定位是相对稳定的）
- `fs.watch` 在 Windows 网络盘上可能不稳定
- 惰性校验已经足够：每次 Agent 对话最多读一次，mtime 检查开销极小

### 18.7 与 Agent Tool 的关系

企业定位内容不是一个 Tool，而是 **System Prompt 的一部分**。

原因：
- 企业定位是背景知识，Agent 每次生成都应该知道
- 不需要 LLM 主动"调用"来获取
- 注入到 system prompt 比作为 Tool 更高效（少一轮 tool call）

**例外**：如果未来企业定位内容非常多（超过 10 万字），单次注入 token 成本太高，可以改为 Tool（`search_company_knowledge`），按需检索。V1 阶段直接注入 system prompt 即可。

### 18.8 目录结构（Agent 侧新增文件）

```
src/lib/agent/
  └── context/
      ├── company-context-loader.ts   ← 企业定位文件发现 + 读取 + 缓存
      └── index.ts                    ← 统一导出
```

**只有 2 个文件，约 150 行代码。**

### 18.9 与 WorkBuddy 的协作边界

| 职责 | WorkBuddy（内容侧） | Agent（消费侧） |
|------|---------------------|----------------|
| 创建企业定位文件 | ✅ 负责 | ❌ 不碰 |
| 修改定位内容 | ✅ 负责 | ❌ 不碰 |
| 维护文件格式规范 | ✅ 负责 | — |
| 发现文件 | — | ✅ 负责 |
| 读取内容 | — | ✅ 负责 |
| 容错降级 | — | ✅ 负责 |
| 注入到 LLM 上下文 | — | ✅ 负责 |
| 缓存管理 | — | ✅ 负责 |

**协作约定**：
- WorkBuddy 按约定目录结构输出 Markdown 文件
- Agent 侧只读取，不写入
- 文件格式变化时，WorkBuddy 通知 Agent 团队调整（但因为是纯文本 Markdown，大多数变化不需要改代码）

### 18.10 实施优先级

**建议放在阶段 2（Agent 后端）的末尾实施**，因为：

- 代码量小（~150 行）
- 不依赖其他模块
- 没有企业定位文件也不影响 Agent 基本功能
- 但有了之后能显著提升生成内容的质量和企业贴合度
