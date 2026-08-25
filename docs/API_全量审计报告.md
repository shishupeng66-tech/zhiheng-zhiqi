# 知衡智企 · API 全量审计报告

> **审计时间**：2026-08-23（基于 `D:\知衡智企` 工作副本，commit `79856c7` 之后）
> **审计范围**：整个项目（Next.js 前端 + 自有 Route Handlers、内部 Python 服务、MoneyPrinterTurbo 引擎、外部模型 Provider、前端「API 入口」按钮）
> **审计方式**：静态代码扫描（`find` 枚举路由、`grep` 扫描调用链与 Provider 端点、逐文件阅读关键 `route.ts` / `service.ts` / 引擎封装）+ 配置核查（`.env.local`）
> **本轮约束**：**仅审计，不修改代码、不删除、不新增、不重构 UI、不提交、不 push**

---

## 一、执行摘要（TL;DR）

1. **自身 API（Next.js Route Handlers）共 16 个 `route.ts` 文件、26 个「方法-端点」对**，全部为真实、可运行、DB 持久化的接口；其中 **25 个被前端实际调用**，1 个（`GET /api/workspaces/[slug]`）由服务端组件/RSC 消费。
2. **AI 聊天 = 100% Mock（两套都是）**：
   - `src/features/ai-chat/`：`createChat().transport()` 脚本化演示，**无模型、无网络、无 API Key**；
   - `src/features/chat/`：客服消息演示，硬编码 `initialConversations` + 循环 `autoReplies`，**纯本地 zustand，无任何请求**。
   - **结论：当前任何「AI 聊天」入口都不能真正回答问题。**
3. **产品（Products）与客户（Customers/Users）模块 = 内存 Mock 数据**，`service.ts` 直接读 `@/constants/mock-api*`，**没有对应 Next.js 路由、没有真实 DB 表**；`https://your-api.com/...` 仅是注释里的示例。这两个模块当前**不算 API**。
4. **MoneyPrinterTurbo（MPT）API 未接入**：集成方式是**命令行子进程**（`spawn python cli.py`），不是 HTTP API；MPT 自带的 FastAPI（`/api/v1`，约 16 个端点）**存在但完全未被调用**，也没有起服务。
5. **唯一真实外部业务 Provider = 豆包语音（字节火山引擎 TTS）**，由独立 Python 服务 `services/voice-service` 调用（`openspeech.bytedance.com`，含 1 个 HTTP + 1 个 WebSocket 端点）。**项目内没有任何 OpenAI / 通义 / 文心等 LLM 调用。**
6. **前端「API 入口」占位按钮**：自动化剪辑空间的「模型与素材 API」「运行日志」两个按钮均为 `toast.info(...)` 空响应，无跳转、无接口。
7. **授权模型是自建会话（HttpOnly Cookie + `getCurrentUser()`），不是 Clerk `getAuth`**——尽管 `.env.local` 配了 Clerk Key，但实现的路由全部走自建会话；Clerk 当前为「已配置未使用」。

---

## 二、API 总览统计（按来源分类计数）

| 来源类别 | 数量（端点/方法对） | 文件/位置 | 是否接入生产 | 备注 |
|---|---|---|---|---|
| **自身 API（Next.js Route Handlers）** | **26**（16 个 `route.ts`） | `src/app/api/**` | ✅ 是（真实、DB 持久化） | 认证=自建会话；工作空间走细粒度 RBAC |
| **内部服务 API（Voice Service，FastAPI）** | **3** | `services/voice-service/app/main.py` | ✅ 是（被 `src/lib/voice-service/client.ts` 调用） | `VOICE_SERVICE_URL=http://127.0.0.1:5015` |
| **MPT 原生 API（FastAPI，未集成）** | **16**（约 15 已挂载） | `engines/moneyprinterturbo/app/**` | ❌ 否（无调用、无起服务） | 前缀 `/api/v1`；集成走 CLI 而非 HTTP |
| **外部 Provider API（豆包语音 / 火山引擎 TTS）** | **1 Provider / 2 传输端点** | `.env.local` → `services/voice-service` | ✅ 是（经 Voice Service 调用） | HTTP 单向 + WS 双向（`openspeech.bytedance.com`） |
| **内部 WebSocket 服务** | **0** | — | — | 前端/Next.js 自身无 WS 服务 |
| **Mock / 占位（非 API）** | **5 处特征** | 见第八、九节 | ⚠️ 演示态 | Products、Customers、ai-chat、chat、2 个 toast 按钮 |
| **Clerk / Sentry（基础设施）** | 2（外部 SaaS） | `.env.local` | ⚠️ 已配置未使用（Clerk）/ 已用（Sentry 观测） | 非业务 API |

