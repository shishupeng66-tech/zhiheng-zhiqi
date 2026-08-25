# 知衡语音 · Phase 3-A 实施计划（声音复刻最小闭环）

> **目标**：跑通「浏览器 → Next API → Voice Service → 豆包 HTTP → demo_audio 落盘 → 浏览器试听」这条**全链路冒烟**。
> **范围**：上传样本 + 训练 + 保存 demo + 试听。**本期不实现**：voice_catalog 联动 / 业务可用 / 视频生产 / 删除 / 席位 / 复杂权限扩展。
> **风险等级**：低（新建文件，不动现有任何业务代码 + 现有 API 路径，502 即可回滚）。

---

## 一、实施前确认（已全部核对）

| 检查项 | 现状 | 影响 |
|---|---|---|
| `voice_clones` 表 | **不存在**（`grep -c "voice_clones\|voiceClone" src/lib/db/schema.ts` = 0） | 需新建 |
| 最近一份 migration | `0006_add_voice_catalog.sql` | 下一份是 `0007_add_voice_clones_min.sql` |
| Drizzle 默认 DB | `./data/zhiheng.db`（**不要走这个**）；实际跑的是 `./data/zhiheng_local.db` | `DATABASE_PATH=...` 强制覆盖 |
| 表结构（Drizzle 之外探测） | `users / workspaces / workspace_members / automation_video_assets / automation_video_tasks / user_workspaces / sessions / provider_profiles / provider_settings / voice_catalog` | FK 依赖：`users.id`、`workspaces.id` |
| TS 配置 | `tsconfig.json` strict / noEmit / target ES2017 | 新增代码沿用 strict |
| `requirements.txt` | `fastapi==0.116.1 / uvicorn==0.35.0 / pydantic==2.11.7 / websockets==15.0.1` | **需新增 `httpx==0.27.2`**（同步 HTTP 客户端） |
| Voice Service 进程 | **PID 12668 LISTENING on :5015**（import 已加载的老代码） | 改完后用 `taskkill /F /T /PID 12668` + `cd services/voice-service && .venv-doubao/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 5015` 重启 |
| 端口 3000 | **PID 16356 LISTENING**（Codex worktree 占用，**不可 kill**） | 我们的 `npm run dev` 会落到 3001，验收 `--noproxy '*' http://127.0.0.1:3001/...` |
| Env bridge | `data/.voice-service-env` 含 `DOUBAO_SPEECH_API_KEY / _RESOURCE_ID / _WS_ENDPOINT / _DEFAULT_VOICE`（先加载者胜） | 401/403 时优先看这里 |
| Next `.env.local` | `DATABASE_PATH / VOICE_SERVICE_URL / VOICE_SERVICE_OUTPUT_DIR` | Next 侧通过 `getVoiceServiceUrl()` 取 |
| 现有 `/api/workspaces/[slug]/voices/*` 路由 | `route.ts (list) / sync/route.ts / [voiceType]/route.ts / [voiceType]/preview/route.ts` | **新增 `voices/clone/` 子域，不动任何既有文件** |
| 现有 `/api/.../voices/[voiceType]/preview/route.ts` 写法 | GET 用 `requireWorkspacePermission(slug, 'scripts:manage')` 鉴权，`getVoiceServiceUrl()` 调 service，stream audio/mpeg | **沿用**为 `/voices/clone/[voiceId]/preview/route.ts` 的样板 |
| 现有 `src/lib/voice-service/client.ts` | 3 个 export：`getVoiceServiceUrl / generateVoiceAudio / fetchVoices` | 加 1 个 `trainVoiceClone()`，最小回归风险 |
| 样本目标路径 | `storage/voice-service/clone-samples/<userId>/<cloneId>.<ext>` 不存在 | 路由 `mkdir -p` 创 |
| TTS 试听缓存 | `storage/voice-service/outputs/previews/` 已有 7 个 mp3 哈希缓存 | clone demo 用**另一个子目录** `outputs/clone-demos/`，不冲突 |
| git 状态 | main ahead 1（3298d2b），working tree 仅无关的 `overview-page.tsx` + untracked docs / scripts | 干净起步 |

> 完整核对过程参见对话历史"实施前检查"段。所有现状已确认，**无隐藏改动项**。

---

## 二、本期改动文件清单（按改动顺序）

