# 自动剪辑真实执行链与 Renderer 审计

审计时间：2026-08-29

审计范围：

- Agent 工具：`src/lib/agent`
- 自动化剪辑任务：`src/lib/workspaces/automation-editing.ts`
- 知衡智企到 MoneyPrinterTurbo 的执行适配层：`src/lib/workspaces/moneyprinter-engine.ts`
- MoneyPrinterTurbo 内置执行链：`engines/moneyprinterturbo`
- 测试产物：`tmp/auto-edit-test-001`、`tmp/auto-edit-test-001-rerun`、`tmp/auto-edit-test-002`

本报告只做只读审计和结论整理，不代表新功能开发。

## 1. 当前真实调用链

### 1.1 前端直接创建自动剪辑任务

真实链路：

```text
自动化剪辑空间页面
  ↓
POST /api/workspaces/[workspaceSlug]/automation/tasks
  ↓
createAutomationVideoTask()
  ↓
startMoneyPrinterTaskWorker(task.id)
  ↓
scripts/run-moneyprinter-task.ts
  ↓
runMoneyPrinterTask(taskId)
  ↓
Voice Service 生成配音音频
  ↓
MoneyPrinterTurbo cli.py --custom-audio-file
  ↓
MoneyPrinterTurbo task.py / video.py
  ↓
FFmpeg / MoviePy
  ↓
final-*.mp4
```

关键文件：

- `src/app/api/workspaces/[workspaceSlug]/automation/tasks/route.ts`
- `src/lib/workspaces/automation-editing.ts`
- `src/lib/workspaces/moneyprinter-engine.ts`
- `scripts/run-moneyprinter-task.ts`
- `engines/moneyprinterturbo/cli.py`
- `engines/moneyprinterturbo/app/services/task.py`
- `engines/moneyprinterturbo/app/services/video.py`

### 1.2 Agent 生成方案后再执行

真实链路：

```text
知衡助手 / Agent Tool
  ↓
create_video_plan
  ↓
search_video_assets
  ↓
CreateVideoPlanOutput
  ↓
save_video_plan_as_draft
  ↓
createDraftTaskFromVideoPlan()
  ↓
用户确认 / execute_video_task / POST execute
  ↓
executeAutomationVideoDraftTask()
  ↓
AutomationExecutionSnapshot
  ↓
startMoneyPrinterTaskWorker()
  ↓
runMoneyPrinterTask()
  ↓
prepareExecutionTimelineMaterials()
  ↓
Voice Service
  ↓
MoneyPrinterTurbo --custom-audio-file --video-materials <预裁剪片段>
  ↓
MPT 视频合成 / 字幕 / BGM / 输出
```

关键文件：

- `src/lib/agent/tools/index.ts`
- `src/lib/agent/video-asset-index.ts`
- `src/app/api/workspaces/[workspaceSlug]/automation/tasks/from-plan/route.ts`
- `src/app/api/workspaces/[workspaceSlug]/automation/tasks/[taskId]/execute/route.ts`
- `src/lib/workspaces/automation-editing.ts`
- `src/lib/workspaces/moneyprinter-engine.ts`

## 2. Agent 职责

当前 Agent 工具层已经承担以下职责：

- 读取企业上下文：`get_company_context_summary`
- 读取剪辑 Skill：`list_video_skills`、`get_video_skill`
- 搜索素材片段：`search_video_assets`
- 生成视频方案：`create_video_plan`
- 保存草稿任务：`save_video_plan_as_draft`
- 触发已确认草稿执行：`execute_video_task`

`create_video_plan` 的输出包含脚本、分段、素材选择、sourceStart/sourceEnd、timelineStart/timelineEnd、素材用途、匹配等级、字幕策略和 BGM 策略。

当前 Agent 没有在正式工具代码中直接写 FFmpeg `filter_complex`，也没有直接执行 concat、burn subtitle、tone mapping 或编码命令。