**合计可调用 API（生产实际在用）**：自身 26 + 内部 3 + 豆包 1 = **30 个调用点**；另外 MPT 原生 16 个**已定义但闲置**。

---

## 三、自身 API 完整清单（26 个「方法-端点」对）

### 3.1 认证与授权模型（关键结论）

- **认证**：所有路由使用 `getCurrentUser()`（`src/lib/auth/index.ts`），读取 `SESSION_COOKIE`（HttpOnly + SameSite=Lax，生产 `secure`）→ `getUserBySessionToken` → DB 用户。登录 `POST /api/auth/login` 写 Cookie，登出清 Cookie。**未使用 Clerk 的 `getAuth()`/`auth()`。**
- **企业级 RBAC（员工/系统）**：以 `actor.role` 判断，`super_admin` 独占员工管理类接口（`employees/route.ts`、`employees/[id]/*`）。
- **工作空间级 RBAC（12 个细粒度 scope）**：`requireWorkspacePermission(slug, <scope>)` + `hasWorkspacePermission`。Scopes：`workspace:view / workspace:manage / members:manage / assets:view / assets:manage / topics:manage / scripts:manage / video:generate / projects:manage / review:approve / publish:manage / analytics:view`。角色映射：owner/admin=full，editor、member、viewer 递减（见 `src/lib/workspaces/permissions.ts`）。

### 3.2 模块分组表

#### A. 认证（2）
| 方法 | 路径 | 用途 | 鉴权 | 被前端调用 |
|---|---|---|---|---|
| POST | `/api/auth/login` | 账号密码登录，写会话 Cookie | 公开（凭证） | ✅ sign-in-view |
| POST | `/api/auth/logout` | 销毁会话、清 Cookie | 登录态 | ✅ app-sidebar / user-nav |

#### B. 个人资料（4）
| 方法 | 路径 | 用途 | 鉴权 | 被前端调用 |
|---|---|---|---|---|
| GET | `/api/profile` | 取当前用户自身信息 | 登录态 | ✅ profile-view-page |
| PATCH | `/api/profile` | 自助改 姓名/手机/头像（角色等忽略） | 登录态 | ✅ profile-view-page |
| POST | `/api/profile/avatar` | 上传头像到 `public/uploads/avatars` | 登录态 | ✅ profile-view-page |
| POST | `/api/profile/change-password` | 改密码（校验旧密码、清其他会话） | 登录态 | ✅ profile-view-page |

#### C. 系统 / 员工管理（9，全部限 `super_admin`）
| 方法 | 路径 | 用途 | 鉴权 | 被前端调用 |
|---|---|---|---|---|
| GET | `/api/system/employees` | 列表/搜索（q/role/status） | super_admin | ✅ employees-client |
| POST | `/api/system/employees` | 新建员工 | super_admin | ✅ employee-form-dialog |
| GET | `/api/system/employees/[id]` | 取单个员工 | super_admin | ✅ employee-form-dialog |
| PATCH | `/api/system/employees/[id]` | 改员工资料 | super_admin | ✅ employee-form-dialog |
| DELETE | `/api/system/employees/[id]` | 停用/删除员工 | super_admin | ✅ employees-client |
| POST | `/api/system/employees/[id]/reset-password` | 重置密码、失效旧会话 | super_admin | ✅ reset-password-dialog |
| POST | `/api/system/employees/[id]/role` | 调角色（super_admin/manager/employee） | super_admin | ✅ employee-form-dialog |
| POST | `/api/system/employees/[id]/status` | 启/停用 | super_admin | ✅ employees-client |
| POST | `/api/system/employees/avatar` | 上传员工头像 | super_admin | ✅ employee-form-dialog |