### Step 0：装依赖
```bash
# Voice Service 装 httpx（同步 HTTP 客户端；不引 requests、不引 aiohttp）
"/d/知衡智企/services/voice-service/.venv-doubao/Scripts/python.exe" -m pip install httpx==0.27.2
```

### Step 1：新增表 `voice_clones`（最小列）
- **文件**：`src/lib/db/schema.ts`（在 `voice_catalog` 之后追加约 40 行）
- 字段：**只要 9 列**（状态机 6 态保留是为了语义，但本期**只产出 ready / failed**）：
  ```ts
  voiceCloneStatuses = ['draft', 'training', 'ready', 'failed', 'archived'] as const;
  voiceClones = sqliteTable('voice_clones', {
    id: text('id').primaryKey(),                                    // UUID
    ownerId: text('owner_id').notNull().references(() => users.id),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
    customSpeakerId: text('custom_speaker_id').notNull().unique(),  // ⭐ 本期唯一身份码
    displayName: text('display_name').notNull(),
    language: text('language').notNull().default('zh-cn'),          // 本期只用 'zh-cn'
    format: text('format').notNull(),                               // wav/mp3/ogg/m4a
    samplePath: text('sample_path').notNull(),
    sampleSizeBytes: integer('sample_size_bytes').notNull(),
    sampleDurationMs: integer('sample_duration_ms'),
    status: text('status', { enum: voiceCloneStatuses }).notNull().default('draft'),
    errorMessage: text('error_message'),
    demoAudioPath: text('demo_audio_path'),                         // service 端落盘
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  }, (t) => ({
    voiceClonesOwnerIdx: index('voice_clones_owner_idx').on(t.ownerId, t.status),
    voiceClonesCustomSpeakerIdx: uniqueIndex('voice_clones_custom_speaker_uniq').on(t.customSpeakerId)
  }));
  export type VoiceCloneRow = typeof voiceClones.$inferSelect;
  export type NewVoiceCloneRow = typeof voiceClones.$inferInsert;
  ```
- **本期不做的列**：`is_default / enabled_for_production / voiceCatalogVoiceType / consentSigned 三件套 / task_id / last_polled_at`（Phase 3-B/C 再加）。

### Step 2：生成 migration 并应用
```bash
cd /d/知衡智企
DATABASE_PATH=./data/zhiheng_local.db bun run db:generate
# 生成 drizzle/0007_xxx.sql；README 预演一遍：仅 CREATE TABLE voice_clones + 2 索引
DATABASE_PATH=./data/zhiheng_local.db bun run db:migrate
```
- 校验：`/c/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2/node.exe -e "const d=require('/d/知衡智企/node_modules/better-sqlite3'); const db=new d('/d/知衡智企/data/zhiheng_local.db'); console.log(db.prepare(\"SELECT sql FROM sqlite_master WHERE name='voice_clones'\").get())"` 应能查到新表 SQL。

### Step 3：`services/voice-service/app/providers/clone.py`（新建）
- 主要 export：
  - `CloneStatus`（IntEnum）
  - `DoubaoCloneProvider`（含 `_validate_speaker_id` 守卫）
  - `generate_custom_speaker_id(user_id, display_name) -> str`
- 关键行为：
  - 调 `POST https://openspeech.bytedance.com/api/v3/tts/voice_clone`
  - header：仅 `Content-Type + X-Api-Key + X-Api-Request-Id`（**不带** `X-Api-Resource-Id`）
  - body：`speaker_id` 字段写死 `"custom_speaker_id"`，`custom_speaker_id` 字段写生成器产物
  - audio.data 做 base64
  - 收到 `status=2/4` 时立即 base64 解码 demo_audio 落盘到 `VOICE_SERVICE_OUTPUT_DIR/clone-demos/<sid>-<ts>.mp3`
  - 收到 `status=1`：在应用层 sleep 2s 后再次 POST 同接口，**最多重试 3 次**；仍 1 视为失败
  - 收到 `status=3`：原样抛 `RuntimeError`，把 `message` 透传给上游