风险点：

- `create_video_plan` 目前更像规则化计划生成器，并非完整 LLM 驱动的剪辑决策总控。
- Agent 输出字段已经接近 Timeline，但还没有被定义为正式 Unified Timeline schema。

## 3. Timeline 现状

当前项目还没有正式冻结的 Unified Timeline。

现有三类结构需要区分：

### 3.1 Agent Plan Timeline

位置：`src/lib/agent/tools/index.ts`

类型：`VideoPlanTimelineItem`

主要字段：

- `order`
- `timelineStart`
- `timelineEnd`
- `scriptText`
- `purpose`
- `asset.fileName`
- `asset.relativePath`
- `asset.sourceStart`
- `asset.sourceEnd`
- `usageRole`
- `matchLevel`
- `matchScore`
- `matchReasons`
- `cropSafety`
- `transitionOut`

用途：Agent 决策输出，不直接渲染。

### 3.2 Automation Material Timeline

位置：`src/lib/workspaces/automation-editing.ts`

类型：`AutomationMaterialTimeline`

来源：`mapVideoPlanToDraftInput()` / `buildMaterialTimeline()`

用途：保存到自动化剪辑草稿任务配置中，供后续确认执行。

### 3.3 Automation Execution Snapshot

位置：`src/lib/workspaces/automation-editing.ts`

类型：`AutomationExecutionSnapshot`

生成函数：`buildExecutionSnapshotForTask()`

用途：把草稿配置解析成可执行快照，包含绝对素材路径、sourceStart/sourceEnd、时间线区间、字幕、配音、BGM 等执行信息。

结论：

`AutomationExecutionSnapshot` 是当前最接近正式 Timeline 的结构，但它仍是“执行快照”，不是已经对外封版的 Unified Timeline schema。

`tmp/auto-edit-test-001`、`tmp/auto-edit-test-001-rerun`、`tmp/auto-edit-test-002` 中的 `timeline.json` 明确标记为 `test-only-timeline`，不能视为正式 schema。

## 4. Renderer 现状

当前项目没有一个独立命名为 `Renderer` 的正式模块或类。

当前实际 Renderer 是两层混合结构：

```text
知衡智企执行适配层
src/lib/workspaces/moneyprinter-engine.ts
  ↓
MoneyPrinterTurbo 内置渲染管线
engines/moneyprinterturbo/app/services/task.py
engines/moneyprinterturbo/app/services/video.py
  ↓
FFmpeg / MoviePy
```

### 4.1 知衡智企执行适配层

`src/lib/workspaces/moneyprinter-engine.ts` 当前负责：

- 根据任务配置构造 MPT CLI 参数。
- 从执行快照中读取素材时间线。
- 用 FFmpeg 预裁剪素材片段。
- 按视频比例做基础 scale/crop。
- 静音原素材音频。
- 调 Voice Service 生成独立配音文件。
- 写入预生成 `subtitle.srt`。
- 用 `--custom-audio-file` 把外部音频传给 MPT。
- 用 `--video-materials` 把预裁剪片段传给 MPT。
- 启动 MPT CLI 并回写任务状态。

### 4.2 MoneyPrinterTurbo 内置管线

`engines/moneyprinterturbo/app/services/task.py` 当前负责：

- 生成或接收脚本。
- 生成或接收音频。
- 当传入 `custom_audio_file` 时，跳过 MPT 自带 TTS。
- 当任务目录已有 `subtitle.srt` 且没有 TTS 时间轴对象时，使用预生成字幕。
- 处理本地素材。
- 调用 `video.combine_videos()` 拼接素材。
- 调用 `video.generate_video()` 合成音频、字幕、BGM 并输出最终视频。

`engines/moneyprinterturbo/app/services/video.py` 当前负责：

- 多素材拼接。
- 基础比例适配。
- transition 效果。
- SubtitleClip 字幕叠加。
- BGM 混音。
- 最终视频输出。