> 数据层：`@/services/users`（Drizzle + SQLite `data/zhiheng_local.db`）— **真实持久化**。

#### D. 工作空间（11）
| 方法 | 路径 | 用途 | 鉴权(scope) | 被前端调用 |
|---|---|---|---|---|
| GET | `/api/workspaces/[workspaceSlug]` | 取工作空间 + 按权限过滤的模块清单 | workspace:view | ◐ RSC/服务端消费 |
| GET | `/api/workspaces/[workspaceSlug]/members` | 成员列表 | members:manage | ✅ workspace-members-client |
| POST | `/api/workspaces/[workspaceSlug]/members` | 添加成员 | members:manage | ✅ workspace-members-client |
| PATCH | `/api/workspaces/[workspaceSlug]/members` | 改成员角色 | members:manage | ✅ workspace-members-client |
| DELETE | `/api/workspaces/[workspaceSlug]/members` | 移除成员 | members:manage | ✅ workspace-members-client |
| POST | `/api/workspaces/[workspaceSlug]/automation/assets` | 上传素材（视频/配音/音乐） | assets:manage | ✅ overview-page |
| GET | `/api/workspaces/[workspaceSlug]/automation/tasks` | 任务列表 | workspace:view | ✅ overview-page / review-page |
| POST | `/api/workspaces/[workspaceSlug]/automation/tasks` | 创建任务（**spawn MPT `cli.py`**） | video:generate | ✅ overview-page |
| PATCH | `/api/workspaces/[workspaceSlug]/automation/tasks` | 更新/审核任务 | review:approve | ✅ review-page |
| DELETE | `/api/workspaces/[workspaceSlug]/automation/tasks` | 删除任务 | review:approve | ✅ review-page |
| GET | `/api/workspaces/[workspaceSlug]/automation/tasks/[taskId]/outputs/[index]` | 读取并返回视频文件流（带路径穿越防护） | workspace:view | ◐ 播放器 `<video src>` |

> 数据层：`@/lib/workspaces/*`（Drizzle）。任务产出落在 `engines/moneyprinterturbo/storage/tasks/`，由上述 outputs 路由按 `workspace:view` 安全回读。

### 3.3 调用覆盖率
- **被前端 `fetch()` 实际调用**：25 / 26（缺 `GET /api/workspaces/[slug]`，由 RSC 消费，仍属在用）。
- **Mock/占位端点**：**0**——所有 26 个端点均为真实实现，无假数据端点。Mock 在「数据访问层 / 前端特征」侧（见第八、九节），不在路由层。

---

## 四、内部服务 API — Voice Service（FastAPI，3 端点）

文件：`services/voice-service/app/main.py`（标题 "Zhiheng Voice Service" v0.2.0，依赖 `doubao-speech-sdk`）。

| 方法 | 路径 | 入参 / 出参 | 用途 | 调用方 |
|---|---|---|---|---|
| GET | `/health` | `{ok, provider:"doubao"}` | 健康检查 | 运维/探活 |
| GET | `/v1/voices` | 10 个预置音色列表 | 前端选音色 | `src/lib/voice-service/client.ts` |
| POST | `/v1/tts` | `TtsRequest{text,voice_id,speed,volume,emotion,style}` → `TtsResponse{audio_path,duration,...}` | 文本转语音（豆包） | `src/lib/voice-service/client.ts` |

- 启动加载 `.env.local` / `.env` 到 `os.environ`；**无鉴权中间件**（内网 127.0.0.1，依赖网络隔离）。
- 真正的外部调用在 `get_provider().synthesize()`（豆包 Speech SDK）→ `openspeech.bytedance.com`。