### Step 4：`services/voice-service/app/main.py`（追加 1 路由 + 2 占位）
- **新增**：
  ```python
  class CloneTrainRequest(BaseModel):
      sample_path: str = Field(min_length=1)
      sample_format: str = Field(pattern=r"^(wav|mp3|ogg|m4a|aac|pcm)$")
      custom_speaker_id: str = Field(min_length=8, max_length=256)
      text: str = Field(min_length=1, max_length=2000)
      language: int = Field(ge=0, le=21)
      demo_text: str = Field(default="你好，这是我的音色试听。", min_length=4, max_length=300)

  class CloneTrainResponse(BaseModel):
      speaker_id: str
      status_label: str          # 'training' | 'success' | 'failed'
      status: int                # 0..4
      model_type: int
      demo_audio_path: str | None

  CLONE_DEMO_DIR = Path(os.getenv("VOICE_SERVICE_OUTPUT_DIR", "storage/voice-service/outputs")) / "clone-demos"

  @app.post("/v1/voice/clone/train", response_model=CloneTrainResponse)
  def voice_clone_train(req: CloneTrainRequest): ...
  ```
- **占位（401-text）**：`GET /v1/voice/clone/{sid}` 和 `DELETE /v1/voice/clone/{sid}` 都返回 `501 + 本期提示`（Phase 3-B 再实现真查/真删）。
- 不改：现有 `TtsRequest / TtsResponse / @app.get("/health") / @app.post("/v1/tts") / @app.get("/v1/voices") / @app.get("/v1/voices/all") / @app.get("/v1/tts/preview")` 全部保持。

### Step 5：重启 Voice Service
```bash
taskkill /F /T /PID 12668
cd /d/知衡智企/services/voice-service
.venv-doubao/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 5015
# 验证：
# curl -s http://127.0.0.1:5015/health → {"ok":true,"provider":"doubao"}
# curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5015/v1/voice/clone/train \
#   -H "Content-Type: application/json" \
#   -d '{"sample_path":"x","sample_format":"wav","custom_speaker_id":"zhclone_a_b_c","text":"x","language":0}' \
#   → 422 (pydantic OK) 证明路由被注册
```

### Step 6：客户端 `src/lib/voice-service/client.ts` 新增 1 个 export
```ts
export async function trainVoiceClone(opts: {
  samplePath: string;
  sampleFormat: 'wav' | 'mp3' | 'ogg' | 'm4a' | 'aac' | 'pcm';
  customSpeakerId: string;
  text: string;
  language: number;
  demoText?: string;
}): Promise<{ speakerId: string; status: number; statusLabel: string; modelType: number; demoAudioPath: string | null }> { ... }
```
**不**加 `getVoiceCloneStatus` / `deleteVoiceClone`（本期不实现）。

### Step 7：Next API 路由（**只新增**，不动既有）
- 新建 `src/app/api/workspaces/[workspaceSlug]/voices/clone/route.ts`：
  - 验证 `scripts:manage`（与 `/voices` 列表保持一致；Phase 3-B 再替换为 `voices:manage`）
  - 接收 `multipart/form-data`：`audio` (File) + `text` + `demo_text?`
  - 大小校验：≤ 10MB（PDF 原文，未沿用 Phase 1 的 8MB）
  - 落盘到 `<repo>/storage/voice-service/clone-samples/<userId>/<uuid>.<ext>`（**process.cwd() 推 repo root**）
  - 生成 `custom_speaker_id`（新工具：`src/lib/voice-clone/speaker-id.ts`，**服务端权限调用** `hashlib` 等价的 `node:crypto` 实现相同算法）
  - 插 voice_clones `status='training'`
  - 调 `trainVoiceClone(...)`
  - 按响应写回 `voice_clones.status` 到 `ready / failed`，并把 `demoAudioPath / errorMessage` 写进去
  - 返回 `201 { id, status, customSpeakerId, demoAudioPath }`
- 新建 `src/app/api/workspaces/[workspaceSlug]/voices/clone/[voiceId]/preview/route.ts`（GET）：
  - 鉴权 `scripts:manage`
  - 拿到 `voice_clones` 行，**直接 stream** `demoAudioPath`（不调 service、不转正、不扣席位）
  - 找不到 `demo_audio_path` → 404

### Step 8：页面（**本期最小可交互**）
- 新建 `src/app/dashboard/voices/clone/page.tsx`（server）：
  - 只渲染一个表单 + 训练结果展示 + 一个 `<audio>` 标签试听 demo
  - 不接 nav 子项（不进菜单，**直接 URL 访问**验证，避免动 nav 暂改）
  - 用原 Tailwind form（无新 UI 组件）
  - 这是 **冒烟用**，不是终态页面