## 5. Renderer 能力矩阵

| 能力 | 当前状态 | 证据 / 说明 |
|---|---|---|
| 多视频素材 | 已正式支持 | `--video-materials` + MPT local materials |
| sourceStart/sourceEnd | 已正式支持 | `prepareExecutionTimelineMaterials()` 按区间裁剪 |
| clip 顺序 | 已正式支持 | 执行快照按 `order` 排序，裁剪后顺序传入 MPT |
| timeline duration | 部分支持 | 有 timelineStart/timelineEnd，但正式渲染主要按 source 区间与音频时长合成 |
| 9:16 | 已正式支持 | `videoScaleFilter()` 输出 1080x1920 |
| crop/scale | 已正式支持 | 当前为基础居中 crop/scale |
| hard cut | 已正式支持 | 预裁剪片段顺序传入，MPT 支持 none/sequential |
| transition | 部分支持 | MPT 有 fade/slide/zoom/shuffle；执行快照尚未细粒度驱动每段 transition |
| subtitles | 已正式支持 | MPT `generate_subtitle()` 可消费预生成 `subtitle.srt` |
| SRT | 已正式支持 | `writePrebuiltSubtitle()` 写 SRT，MPT 会复用 |
| ASS | Test-only 支持 | Test 002 直接用 FFmpeg `ass=` 烧录，不在正式 Renderer |
| 关键词高亮 | Test-only 支持 | Test 002 的 ASS 样式实现，不在正式 Renderer |
| BGM | 部分支持 | MPT 支持 random/custom/第三方 BGM 与音量；正式链路可传 BGM 参数 |
| SFX | 完全不支持 | 未发现正式 SFX schema/渲染入口 |
| source audio mute | 已正式支持 | 预裁剪 FFmpeg 使用 `-an` |
| voice audio | 已正式支持 | Voice Service → `--custom-audio-file` |
| Overlay | 完全不支持 | 未发现正式 overlay/layer schema |
| Logo | 完全不支持 | 未发现正式 logo overlay schema |
| 图片素材 | 部分支持 | MPT 可处理素材文件，但执行快照缺图片持续时间、缩放、位置等正式语义 |
| HDR/HLG → SDR | Test-only 支持 | Test 002 直接 FFmpeg `zscale/tonemap`，正式链路没有 |
| 色彩处理 | 部分支持 | 正式链路只做基础 yuv420p/H264；缺统一 BT.709/tone mapping |
| 音量处理 | 部分支持 | voice/bgm 音量支持；缺 ducking、SFX、分轨细控 |
| H264/AAC 输出 | 已正式支持 | MPT 最终输出 MP4，测试产物也为 H264/AAC |

## 6. MPT 现状

MPT 当前在知衡智企中处于“内置视频合成引擎”位置，而不是 Agent，也不是业务编排中心。

当前 MPT 负责：

- 本地素材预处理。
- 素材组合。
- 视频比例适配。
- 基础 transition。
- 字幕叠加。
- BGM 混音。
- 最终 MP4 编码输出。

当前 MPT 不应负责：

- 决定业务脚本。
- 决定素材语义匹配。
- 决定 sourceStart/sourceEnd。
- 决定关键词强调。
- 调用知衡智企之外的 TTS。

当前知衡智企正式链路通过 `--custom-audio-file` 绕过 MPT 内置 TTS，这是正确方向。

## 7. FFmpeg 现状

FFmpeg 当前有两种使用方式：

### 7.1 正式链路中的 FFmpeg

位置：`src/lib/workspaces/moneyprinter-engine.ts`

用途：

- 按 sourceStart/sourceEnd 预裁剪片段。
- 基础 crop/scale。
- 去掉原素材声音。
- 输出中间 H264/yuv420p MP4 片段。

位置：`engines/moneyprinterturbo/app/services/video.py`