---

## 五、MoneyPrinterTurbo 原生 API（FastAPI，未集成，16 端点）

> 详见 `moneyprinter_api_audit_report.md`。此处仅列计数与结论。

- 入口：`engines/moneyprinterturbo/main.py`（`uvicorn`，`listen_port=8080`，前缀 `/api/v1`），`app/router.py` 挂载。
- 定义端点（约 16，其中 `GET /ping` 已定义但**未挂入 router**）：
  - `video.py`：POST /videos、POST /subtitle、POST /audio、GET /tasks、GET /tasks/{id}、DELETE /tasks/{id}、GET /musics、POST /musics、GET /video_materials、POST /video_materials、GET /stream/{file_path}、GET /download/{file_path}（12）
  - `llm.py`：POST /scripts、POST /terms、POST /social-metadata（3）
  - `ping.py`：GET /ping（1，未挂载）
- **认证**：`verify_token` 已被注释 → 无鉴权。
- **接入状态**：❌ **未接入**。知衡智企通过 `src/lib/workspaces/moneyprinter-engine.ts` 以 `spawn('python','cli.py', ...)` 调 CLI，**全程不发起任何对 8080 的 HTTP 请求**。全仓（排除 `node_modules`/`engines` 自身）检索 `8080 / api/v1 / from app.` 零命中（仅 `.next` 构建痕迹）。

---

## 六、外部 Provider API（豆包语音 / 火山引擎 TTS）

| Provider | 端点 | 传输 | 调用位置 | 凭证（`.env.local`，仅变量名） |
|---|---|---|---|---|
| 字节火山引擎 · 豆包 Speech | `https://openspeech.bytedance.com/api/v3/tts/unidirectional` | HTTP | `services/voice-service`（Python SDK） | `DOUBAO_SPEECH_API_KEY` / `DOUBAO_SPEECH_RESOURCE_ID` / `DOUBAO_SPEECH_APP_ID` |
| 同上 | `wss://openspeech.bytedance.com/api/v3/tts/bidirection` | WebSocket | `services/voice-service` | `VOLCENGINE_ACCESS_KEY_ID` / `VOLCENGINE_SECRET_ACCESS_KEY` |

- **项目内 WS 服务器：0**；唯一的 WebSocket 是上面这个**外部 Provider** 的双向 TTS 端点（由 voice-service 消费，不经前端直连）。
- **无任何 LLM / 大模型文本接口**：全局检索 `openai / qwen / dashscope / 通义 / 文心 / ark` 等均无业务调用。AI 能力目前 = 0。

---

## 七、AI 聊天模块现状（本次重点）

用户原题：*「AI 聊天」到底是 完整 API / Mock / UI 占位 / 本地假数据？为什么能/不能真正回答问题？*

**结论：两套 chat 都是 Mock，都不能真正回答问题。**

| 模块 | 文件 | 实现 | 是否真模型 | 是否网络/API | 能否回答问题 |
|---|---|---|---|---|---|
| `ai-chat`（仪表盘 AI 聊天） | `src/features/ai-chat/chat.ts`、`components/ai-chat-demo.tsx`、`src/app/dashboard/ai-chat/page.tsx` | `@shadcn/helpers/ai-sdk` 的 `createChat().transport()` 脚本流；`demoChat.user(...).sleep(500).assistant(({writer})=>{writer.reasoning(...); writer.tool('getRevenue',{...}); writer.text(...)})` | ❌ | ❌ | ❌ 脚本写死 |
| `chat`（客服消息） | `src/features/chat/*`、`utils/data.ts`、`utils/store.ts` | zustand 本地状态，硬编码 `initialConversations`，发送后按 `autoReplies[cursor]` 循环回复 | ❌ | ❌ | ❌ 预设文案 |

