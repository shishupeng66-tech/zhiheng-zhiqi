# 知衡助手 Agent V1 - Phase 3B-1 草稿任务与高级编辑实施报告

> 日期：2026-08-27
> 分支：main
> 范围：Video Plan 保存为自动化剪辑草稿任务，并回填现有高级编辑工作台

## 1. 复用的 automation_video_tasks 字段

本轮继续复用现有 `automation_video_tasks` 表，没有创建第二套任务结构。

复用字段包括：

| 字段 | 用途 |
|---|---|
| `title` | 剪辑方案标题 |
| `prompt` | 视频主题 / 用户需求 |
| `script_language` | 脚本语言 |
| `keywords` | 视频关键词 |
| `script_text` | 完整脚本文案 |
| `material_source` | 素材来源 |
| `material_asset_ids` | 已上传素材 ID；Agent 语义索引素材暂不写入该字段 |
| `stitch_mode` | 拼接模式 |
| `transition_mode` | 转场模式 |
| `video_ratio` | 画幅比例 |
| `clip_duration` | 默认片段时长 |
| `match_by_script` | 是否按脚本匹配画面 |
| `voice_mode` / `voice_service` / `voice_name` / `voice_volume` / `voice_speed` | 配音参数 |
| `music_source` / `music_volume` | BGM 参数 |
| `subtitle_*` | 字幕参数 |
| `packaging_options` | 扩展配置与 Agent 方案快照 |
| `status` | 草稿任务使用 `draft` |
| `engine_task_id` / `engine_log_path` / `output_videos` | 草稿阶段保持空，不触发渲染 |

## 2. 是否新增字段 / migration

没有新增数据库字段，没有新增 migration。

原因：`packaging_options` 已经是 JSON 数组，当前 MoneyPrinterTurbo 参数读取逻辑只读取已知前缀，未知扩展项会被忽略。因此本轮使用两个扩展项保存方案：

- `agentPlan:{...}`：原始知衡助手 Video Plan 快照
- `currentTaskConfig:{...}`：当前高级编辑工作台配置快照

## 3. VideoPlan -> Task 映射

| Video Plan | automation_video_tasks |
|---|---|
| `title` | `title` |
| `topic` | `prompt` |
| `script` | `script_text` |
| `videoRatio` | `video_ratio` |
| `skill.id/name` | `packaging_options: agentSkill / agentSkillName / agentPlan` |
| `timeline` | `packaging_options: agentPlan.timeline` + `currentTaskConfig.materialTimeline` |
| `coverage` | `packaging_options: agentPlan.coverage` + `result_summary` |
| `warnings` | `packaging_options: agentPlan.warnings` |
| `voice` | 默认映射为企业语音自动配音 |
| `subtitle` | `subtitle_enabled` / `subtitle_style` |
| `bgm` | `music_source` / `music_volume` |

## 4. timeline 如何保存

完整 timeline 保存在 `agentPlan.timeline`。

高级编辑页读取任务详情接口后，将 `currentConfig.materialTimeline` 展示为“剪辑方案素材”，包含：

- 片段顺序
- 时间线起止
- 对应脚本文案
- 推荐素材文件名
- 推荐素材相对路径
- 匹配等级
- 匹配分数

## 5. sourceStart / sourceEnd 如何保存

每个 timeline item 的素材秒段保存为：

```json
{
  "sourceStart": 0,
  "sourceEnd": 4.4,
  "timelineStart": 0,
  "timelineEnd": 6
}
```

当前高级编辑页只做可视化回填，不把秒段传给 MoneyPrinterTurbo 执行。Phase 3B-2 需要把这些秒段接入真实执行层。

## 6. originalAgentPlan 如何保存

原始方案保存在 `packaging_options` 的 `agentPlan:` 扩展项。

用户在高级编辑页保存修改时，只更新 `currentTaskConfig:` 和任务主字段，不覆盖 `agentPlan:`，因此原始 Agent 方案不会丢失。

## 7. pendingPlan 管理

`create_video_plan` 工具完成后，前端助手面板从 SSE `tool_completed.toolResult` 捕获当前方案，保存到组件级 `pendingVideoPlan`。

刷新页面后 pending plan 会丢失，符合本阶段“轻量会话级状态”的要求。保存为草稿后数据进入 SQLite，变为持久化任务。

## 8. confirmation_required 如何工作

当前 Orchestrator 已有 `riskLevel=high` 与 `confirmation_required` 事件协议，但前端尚未实现“确认后恢复执行同一 tool call”的完整能力。

本轮采用更明确的产品交互：

1. `create_video_plan` 只生成低风险方案
2. 前端显示“保存为草稿并打开高级编辑”
3. 用户点击后弹出确认
4. 确认后调用受权限保护的服务端 API 写入草稿

这满足“LLM 不自动写库，用户显式确认后写库”的安全原则。