### Step 9：端到端冒烟脚本（一次性，在 `_screenshot_tool/` 内）
- 用 Puppeteer + 项目 `voice_service_url` 自动：
  1. 登录 `shishupeng/...`（已有 super_admin）
  2. 进 `/dashboard/voices/clone`
  3. 上传一段 ≤ 30s wav（用 `getUserMedia` + `MediaRecorder` 录一段测试音频写到 `tmp/`）
  4. 提交训练
  5. 等待 `status=ready`
  6. 抓 `<audio>` 元素的 `src` 验 HTTP 200 + `audio/mpeg`
- 输出 `_screenshot_tool/phase3a-smoke.png` + stdout 报告

### Step 10：Typecheck + Build
```bash
cd /d/知衡智企
npm run typecheck
npm run build
```

---

## 三、API 接口签名（本期 3 个入口，零 5 接口）

```
# 1. Voice Service
POST  /v1/voice/clone/train        # 本期唯一实做的 service 端点
GET   /v1/voice/clone/{sid}        # 501 占位
DELETE /v1/voice/clone/{sid}       # 501 占位

# 2. Next API
POST   /api/workspaces/[workspaceSlug]/voices/clone                              # 上传样本 + 训练
GET    /api/workspaces/[workspaceSlug]/voices/clone/[voiceId]/preview            # 试听 demo（stream 文件）
```

> **不做**：列表 / PATCH / DELETE / default / enable / bind / 任何 voice_catalog 联动。

---

## 四、风险与本期不做项（强约束）

| 项 | 状态 | 说明 |
|---|---|---|
| voice_catalog 联动 | ❌ 本期不做 | 跳过 `voice_catalog.enabled_for_production`；仅 `voice_clones` 表 |
| 业务可用 / 默认声音 | ❌ 本期不做 | UI 无开关 |
| 视频生产选中克隆音色 | ❌ 本期不做 | 等 Phase 3-B |
| DELETE / GET 音状态（service） | ❌ 占位 501 | PDF 没给，等 Phase 3-B |
| 席位系统 / quota 表 | ❌ 本期不做 | UI 无 `SlotQuotaCallout` |
| 复杂权限扩展 | ❌ 本期不做 | 一律复用 `scripts:manage` |
| 命名 UI 提示用户 | ❌ 自动生成 | `zhclone_<hash6>_<slug16>_<rand6>` 用户不可见 |
| compliance `consent_signed` 字段 | ❌ 本期不做 | Phase 3-C 加（PDF §0.7） |
| 多语种 | ❌ 仅 zh-cn | 字段保留，但本期 API hard-code |
| Nav 子项 | ❌ 不改 nav-config | URL `/dashboard/voices/clone` 手访即可 |

---

## 五、回滚预案

- DB：删表 `DROP TABLE voice_clones;`（一行 SQL，无 FK 引用风险）
- Voice Service：删 `providers/clone.py` + 从 `main.py` 移除 3 行 import / 路由
- Next：删 `voices/clone/` 路由 + `voice-service/client.ts` 一个 export
- 全部回滚 ≈ 5 分钟

---

## 六、提交策略

- 一个 commit：`feat(voice-clone): minimal closed-loop for cloning (Phase 3-A)`
- **不 push**（按用户偏好，CLI 在沙箱里无法推；用户用 GitHub Desktop 推送）
- **不**包含 docs/（设计文档在另一个 commit，不混入业务）

---

## 七、验收清单（冒烟完成视为通过）

- [ ] `voice_clones` 表在 `zhiheng_local.db` 中存在，含 11 列
- [ ] `POST /v1/voice/clone/train` 被 service 注册，`curl -X POST` 不再 404
- [ ] 浏览器 → `/dashboard/voices/clone` 上传一段 5~30s wav → 看到 status=ready
- [ ] demo 音频落盘：`ls storage/voice-service/outputs/clone-demos/*.mp3` 至少 1 个文件
- [ ] `<audio src="/api/.../voices/clone/{id}/preview">` HTTP 200 + `audio/mpeg`
- [ ] 试听能播放出与样本相匹配的中文
- [ ] 错误路径：上 35s 音频（>30s）或 12MB（>10MB）→ 友好 400
- [ ] 命名错误：手工 POST 一个 `zh_test`（短）→ 400 with 正则错误信息
- [ ] `npm run typecheck` 0 错
- [ ] `npm run build` 0 错
- [ ] git status 不包含 `overview-page.tsx` 等无关修改

通过验收 → 即可启动 Phase 3-B（列表 / 默认 / 业务可用 / voice_catalog 联动 + 真 TTS 转正路径）。

---

文档版本 v1.0（实施计划，待用户确认）。