- `ai-chat` 源码注释原文：*"A scripted AI conversation. It streams through the real useChat lifecycle via transport() — no model, API route, network request, or API key."*
- `chat` 的 `data.ts` 里「API 接入咨询」会话只是**演示文案**，不是真实接口；`store.ts` 的 `sendMessage` 仅写入本地 state，无 `fetch`/服务端。
- **回答用户**：当前「AI 聊天」**不能**真正回答问题——它只能播放预设脚本或循环预设客服话术。要真正问答，必须接入 LLM（见第十一节 B 计划）。

---

## 八、前端「API 入口」按钮现状

全局检索 `toast.*` 与「模型/素材/接口/服务配置/API」类按钮：

| 位置 | 按钮 / 入口 | 行为 | 状态 |
|---|---|---|---|
| `features/workspaces/automation-editing/overview-page.tsx:465` | 「模型与素材 API」 | `toast.info('模型、素材 API 和缓存管理已保留为引擎配置入口，下一步接入系统设置页。')` | ❌ 空响应（无接口/无跳转） |
| `overview-page.tsx:473` | 「运行日志」 | `toast.info('运行日志写入 engines/moneyprinterturbo/storage/zhiheng-logs。')` | ❌ 空响应 |
| `overview-page.tsx:457` | 「任务管理」 | `window.location.href = /dashboard/workspaces/${slug}/review` | ✅ 真实跳转 |
| 其余 `toast.*` | 表单/列表操作反馈 | 成功/失败提示 | ✅ 正常（非 API 入口） |

- 即：自动化剪辑空间顶部两个「API 类」入口**点了没反应**，与前期 MPT 审计结论一致。
- 全仓**没有**其它 `模型与素材/接口配置/服务配置` 类占位按钮；Products/Customers 的「API」仅存在于 `service.ts` 注释示例（`your-api.com`，非真实入口）。

---

## 九、Mock / 占位特征汇总（非 API，但影响「可用状态」判断）

| 特征 | 位置 | 状态 | 影响 |
|---|---|---|---|
| Products 数据 | `features/products/api/service.ts` → `@/constants/mock-api` | 内存 Mock | 无路由、无 DB；列表/增删改均为假数据 |
| Customers(Users) 数据 | `features/users/api/service.ts` → `@/constants/mock-api-users` | 内存 Mock | 同上 |
| AI 聊天（ai-chat） | `features/ai-chat/*` | 脚本 Mock | 不能问答 |
| 客服消息（chat） | `features/chat/*` | 本地 Mock | 不能问答 |
| 两个 toast 占位按钮 | `overview-page.tsx` | 空响应 | 点了没反应 |
| Clerk | `.env.local` + 代码 | 已配置未使用 | 认证实际走自建会话 |

---

## 十、实际调用链（数据流）

```
[浏览器]
  ├─ 登录/登出/个人资料/改密/头像   → /api/auth/* , /api/profile/*        （自建会话 Cookie）
  ├─ 员工管理                       → /api/system/employees/*             （super_admin）
  ├─ 工作空间/成员/素材/任务        → /api/workspaces/[slug]/*            （workspace RBAC）
  │     └─ POST .../automation/tasks → moneyprinter-engine.ts
  │            └─ spawn('python','cli.py', ...)  ──► engines/moneyprinterturbo （CLI，非 HTTP）
  │            └─ 产出视频 → storage/tasks/*.mp4 → GET .../tasks/[id]/outputs/[i] 回读
  ├─ 语音合成                       → src/lib/voice-service/client.ts
  │     └─ http://127.0.0.1:5015/v1/tts ──► services/voice-service (FastAPI)
  │            └─ doubao-speech-sdk ──► openspeech.bytedance.com (HTTP/WS，火山引擎)
  ├─ AI 聊天 / 客服消息             → 纯本地（无请求）
  └─ 产品 / 客户                    → 内存 Mock（无请求、无路由）
```

---

## 十一、问题清单（风险项）