## 9. Agent Tool / API 实现

本轮新增高风险 Agent Tool：

```text
save_video_plan_as_draft
```

属性：

- `riskLevel=high`
- `requiredPermission=video:generate`
- 只写入 `draft`
- 不渲染视频
- 不调用 MoneyPrinterTurbo
- 不调用 Voice Service

当前前端尚未实现“confirmation_required 后恢复执行同一 tool call”的完整机制，因此产品可用路径是助手方案卡片里的显式确认按钮。

同时新增草稿写入 API：

```text
POST /api/workspaces/[workspaceSlug]/automation/tasks/from-plan
```

权限：

```text
video:generate
```

服务函数：

```ts
createDraftTaskFromVideoPlan(workspaceId, createdBy, plan)
```

注意：实际写库入口由用户点击按钮触发，而不是让 LLM 自动执行高风险写入。

## 10. 高级编辑回填

现有自动化剪辑首页支持：

```text
/dashboard/workspaces/enterprise-media?taskId={taskId}
```

打开后读取：

```text
GET /api/workspaces/[workspaceSlug]/automation/tasks/[taskId]
```

并回填：

- 视频主题
- 完整脚本
- 视频比例
- 配音方式
- 音色
- 音量
- 语速
- 字幕开关
- 字体
- 位置
- 字幕样式
- BGM
- Agent Skill
- 素材覆盖率
- warnings
- 推荐素材秒段

## 11. 编辑后保存

草稿任务打开后，顶部显示“保存草稿”。

保存调用：

```text
PATCH /api/workspaces/[workspaceSlug]/automation/tasks/[taskId]
```

限制：

- 仅 `draft` 状态可保存
- 不启动 worker
- 不修改 `engine_task_id`
- 不覆盖原始 `agentPlan`

## 12. 三个真实测试结果

执行命令：

```bash
npx tsx scripts/test-video-plan-draft.ts
```

结果：

| 场景 | taskId | 状态 | 覆盖率 | 警告 | timeline | engineTaskId |
|---|---|---|---:|---:|---:|---|
| 无菌灌装知识科普 | `21d94660-c89d-42b6-a852-92aa7d004871` | draft | 60% | 1 | 5 | null |
| 老板IP观点 | `45c415a9-c952-4d30-a329-fdcccc36af3b` | draft | 20% | 1 | 5 | null |
| 素材不足主题 | `8f7a3b44-30cf-454b-913a-4eecbd1751c6` | draft | 0% | 6 | 5 | null |

测试同时验证了编辑保存，脚本文案追加“高级编辑保存测试”后成功写回草稿。

## 13. 如何确认没有触发渲染

本轮草稿链路没有调用：

- `startMoneyPrinterTaskWorker`
- `runMoneyPrinterTask`
- Voice Service
- TTS
- MP4 输出

测试断言：

- `status=draft`
- `engineTaskId=null`

现有生成视频按钮仍会走原 POST 渲染链路，但草稿保存 API 不会触发。

## 14. typecheck / build

已执行：

```bash
npm run typecheck
npm run build
```

结果：

- `typecheck`：通过
- `build`：通过

构建仍有项目既有 Turbopack 警告：

- Google Sans Flex fallback font override missing
- `next.config.ts` 被 `automation/assets/route.ts` 的文件追踪提示牵连

## 15. 修改文件

本轮 Phase 3B-1 相关修改：

- `src/lib/workspaces/automation-editing.ts`
- `src/app/api/workspaces/[workspaceSlug]/automation/tasks/from-plan/route.ts`
- `src/app/api/workspaces/[workspaceSlug]/automation/tasks/[taskId]/route.ts`
- `src/features/assistant/zhiheng-assistant.tsx`
- `src/features/workspaces/automation-editing/overview-page.tsx`
- `scripts/test-video-plan-draft.ts`
- `docs/知衡助手-Agent-V1-Phase3B1-草稿任务与高级编辑实施报告.md`

保留的 Phase 3A 未提交改动：

- `src/lib/agent/video-asset-index.ts`
- `src/lib/agent/tools/index.ts`
- `scripts/test-create-video-plan.ts`
- `scripts/test-video-search-benchmark.ts`
- `docs/知衡助手-Agent-V1-Phase3A-剪辑方案实施报告.md`

## 16. Phase 3B-2 建议

下一阶段应处理真实执行层：

1. 读取 `agentPlan.timeline`
2. 将 `relativePath + sourceStart/sourceEnd` 转换为 MoneyPrinterTurbo 可执行的本地素材剪辑输入
3. 支持按 timeline 顺序精确剪辑
4. 将当前草稿状态从 `draft` 提交为 `generating`
5. 明确失败回滚与日志记录
6. 验证 Voice Service 只在正式执行阶段调用

本轮不做 MP4 渲染，符合 Phase 3B-1 范围。
