# 知衡助手 Agent V1 - Phase 3B-2 真实视频执行实施报告

## 1. 本阶段目标

本阶段完成从 Agent 剪辑草稿到真实 MP4 的闭环：

Agent Plan → 草稿任务 → 用户确认执行 → 冻结执行快照 → 秒级裁剪素材 → Voice Service 生成配音 → MoneyPrinterTurbo 使用 custom-audio-file 合成视频 → 输出待审核 MP4。

## 2. 实现范围

- 新增草稿任务确认执行接口。
- 新增 `execute_video_task` Agent 高风险工具。
- 执行时冻结 `agentPlan`、`currentTaskConfig`、`executionSnapshot`。
- 服务端按素材 `relativePath + sourceStart/sourceEnd` 生成真实裁剪片段。
- MoneyPrinterTurbo 只接收裁剪后的本地片段和 Voice Service 音频。
- 预生成 SRT 字幕，并让 MoneyPrinterTurbo 在自定义音频模式下复用该字幕。
- 将中文默认字幕字体切换为 `STHeitiMedium.ttc`，避免中文字幕不可见。

## 3. 关键文件

- `src/lib/workspaces/automation-editing.ts`
- `src/lib/workspaces/moneyprinter-engine.ts`
- `src/lib/agent/tools/index.ts`
- `src/features/workspaces/automation-editing/overview-page.tsx`
- `src/app/api/workspaces/[workspaceSlug]/automation/tasks/[taskId]/route.ts`
- `src/app/api/workspaces/[workspaceSlug]/automation/tasks/[taskId]/execute/route.ts`
- `engines/moneyprinterturbo/app/services/task.py`
- `scripts/test-video-plan-execution.ts`

## 4. 草稿确认执行

新增执行入口：

`POST /api/workspaces/[workspaceSlug]/automation/tasks/[taskId]/execute`

权限：

- 需要登录。
- 需要 Workspace 权限 `video:generate`。
- 只允许执行 `draft` 状态任务。

执行时不会重新调用 LLM，也不会重新选素材，而是使用已确认草稿里的方案。

## 5. 执行快照

执行快照写入任务 `packagingOptions`，前缀为：

`executionSnapshot:`

快照包含：

- `taskId`
- `workspaceId`
- `videoRatio`
- `scriptText`
- `voice`
- `subtitle`
- `bgm`
- `editTimeline`
- `warnings`

## 6. 秒级素材裁剪

执行链路会把 Agent Plan 中的每个素材片段解析为真实文件：

`StorageService.getPath('assets') + relativePath`

并进行目录逃逸检查和文件存在性检查。若真实文件不存在，任务直接失败并返回明确错误。

裁剪使用 ffmpeg：

- `sourceStart`
- `sourceEnd`
- `targetDuration`
- `videoRatio`
- 9:16 输出裁剪为 1080x1920

## 7. 真实测试任务

测试主题：

`为什么饮料代工厂一定要重视无菌灌装`

参数：

- 时长：30 秒
- 类型：知识科普型
- 平台：抖音
- 比例：9:16

真实任务 ID：

`674bba01-b88f-4e39-abe7-453407bb7bfa`

任务状态：

`pending_review`

## 8. 裁剪证据

本次真实执行生成 5 个裁剪片段：

| 顺序 | 素材 | sourceStart | sourceEnd | 裁剪后时长 |
|---|---|---:|---:|---:|
| 1 | `07-生产线·灌装/01_无菌_1.MP4` | 0 | 4.4 | 4.40s |
| 2 | `07-生产线·灌装/07_无菌_2.MP4` | 0 | 4.0 | 4.00s |
| 3 | `03-研发操作/03_品控_1.MP4` | 0 | 2.8 | 2.80s |
| 4 | `03-研发操作/07_品控_2.mp4` | 0 | 4.7 | 4.67s |
| 5 | `07-生产线·灌装/01_无菌_1.MP4` | 0 | 4.4 | 4.40s |

裁剪文件目录：

`D:\知衡智企\engines\moneyprinterturbo\storage\tasks\674bba01-b88f-4e39-abe7-453407bb7bfa\zhiheng-clips`

日志中可见 `timeline-clip order=... sourceStart=... sourceEnd=...`，证明执行使用的是秒级素材片段，不是整段素材。

## 9. Voice Service

Voice Service 已真实调用并生成音频：

`D:\知衡智企\storage\voice-service\outputs\doubao-08250af3-3bd5-4ad2-b239-52b535a0339d.mp3`

MoneyPrinterTurbo 日志确认：

`using custom audio file`

即视频合成使用知衡智企生成的外部音频文件，没有进入 MoneyPrinterTurbo 内置 TTS。

## 10. 字幕

字幕文件：

`D:\知衡智企\engines\moneyprinterturbo\storage\tasks\674bba01-b88f-4e39-abe7-453407bb7bfa\subtitle.srt`

MoneyPrinterTurbo 日志确认：

`using prebuilt subtitle file`

字幕字体：

`STHeitiMedium.ttc`

抽帧检查确认底部中文字幕可见。

## 11. BGM

执行快照保留 BGM 配置，合成时将背景音乐音量限制在 30%，避免盖过配音。

## 12. 成片输出

最终 MP4：

`D:\知衡智企\engines\moneyprinterturbo\storage\tasks\674bba01-b88f-4e39-abe7-453407bb7bfa\final-1.mp4`

文件大小：

`17,697,496 bytes`

媒体信息：

- 时长：34.80s
- 视频：H.264，1080x1920，30fps
- 音频：AAC，44100Hz，stereo

## 13. MoneyPrinterTurbo 调用确认

日志确认命令包含：

`--custom-audio-file D:\知衡智企\storage\voice-service\outputs\doubao-08250af3-3bd5-4ad2-b239-52b535a0339d.mp3`

日志确认退出：

`video-pass exit=0`

## 14. 已知执行警告

本次 Agent 选中的源片段总时长约 14.8 秒，短于配音实际时长约 34.8 秒，因此 MoneyPrinterTurbo 按现有策略循环片段补齐成片时长。

这是执行警告，不是失败。系统没有在执行阶段重新选素材，符合本阶段“确认后不重选”的要求。

## 15. 验证命令

已执行：

```bash
npm run typecheck
npm run build
```

结果：

- `typecheck` 通过。
- `build` 通过。
- build 有现有 Turbopack/font trace 警告，不影响本阶段功能。

## 16. 结论

Phase 3B-2 已完成首条真实 MP4 闭环：

真实 Agent Plan → 草稿确认 → 固化快照 → 秒级裁剪 → 真实语音 → custom-audio-file → 字幕烧录 → MP4 输出。

## 17. 后续建议

下一阶段建议处理：

- 让 Agent 在计划阶段选足目标时长素材，减少循环片段。
- 在任务详情页展示 executionSnapshot 和裁剪证据。
- 在高级编辑工作台支持人工调整每段 `sourceStart/sourceEnd` 后重新执行。
- 增加成片预览播放器和审核通过/驳回状态流转。