| # | 风险 | 严重度 | 说明 |
|---|---|---|---|
| P1 | AI 聊天无真实模型 | 高 | 两套 chat 均为 Mock，用户预期「能问答」但实际不能，属体验/信任风险 |
| P2 | Products / Customers 是内存 Mock | 高 | 无路由、无 DB，演示数据刷新即丢；若对外演示「客户/产品」会被识破 |
| P3 | MPT 原生 API 未接入 | 中 | 已具备 FastAPI 能力但走 CLI；CLI 方式难做进度回调/并发/鉴权，且 8080 服务未起 |
| P4 | 两个「API 入口」按钮空响应 | 中 | 点击无反馈，疑似「功能缺失」 |
| P5 | 认证双轨（Clerk 配置了但未用） | 中 | `.env.local` 含 Clerk Key，路由却全用自建会话；易混淆、密钥暴露面增大 |
| P6 | Voice Service 无鉴权 | 中 | 仅依赖 127.0.0.1 网络隔离；若部署到非本机/容器跨网则有越权风险 |
| P7 | MPT FastAPI 无鉴权 | 低 | `verify_token` 被注释；当前未起服务故暂不暴露，但未来若起服务须补鉴权 |
| P8 | 外部 Provider 仅豆包语音 | 低 | 业务「AI」能力单薄（只有 TTS，无 LLM/视觉），与「智企」定位不匹配 |

---

## 十二、三层建议

### A 计划（必修 / 立即可做，低风险）
1. **给「模型与素材 API」「运行日志」按钮补真实行为**：至少跳转到系统设置页或弹出一个真实面板（哪怕是只读展示 `engines/moneyprinterturbo/storage/zhiheng-logs` 列表），消除「点了没反应」。
2. **明确 Mock 边界**：在 Products/Customers/AI 聊天页面加「演示数据」角标，避免对外演示被误判为正式功能。
3. **收敛认证**：要么把路由切到 Clerk（`getAuth`），要么删掉 `.env.local` 里未用的 Clerk Key，避免密钥闲置暴露。（选其一，不要长期双轨。）

### B 计划（产品化 / 需排期）
4. **接入真实 LLM 做 AI 聊天**（见第十三节 `src/lib/ai`）：选一家 Provider（豆包/通义/OpenAI 等），实现 `POST /api/ai/chat` 流式端点，替换 `ai-chat` 的脚本。
5. **Products / Customers 落库**：把 `service.ts` 的 `fakeXxx` 换成 Drizzle 表（项目已有 `services/users` 范式可复用），让这两个模块从「演示」变「可用」。
6. **MPT 由 CLI 升级为 HTTP（可选）**：若需进度回调/并发/统一鉴权，起 MPT FastAPI（8080）并在 `src/lib/integrations/mpt.ts` 封装客户端；否则保持 CLI 但补「任务状态轮询」。`verify_token` 必须恢复。
7. **Voice Service 加鉴权**：内部 token 或 mTLS，避免跨网络暴露。

### C 计划（暂不动 / 观察）
8. **不单独建设 API Gateway 服务**（见第十三节结论）——当前规模用「lib 层收敛」即可。
9. **WebSocket**：当前无内部 WS 需求；豆包双向 TTS 的 WS 由 voice-service 内部消化，前端不必直连。

---

## 十三、是否建设统一 API Gateway？（结论 + 落点）

**结论：当前不建议新建独立 Gateway 服务（如 Kong / 自研反向代理）。** 项目规模（26 自有路由 + 1 内部服务 + 1 外部 Provider + CLI 引擎）用「前端/服务端 lib 层收敛」更合适、成本更低。推荐在已有 `src/lib` 下补齐三层：

| 层 | 路径 | 职责 | 现状 |
|---|---|---|---|
| API 客户端 | `src/lib/api`（已有 `error-response.ts`，注释提及 `apiClient`） | 统一 `fetch` 封装、错误处理、401 刷新、baseURL | 部分（仅 error-response） |
| AI 集成 | `src/lib/ai`（**缺失**） | LLM 客户端、流式 chat 端点、Provider 抽象 | ❌ 缺失（这是 AI 聊天不能问答的根因之一） |
| 外部集成 | `src/lib/integrations` | voice-service client（已有 `voice-service/`）、mpt engine wrapper（已有 `workspaces/moneyprinter-engine.ts` 可上移）、未来 Provider 客户端 | ◐ 分散，待归并 |