用途：

- 由 MPT/MoviePy 间接调用，用于最终合成和编码。

### 7.2 Test-only FFmpeg

位置：`tmp/auto-edit-test-001`、`tmp/auto-edit-test-001-rerun`、`tmp/auto-edit-test-002`

用途：

- 直接渲染片段。
- 直接 concat。
- 直接 mux 音频。
- Test 002 直接 burn ASS 字幕。
- Test 002 直接做 HDR/HLG → SDR tone mapping。

这部分不是正式 Renderer。

## 8. Voice Service 调用链

正式链路：

```text
runMoneyPrinterTask()
  ↓
prepareVoiceServiceAudio()
  ↓
src/lib/voice-service/client.ts
  ↓
services/voice-service /v1/tts
  ↓
生成本地音频
  ↓
MPT --custom-audio-file
```

当 `custom_audio_file` 存在时，MPT `generate_audio()` 直接使用该文件，并跳过 MPT 内置 TTS。

## 9. Test 001 执行审计

目录：`tmp/auto-edit-test-001`

证据：

- `timeline.json` 中标记 `schema: test-only-timeline`。
- `render-segments/segment-*.log` 中存在直接 FFmpeg 裁剪命令。
- `concat.log` 中存在直接 `ffmpeg -f concat`。
- `mux.log` 中存在直接将 `video-only.mp4` 与 `voice.mp3` 合成 `final.mp4`。
- `voice-result.json` 表明使用 Voice Service 生成口播。

结论：

Test 001 没有调用正式 Renderer，也没有调用 MPT。它是手工 FFmpeg 验证，只有 Voice Service 走了真实服务。

## 10. Test 001-rerun 执行审计

目录：`tmp/auto-edit-test-001-rerun`

证据：

- `timeline.json` 中标记 `schema: test-only-timeline`。
- `render-segments/segment-*.mp4`、`concat-list.txt`、`video-only.mp4`、`final.mp4` 为一次性测试产物。
- `voice-rerun-result.json` 表明修复后 Voice Service duration 与 FFmpeg duration 做过对比。
- `修复前后对比.md` 明确记录这是 Test 001 的 rerun。

结论：

Test 001-rerun 没有调用正式 Renderer，也没有调用 MPT。它仍然是手工 FFmpeg 验证，重点验证了素材候选识别和 Voice Service duration 修复。

## 11. Test 002 执行审计

目录：`tmp/auto-edit-test-002`

证据：

- `基础成片执行报告.md` 明确写明“本轮使用 test-only FFmpeg/ASS adapter，没有调用正式 MPT 字幕流水线”。
- `segment-*-render.log` 中存在直接 FFmpeg 渲染片段。
- `subtitle-burn.log` 中存在直接 `ass=subtitles.ass` 烧录字幕。
- `concat.log` 中存在直接 concat。
- `mux.log` 中存在直接音视频合成。
- `color-audit` 中保存了 HDR/HLG 到 SDR 的验证材料。

结论：

Test 002 基本绕过正式 Renderer，属于手工 FFmpeg 验证。

Test 002 直接 FFmpeg 实现了：

- source trim。
- 1080x1920 crop/scale。
- HDR/HLG → SDR/BT.709 tone mapping。
- hard cut concat。
- ASS 字幕烧录。
- 关键词高亮。
- voice audio mux。
- H264/AAC 输出。

这些能力当前还没有完整进入正式 Renderer。

## 12. 是否绕过系统

最接近真实情况的结论：

**C. Test 002 基本绕过 Renderer，属于手工 FFmpeg 验证。**

原因：

- Test 002 的输入是 `tmp/auto-edit-test-001-rerun/timeline.json` 复制出来的 test-only timeline，不是数据库中的 `AutomationExecutionSnapshot`。
- Test 002 没有调用 `runMoneyPrinterTask()`。
- Test 002 没有调用 MPT CLI。
- Test 002 的字幕、tone mapping、concat、mux 都由一次性 FFmpeg 命令完成。

