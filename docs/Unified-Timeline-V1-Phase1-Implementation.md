# Unified Timeline V1 — Phase 1 实施说明

> 状态：Phase 1 已完成（契约层 + 接口层）
> 日期：2026-08-29
> 范围：只交付类型定义、接口、Schema、Validator，不进入 Renderer 主体实现

---

## 1. 实际新增文件

| 文件路径 | 说明 |
|---|---|
| `src/engines/renderer-interface.ts` | RendererInterface 公共接口 + 能力声明 + 验证/渲染结果类型 |
| `src/engines/zhiheng-renderer/types.ts` | Unified Timeline V1 全部 zod schema + TypeScript 类型 + 工具函数 |
| `src/engines/zhiheng-renderer/style-registry.ts` | Style Registry 样式注册表 + 5 个内置样式（provisional） |
| `src/engines/zhiheng-renderer/validator.ts` | Timeline Validator（schema + semantic 验证） |
| `src/engines/zhiheng-renderer/index.ts` | 模块入口，统一导出 |
| `scripts/generate-timeline-schema.ts` | 从 zod schema 生成 JSON Schema 的脚本 |
| `docs/schemas/unified-timeline-v1.schema.json` | 生成的 JSON Schema（Draft 7） |
| `docs/schemas/example-unified-timeline-v1.json` | 示例 Timeline（3 video segment + voice + subtitle + keyword + title） |
| `docs/Unified-Timeline-V1-Phase1-Implementation.md` | 本文档 |

**未修改任何现有文件。** 特别是：
- `src/lib/workspaces/moneyprinter-engine.ts` — 未修改
- `src/lib/workspaces/automation-editing.ts` — 未修改
- `src/lib/voice-service/client.ts` — 未修改
- Agent / Voice Service / 知识库 — 未修改

---

## 2. Unified Timeline V1 结构

### 根对象

| 字段 | 类型 | 说明 |
|---|---|---|
| `schemaVersion` | `1` (literal) | Schema 版本，固定为 1。不兼容变更需升级版本。 |
| `timelineId` | string | Timeline 唯一标识 |
| `taskId` | string | 关联任务 ID |
| `outputProfile` | OutputProfile | 输出配置（分辨率/fps/编码/色彩目标） |
| `videoTrack` | VideoSegment[] | 视频轨道，非空，连续无 gap 无 overlap |
| `voiceTrack` | VoiceSegment[] | 配音轨道，V0.1 通常一个片段 |
| `subtitleTrack` | SubtitleSegment[] | 字幕轨道，不允许 overlap |
| `titleTrack` | TitleSegment[] | 标题轨道，允许 overlap（layer 区分层级） |
| `overlayTrack` | OverlaySegment[]? | **预留**，V0.1 不执行 |
| `bgmTrack` | BgmSegment[]? | **预留**，V0.1 不执行 |
| `sfxTrack` | SfxSegment[]? | **预留**，V0.1 不执行 |

### 冻结规则

1. **videoTrack 不保存 timelineStart**：V0.1 连续无 gap 无 overlap，timelineStart 由数组顺序 + 前置 segment duration 累计派生。工具函数 `deriveVideoTimelineStarts()` 可计算。
2. **不保存 end 字段**：所有轨道只有 `start` + `duration`，`end = start + duration`，避免三者不一致。
3. **时间单位**：秒的小数，最多 3 位（毫秒精度）。Validator 检查精度。
4. **AssetRef 统一格式**：`{ type: "library_asset" | "task_asset", assetId: string }`。不保存绝对路径、URL、sourceRef。
5. **样式只写 styleId**：Timeline 不存储字体/字号/颜色/x/y，具体样式由 Style Registry 决定。

### OutputProfile 默认值

```
width: 1080
height: 1920
targetFps: 30       ← 不默认 60fps，fps 是输出技术规格不是创意规则
videoCodec: h264
audioCodec: aac
pixelFormat: yuv420p
colorTarget: bt709_sdr
```