**建议动作**：把 `voice-service/client.ts` 与 `moneyprinter-engine.ts` 归入 `src/lib/integrations`；新增 `src/lib/ai` 承载 LLM；`src/lib/api` 提供统一 `apiClient`。这样「未来接 MPT HTTP API / 新 LLM / 新 Provider」都只需在 `integrations`/`ai` 加适配器，不动业务路由——达到 Gateway 的「统一出入口」效果，却无需运行额外服务。

---

## 十四、API 架构图（Mermaid）

```mermaid
flowchart TB
  Browser[浏览器 / Next.js 前端]

  subgraph Self[自身 API · Next.js Route Handlers · 26 端点]
    Auth[/auth/login · logout/]
    Profile[/profile · avatar · change-password/]
    Emp[/system/employees · /employees/[id]/* · super_admin/]
    WS[/workspaces/[slug] · members · automation/tasks · assets/]
  end

  subgraph Internal[内部服务]
    Voice[Voice Service · FastAPI :5015\n/health · /v1/voices · /v1/tts]
  end

  subgraph Engine[MoneyPrinterTurbo 引擎]
    CLI[cli.py 子进程 · spawn]
    MPTAPI{{MPT FastAPI :8080 /api/v1\n16 端点 · 未接入}}
  end

  subgraph Provider[外部 Provider]
    Doubao[豆包语音 · 火山引擎\nopenspeech.bytedance.com\nHTTP + WS]
  end

  subgraph Mock[Mock / 占位 · 非 API]
    M1[Products · 内存 fakeProducts]
    M2[Customers · 内存 fakeUsers]
    M3[ai-chat · 脚本演示]
    M4[chat · 本地客服]
    M5[2 个 toast 占位按钮]
  end

  Browser --> Auth & Profile & Emp & WS
  WS -->|创建任务| CLI
  CLI -->|产出视频| WS
  Browser -->|语音合成| Voice
  Voice --> Doubao
  WS -.->|未使用| MPTAPI
  Browser --> M1 & M2 & M3 & M4 & M5

  classDef mock fill:#ffe0e0,stroke:#c00;
  classDef unused fill:#fff3cd,stroke:#b8860b;
  class M1,M2,M3,M4,M5 mock;
  class MPTAPI unused;
```

---

## 十五、附录：扫描方法 & 未覆盖项

- **路由枚举**：`find src/app/api -name route.ts`（Glob 对 `src/app/**` 不稳定，改用 `find`）。
- **调用链**：`grep -rnoE "fetch\('...'\)"` 映射前端 → 路由；`grep` Provider 主机名（排除 `node_modules`/`engines`/Python 包文档）。
- **已读关键文件**：`auth/index.ts`、`auth/login`、`profile/*`、`system/employees/*`、`workspaces/[slug]/route.ts`、`workspaces/.../tasks/[taskId]/outputs/[index]`、`workspaces/permissions.ts`、`workspaces/moneyprinter-engine.ts`、`voice-service/main.py`、`features/ai-chat/*`、`features/chat/*`、`features/products|users/api/service.ts`、`overview-page.tsx`。
- **未覆盖（非 API，已知不影响计数）**：Drizzle schema 细节、Server Component 内部直接 import 的服务函数（不计入 REST 端点）、`scripts/` 运维脚本、`engines/moneyprinterturbo` 内部实现（仅计「原生 API 端点数」）。
- **约束遵守**：本轮未修改任何文件、未提交、未 push。所有结论基于只读扫描。

---

*报告完。如需把任一「A 计划」项落地（如给两个按钮补真实跳转、或加 Mock 角标），可在下一轮授权后执行。*