## 13. 哪些步骤绕过 Renderer

Test 001 / 001-rerun / 002 绕过的步骤包括：

- 没有通过自动化剪辑任务 API 创建/执行任务。
- 没有通过 `executeAutomationVideoDraftTask()` 生成执行快照。
- 没有通过 `prepareExecutionTimelineMaterials()` 裁剪片段。
- 没有通过 `runMoneyPrinterTask()` 启动 MPT worker。
- 没有通过 MPT `video.combine_videos()` 合成素材。
- 没有通过 MPT `video.generate_video()` 叠字幕、混音和输出。

Test 002 额外绕过了：

- MPT 字幕流水线。
- MPT BGM/音频混合流水线。
- 正式链路中尚未存在的 HDR/HLG tone mapping。

## 14. 哪些能力已经存在但没有在 Test 002 调用

以下能力在正式链路或 MPT 内已经存在，但 Test 002 没有调用：

- MPT CLI 参数编排。
- MPT local materials 处理。
- MPT custom-audio-file。
- MPT 预生成 `subtitle.srt` 消费能力。
- MPT MoviePy 字幕叠加。
- MPT BGM 混音。
- MPT transition 模式。
- 自动化剪辑任务状态回写。
- 引擎日志路径回写。
- `AutomationExecutionSnapshot` 的正式任务执行入口。

## 15. 当前真正缺失的 Renderer 能力

当前正式 Renderer 缺失或不完整的能力：

- 一个明确命名、可测试、可复用的 `Renderer` 模块。
- 正式 Unified Timeline schema。
- 统一的素材层：video/image/audio/overlay/logo/sfx。
- HDR/HLG → SDR/BT.709 tone mapping。
- ASS 字幕渲染。
- 关键词高亮。
- 逐字或精确句级字幕时间轴。
- Overlay / Logo。
- SFX。
- 图片素材持续时间、缩放、位置。
- 更细粒度的每段 transition。
- 音频 ducking / 多轨混音策略。
- 渲染结果结构化报告。
- Test-only FFmpeg 能力回迁到正式 Renderer 的封装。

## 16. 下一步最小修复建议

不要先继续做新测试，也不要直接扩大 Agent。

建议下一步只做一个最小 Renderer 收口：

1. 新建正式 `Renderer` 边界，但先复用现有 `moneyprinter-engine.ts` 能力。
2. 将 `AutomationExecutionSnapshot` 明确命名为当前 V0 执行输入，不急着冻结 Unified Timeline。
3. 把 Test 002 已验证有效的 HDR/HLG tone mapping 迁入 `prepareExecutionTimelineMaterials()`，只作为源素材预处理能力。
4. 把 Test 002 的 ASS 字幕/关键词高亮能力设计为 Renderer 可选能力，但不要直接替换 MPT 字幕，先做 feature flag。
5. 建立一个端到端回归脚本，强制走：

```text
draft task
  ↓
executeAutomationVideoDraftTask
  ↓
runMoneyPrinterTask
  ↓
MPT --custom-audio-file
```

6. 之后再让 Agent 只输出决策，不允许 Agent 或测试脚本直接拼 FFmpeg 命令。

## 17. 总结

当前系统的正式视频生产链已经存在，但不是一个独立完整的 Renderer，而是：

```text
AutomationExecutionSnapshot
  ↓
moneyprinter-engine.ts 预处理
  ↓
Voice Service
  ↓
MoneyPrinterTurbo
  ↓
FFmpeg / MoviePy
```

前面的 Test 001 / Test 001-rerun / Test 002 更准确地说是“素材选择和 FFmpeg 渲染能力验证”，不是正式产品执行链验证。

后续要避免混淆，应把 Test-only FFmpeg 验证中有效的能力，逐步收编到正式 Renderer 边界中。