---

## 3. RendererInterface 结构

```typescript
interface RendererInterface {
  getName(): string;
  getVersion(): string;
  getCapabilities(): RendererCapabilities;
  validate(timeline: unknown): ValidationResult;
  render(timeline: unknown): Promise<RenderResult>;
}
```

### 设计要点

- `validate` / `render` 的 timeline 参数用 `unknown`，不依赖具体 Timeline 类型。具体实现内部做类型收窄。这样接口不绑定 V1，未来 V2 Timeline 也可实现同一接口。
- 调用顺序：`getCapabilities()` → `validate()` → `render()`。
- `render()` 内部应首先调用 `validate()`，校验失败直接返回失败结果，不开始渲染。

### 验证结果

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];   // 非空则 valid=false
  warnings: string[];           // 不阻止执行
}

interface ValidationError {
  field: string;     // 如 "videoTrack[2].sourceStart"
  message: string;
  code: string;      // 机器可读错误码
}
```

### 渲染结果

```typescript
interface RenderResult {
  success: boolean;
  outputPath?: string;
  logPath?: string;
  durationMs: number;
  errors: RenderError[];
  warnings: string[];
  rendererName: string;    // 用于 A/B 测试追踪
  rendererVersion: string;
}
```

---

## 4. Capability 机制

### RendererCapabilities 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `sourceTrim` | boolean | 源素材裁剪（sourceStart + duration） |
| `multiSegmentConcat` | boolean | 多段视频拼接 |
| `scaleCrop` | boolean | 缩放/裁剪到目标分辨率 |
| `hdrToneMap` | boolean | HDR/HLG → SDR tone mapping |
| `assSubtitles` | boolean | ASS 字幕烧录 |
| `keywordHighlight` | boolean | 字幕内关键词局部高亮 |
| `titleTrack` | boolean | 独立标题轨道 |
| `overlayTrack` | boolean | 图像叠加（V0.2） |
| `bgmTrack` | boolean | 背景音乐（V0.2） |
| `sfxTrack` | boolean | 音效（V0.3） |
| `voiceMix` | boolean | 配音混音 |
| `outputProfile` | boolean | 输出配置文件 |
| `transitions` | string[] | 支持的转场类型列表，V0.1 只有 `["hard_cut"]` |

### 强制规则

1. 每个 Renderer 必须如实声明能力，**禁止虚报**。
2. `validate()` 必须根据能力声明检查 Timeline：Timeline 使用的功能必须在 capabilities 范围内。
3. 不支持的功能返回 `UNSUPPORTED_CAPABILITY` 错误，**禁止静默降级**（如不支持关键词高亮就跳过高亮渲染）。
4. 任务层可根据能力声明自动选择合适的 Renderer，或在两个都不支持时报错。

### 预期能力对比（Phase 2 实现后）

| 能力 | MoneyPrinterRenderer (legacy) | ZhihengRenderer V0.1 |
|---|---|---|
| sourceTrim | true | true |
| multiSegmentConcat | true | true |
| scaleCrop | true | true |
| hdrToneMap | **false** | **true** |
| assSubtitles | **false** (用 TextClip/SRT) | **true** |
| keywordHighlight | **false** | **true** |
| titleTrack | **false** | **true** |
| overlayTrack | false | false (V0.2) |
| bgmTrack | true | false (V0.2) |
| sfxTrack | false | false (V0.3) |
| voiceMix | true | true |
| outputProfile | false | true |
| transitions | ["hard_cut"] | ["hard_cut"] |

---

## 5. Style Registry 结构

### 设计原则

- Timeline 只写 `styleId`（如 `"subtitle.default"`、`"title.hook"`），不存储任何具体视觉参数。
- Style Registry 是 Renderer 内部模块，管理 `styleId → StyleDefinition` 的映射。
- 支持自定义样式覆盖（企业级品牌定制）。

### StyleDefinition

```typescript
interface StyleDefinition {
  styleId: string;
  description: string;
  status: 'confirmed' | 'provisional' | 'todo';
  source?: string;           // 样式来源（知识库路径/样片编号）
  ass: AssStyleDefinition;   // ASS 样式参数
  notes?: string;             // 备注：需确认事项/已知问题/调整建议
}
```

### 内置样式（5 个，全部 provisional）

| styleId | 说明 | 状态 |
|---|---|---|
| `subtitle.default` | 底部普通字幕，白色粗体，深色描边 | provisional |
| `subtitle.keyword` | 字幕内关键词高亮，黄色（ASS 内联标签局部覆盖） | provisional |
| `title.hook` | 开头钩子大标题，高饱和颜色，粗体描边 | provisional |
| `title.subhook` | 副标题/补充说明（架构预留，样片未明确观察到） | provisional |
| `title.emphasis` | B-roll 中段强调关键词，蓝白组合，画面中部 | provisional |

### 为什么全部是 provisional

人工样片拆解（`08_人工样片拆解/样片001-005`）目前只提供**语义描述**：
- 字幕：白色、粗体/半粗体、深色描边、底部位置、中小字号、无背景框
- 关键词：黄色、描边明显、嵌入字幕内部
- 大标题：高饱和颜色、粗体、描边阴影、中部偏下

**未提供精确像素值**（字号、描边宽度、边距、颜色码、字体名）。因此具体数值均标记为 provisional，需要 Phase 2 通过以下方式确认：
1. 用样片原始素材 + provisional 样式生成测试视频
2. 与人工样片成片视觉对比
3. 调整参数后标记为 confirmed

### ASS 颜色格式

`&HAABBGGRR`（AA=alpha，00=不透明；BB=蓝；GG=绿；RR=红）
- 白色：`&H00FFFFFF`
- 黑色：`&H00000000`
- 黄色：`&H0000FFFF`
- 纯蓝：`&H00FF0000`

---

## 6. Validator 规则

### TimelineValidator 验证范围

| # | 验证项 | 验证方式 | 错误码 |
|---|---|---|---|
| 1 | schemaVersion = 1 | zod literal | SCHEMA_INVALID |
| 2 | videoTrack 非空 | zod min(1) | SCHEMA_INVALID |
| 3 | assetId 非空 | zod min(1) | SCHEMA_INVALID |
| 4 | sourceStart >= 0 | zod min(0) | SCHEMA_INVALID |
| 5 | duration > 0 | zod positive() | SCHEMA_INVALID |
| 6 | 时间最多 3 位小数 | semantic 检查 | TIME_PRECISION_EXCEEDED |
| 7 | transition = hard_cut | zod literal | SCHEMA_INVALID |
| 8 | subtitle start/duration 合法 | zod | SCHEMA_INVALID |
| 9 | title start/duration 合法 | zod | SCHEMA_INVALID |
| 10 | styleId 存在于 Style Registry | semantic 检查 | STYLE_NOT_FOUND |
| 11 | subtitle 不允许 overlap | semantic 检查 | SUBTITLE_OVERLAP |
| 12 | title 允许 overlap | —（不验证） | — |
| 13 | subtitle/title/voice 不超过视频总时长 | semantic 检查 | EXCEEDS_TOTAL_DURATION |
| 14 | outputProfile 字段合法 | zod | SCHEMA_INVALID |
| 15 | 预留字段（overlay/bgm/sfx）存在 | 警告，不阻止执行 | — |

### 不验证（留给后续阶段）

- **素材文件真实存在性** → runtime Asset Resolver（Phase 2）
- **FFmpeg 环境可用性** → Environment Preflight（Phase 2）
- **Renderer 能力匹配** → 具体 Renderer 的 validate() 实现（Phase 2）
- **voice asset 文件存在性** → runtime 检查

### 与 RendererInterface.validate() 的关系

`TimelineValidator` 只做 Timeline 本身的结构和语义验证，不关心具体 Renderer 的能力。

具体 Renderer 的 `validate()` 实现应：
1. 调用 `TimelineValidator.validate(timeline)` 做基础验证
2. 调用 `getCapabilities()` 做能力匹配检查
3. 合并两者的错误和警告，返回最终 ValidationResult

---

## 7. JSON Schema source of truth

### 唯一权威来源

**`src/engines/zhiheng-renderer/types.ts` 中的 zod schema 是唯一 source of truth。**

- TypeScript 类型：通过 `z.infer<typeof XxxSchema>` 从 zod schema 推导，**不手动维护第二套类型定义**。
- JSON Schema：通过 `scripts/generate-timeline-schema.ts` 脚本从 zod schema 自动生成，**不手动编辑**。
- 运行时验证：直接使用 zod schema 的 `.parse()` 方法。

### 生成方式

```bash
npx tsx scripts/generate-timeline-schema.ts
```

使用 zod 4 内置的 `z.toJSONSchema()` API，目标格式为 JSON Schema Draft 7。

### 生成产物

`docs/schemas/unified-timeline-v1.schema.json`

包含元数据：
- `$schema`: Draft 7
- `$id`: 本地标识
- `title`: Unified Timeline V1
- `version`: 1
- `description`: 包含 source of truth 路径说明

### 变更流程

1. 修改 `types.ts` 中的 zod schema
2. 运行 `npx tsx scripts/generate-timeline-schema.ts` 重新生成 JSON Schema
3. TypeScript 类型自动更新（z.infer）
4. 不需要手动同步任何文件

---

## 8. 哪些字段/概念来自已有项目

| 已有项目元素 | 位置 | 在新架构中的角色 |
|---|---|---|
| `AutomationVideoTask` / `AutomationVideoAsset` | `src/lib/db/schema.ts` | 任务和素材的 DB 行类型，新 Timeline 的 taskId 和 assetId 与之关联 |
| `generateVoiceAudio()` | `src/lib/voice-service/client.ts` | Voice Service 客户端，新架构的上游资产生成服务。Renderer 不调用此函数，由编排层在 Renderer 之前调用。 |
| `VoiceServiceResponse.audio_path` / `duration` | `src/lib/voice-service/client.ts` | voice asset 的输出格式，新 Timeline 的 voiceTrack.assetRef 引用此资产 |
| `AutomationExecutionSnapshot` | `src/lib/workspaces/automation-editing.ts` | **旧执行时快照**，包含绝对路径 sourceFile，不能当正式 Timeline。新架构的概念参考（editTimeline/voice/subtitle/bgm 结构），但字段设计完全重新定义。 |
| `getFfmpegCommand()` | `src/lib/workspaces/moneyprinter-engine.ts` | MPT 适配层的 ffmpeg 查找逻辑，新 Renderer 的 Environment Preflight 可参考此模式但独立实现 |
| 素材表 `automationVideoAssets.id` | `src/lib/db/schema.ts` | assetId 的来源之一（library_asset 类型）。新架构的 Asset Resolver 将 assetId 解析为真实路径 |
| `packagingOptions` 编码存储 | `src/lib/workspaces/automation-editing.ts` | 旧系统用 JSON 字符串存储复杂配置。新 Timeline 是结构化对象，可直接持久化，不需要编码 |

---

## 9. 哪些是新建

| 新建元素 | 说明 |
|---|---|
| `RendererInterface` | 统一 Renderer 接口，legacy MPT 和新知衡 Renderer 都实现此接口 |
| `RendererCapabilities` | 能力声明机制，禁止静默降级 |
| `UnifiedTimelineV1` | 全新的多 Track Timeline 结构，与旧 AutomationExecutionSnapshot 不兼容 |
| `AssetRef` | 统一素材引用格式（type + assetId），不存绝对路径 |
| `OutputProfile` | 输出配置对象，fps 是技术规格不是创意规则 |
| `StyleRegistry` | 样式注册表，Timeline 只写 styleId |
| `AssStyleDefinition` | ASS 样式参数结构（字体/字号/颜色/描边/位置/对齐） |
| `TimelineValidator` | schema + semantic 验证器 |
| `SubtitleHighlight` | 字幕关键词高亮的语义描述（只写关键词文本+字符位置，不写视觉参数） |
| `deriveVideoTimelineStarts()` | 工具函数：从数组顺序 + duration 派生 timelineStart |
| `calculateVideoTotalDuration()` | 工具函数：计算视频总时长 |
| JSON Schema 生成脚本 | 从 zod schema 自动生成 JSON Schema |

---

## 10. 哪些留给 Phase 2

| Phase 2 任务 | 说明 |
|---|---|
| `ZhihengRenderer` 类 | implements RendererInterface，串联所有子模块 |
| `MoneyPrinterRenderer` 包装类 | 包装现有 moneyprinter-engine.ts，实现 RendererInterface |
| `AssetResolver` | assetId → 真实文件路径，支持本地/NAS/R2/OSS/缓存 |
| `Asset Ingest & Probe` | ffprobe 元数据探测 + 色彩空间分类（SDR/HLG/PQ） |
| `Per-Segment Preprocess` | 裁剪/缩放/fps 统一/HDR→SDR tone mapping/FFV1 无损中间文件 |
| `ASS Generator` | subtitleTrack + titleTrack + Style Registry → 一个 .ass 文件 |
| `Final Composition` | concat + ass 烧录 + voice 混音 + H.264/AAC 编码 |
| `FFmpeg Runner` | FFmpeg 命令执行器（子进程管理/超时/stdout stderr 捕获） |
| `Environment Preflight` | ffmpeg/ffprobe/滤镜/编码器/字体可用性检测 |
| `Render Log` | 结构化渲染日志 |
| Style Registry 实测确认 | 用样片素材测试 provisional 样式，调整后标记为 confirmed |
| 项目自带字体确认 | 确定开源中文字体（如思源黑体），放入 assets/fonts/ |

---

## 11. 与 AutomationExecutionSnapshot 的区别

| 维度 | AutomationExecutionSnapshot（旧） | UnifiedTimelineV1（新） |
|---|---|---|
| **定位** | 执行时快照，包含已解析的绝对路径 | Agent 与执行层之间的结构化契约，环境无关 |
| **素材引用** | `sourceFile`（绝对路径，如 `D:\xxx\xxx.mp4`）+ `relativePath` | `AssetRef { type, assetId }`，不存路径 |
| **视频时间字段** | `timelineStart` + `timelineEnd` + `sourceStart` + `sourceEnd`（四字段，可能不一致） | `sourceStart` + `duration`（两字段，end 派生），timelineStart 由数组顺序派生 |
| **字幕** | 全局 subtitle 配置（enabled/font/position/size/color），执行时按行数均分时间 | 独立 subtitleTrack，每条有 start/duration/text/styleId/highlights，精确时间控制 |
| **关键词高亮** | 不支持 | 支持，`highlights` 字段描述语义范围 |
| **标题** | 不支持独立标题轨道 | 支持 titleTrack，layer 区分层级 |
| **配音** | `voice` 配置（mode/voiceName/volume/speed），执行时调用 TTS 生成 | voiceTrack 引用**已生成完成**的 voice asset，Renderer 不调用 TTS |
| **输出配置** | `videoRatio`（字符串如"竖屏 9:16"） | `OutputProfile` 对象（width/height/targetFps/codec/pixelFormat/colorTarget） |
| **样式** | 全局字幕参数（font/size/color/position 直接写在快照里） | 只写 styleId，具体样式由 Style Registry 决定 |
| **持久化** | 编码为 JSON 字符串存在 `packagingOptions` 中 | 结构化对象，可直接持久化/重放/审计 |
| **可移植性** | 换电脑后绝对路径失效，无法重放 | 只存 assetId，Asset Resolver 运行时解析，可跨环境重放 |
| **能力声明** | 无 | RendererInterface 强制能力声明，禁止静默降级 |

**关键区别一句话**：AutomationExecutionSnapshot 是"已经解析好、绑定当前机器环境的执行指令"，UnifiedTimelineV1 是"环境无关、可持久化重放、能力可校验的结构化契约"。

---

## 12. 与 test-only timeline 的区别

项目中之前存在的 test-only timeline（如 Test001/Test002 中直接写的 FFmpeg 命令参数、临时 JSON 配置）与正式 Unified Timeline V1 的区别：

| 维度 | test-only timeline | UnifiedTimelineV1（正式） |
|---|---|---|
| **目的** | 快速验证 FFmpeg 能力（HDR tone mapping、裁剪、拼接） | Agent 与执行层之间的正式契约，用于生产环境 |
| **结构** | 临时 JSON 或直接 FFmpeg 参数，无统一 schema | 严格 zod schema + TypeScript 类型 + JSON Schema，三层一致 |
| **素材引用** | 直接写绝对路径（如 `D:\tmp\test\clip1.mp4`） | AssetRef { type, assetId }，不存路径 |
| **验证** | 无验证，直接执行 | TimelineValidator 做 15 项 schema + semantic 验证 |
| **样式** | 硬编码 drawtext 参数或 SRT | 只写 styleId，Style Registry 管理，统一 ASS |
| **能力匹配** | 无 | RendererCapabilities 强制声明，禁止静默降级 |
| **持久化** | 不持久化，测试后删除 | 可持久化到任务记录，支持失败重试/复盘/审计/A/B 重放 |
| **版本管理** | 无 | schemaVersion 字段，不兼容变更需升级版本 |
| **可复用性** | 一次性，不可复用 | 可复用，同一份 Timeline 可交给不同 Renderer 渲染（A/B 测试） |

**Test002 的定位**：Test002 是 FFmpeg 能力验证（验证 HLG→SDR tone mapping 的 filter chain），其结论（zscale→linear + tonemap=hable + zscale→bt709 三段式）将用于 Phase 2 的 Per-Segment Preprocess 实现。但 Test002 的临时配置文件不是正式 Timeline，不能直接当 UnifiedTimelineV1 使用。

---

## 附录：Phase 1 验收清单

- [x] RendererInterface 定义（含 getName/getVersion/getCapabilities/validate/render）
- [x] RendererCapabilities 定义（14 个能力字段）
- [x] UNSUPPORTED_CAPABILITY 错误码定义
- [x] UnifiedTimelineV1 类型定义（zod schema + TS 类型）
- [x] videoTrack 不保存 timelineStart（由 deriveVideoTimelineStarts 派生）
- [x] AssetRef 统一格式（type + assetId，无绝对路径）
- [x] OutputProfile 定义（默认 30fps，不默认 60fps）
- [x] voiceTrack 引用已生成 voice asset（Renderer 不调用 TTS）
- [x] subtitleTrack 支持 highlights（语义范围，无视觉参数）
- [x] titleTrack 支持 layer（允许 overlap）
- [x] 预留 overlayTrack/bgmTrack/sfxTrack（V0.1 不执行，Validator 警告）
- [x] Style Registry 定义（5 个内置样式，全部 provisional）
- [x] TimelineValidator 实现（15 项验证规则）
- [x] JSON Schema 生成（zod toJSONSchema，Draft 7）
- [x] source of truth 明确（types.ts 的 zod schema）
- [x] 示例 Timeline（3 video + voice + subtitle + keyword + title）
- [x] 设计说明文档
- [x] 未修改 moneyprinter-engine.ts
- [x] 未修改 Agent / Voice Service / 知识库
- [x] 未 commit / 未 push
