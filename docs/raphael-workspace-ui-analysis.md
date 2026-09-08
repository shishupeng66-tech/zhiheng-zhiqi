# Raphael 工作区 UI 分析

分析对象：`https://raphael.app/zh` 首页首屏的「AI 图片 / AI 视频生成工作区」。  
分析范围只包含标题区、模式切换、Prompt 输入、参考素材上传、AI 增强、参数工具栏和生成按钮；不包含营销导航、登录、升级、定价、模型宣传、SEO 内容和 Footer。

## 1. Raphael 工作区结构

首屏结构是一个居中生成器，而不是后台表单：

```text
HomeHero
├─ HeaderCopy
│  ├─ Logo mark
│  ├─ H1
│  ├─ Subtitle
│  └─ Trust/feature chips
├─ CreationModeSegment
│  ├─ AI 图片
│  └─ AI 视频
└─ CreationComposer
   ├─ PromptRow
   │  ├─ ReferenceUploadSlot
   │  └─ PromptTextarea
   │     └─ AiEnhanceSwitch
   └─ GenerationToolbar
      ├─ ModelSelector
      ├─ CompactParameterSelector
      ├─ FastModeSwitch / VideoModeSelector
      ├─ StyleSelector / AudioSwitch
      └─ GenerateButton
```

核心特征：模式切换在输入框上方；输入与上传被包在同一个大容器内；参数工具栏与生成按钮在同一底栏；多数参数不是展开式表单，而是 28px 高的紧凑胶囊按钮。

## 2. 真实尺寸与间距

量测环境：桌面视口 `1280 x 720`。

| 项 | 实测 |
| --- | --- |
| 页面背景 | `rgb(32, 25, 19)` 深棕底 |
| 主标题区域外层 | `x=48.5, w=1168, h=150.5`, 顶部从 `64px` 开始 |
| 标题容器最大宽度 | `max-width: 1024px`, 实际 `w=1024`, 左右 margin 约 `72px` |
| H1 | `40px / 46px`, weight `700`, 实际宽 `678px`, 顶部 `84px` |
| H1 到模式切换 | H1 bottom `130px` 到切换 top `219.5px`，约 `89.5px`，中间含副标题和 chips |
| 工作区容器 | `x=68.5, y=264.5, w=1128, h=210` |
| 工作区左右边距 | 1280 视口下左 `68.5px`、右 `83.5px`；内容容器近似 `max-width: 1128px` |
| 工作区背景层 | 半透明棕灰 `rgba(94, 78, 67, 0.88)` |
| 工作区边框与阴影 | `1px solid rgba(255,255,255,0.08)`, `border-radius: 12px`, `0 24px 64px -40px rgba(0,0,0,.68)` |
| Prompt 内层 | `x=77.5, y=267.5, w=1110, h=160`, padding `12px 12px 4px`, radius `8px` |
| Prompt 行 | `x=89.5, y=279.5, w=1086, h=144`, 横向 flex, gap `12px` |
| 上传槽 | 按钮命中区 `68 x 96`; 外观槽与周边留白一起约 `88 x 120` |
| Textarea | `x=189.5, y=279.5, w=986, h=144`, placeholder `14px`, line-height `20px`, 右 padding `96px` |
| AI 增强 switch | `28 x 28` 命中区，视觉轨道约 `28 x 16`，在 Prompt 右上角 |
| 底部工具栏 | 控件 top `431.5-435.5`, bottom `463.5`; 可按 `40px` 高度设计，内部按钮 `28/32px` |
| 参数按钮圆角 | 工具栏参数 `8px`; 模式切换 `9999px`; 大容器 `12px` |

## 3. AI 图片模式控件

图片模式实测可见控件：

| 控件 | 文案/值 | 尺寸 | 状态 |
| --- | --- | --- | --- |
| 模式：AI 图片 | `AI 图片` | `112 x 28` | active, `rgb(204,144,92)`, 白字 |
| 模式：AI 视频 | `AI 视频 -70%` | `112 x 28` | inactive, 透明底, `rgb(168,157,151)` |
| 上传 | `参考图 / 最多 3 张` | 命中区 `68 x 96` | 位于输入框左侧 |
| Prompt | placeholder `描述您想生成的图像...` | `986 x 144` | 透明底，无边框 |
| AI 增强 | `AI 加强` | switch 命中区 `28 x 28` | checked |
| 模型 | `Seedream 3.5` | `142 x 28` | 工具栏首项 |
| 参数组 | `1:1 2 0.5K 低` | `186 x 28` | 合并展示比例、数量、分辨率/质量 |
| 快速模式 | `快速模式` + switch | switch `28 x 28` | unchecked |
| 风格 | `风格` | `66 x 28` | 单独按钮 |
| 生成 | `生成 0` | `88 x 32` | disabled |

图片模式里「比例、数量、分辨率」没有拆成多个外露按钮，而是合并成一个紧凑参数按钮。点击后大概率进入参数选择浮层；这轮未打开浮层，避免分析超出首屏工作区主状态。

## 4. AI 视频模式控件

切换后可见控件：

| 控件 | 文案/值 | 尺寸 | 状态 |
| --- | --- | --- | --- |
| 模式：AI 图片 | `AI 图片` | `112 x 28` | inactive |
| 模式：AI 视频 | `AI 视频 -70%` | `112 x 28` | active, 同图片 active 样式 |
| 上传 | `参考素材 / 可选` | 命中区 `68 x 96` | 文案变化，仍在左侧 |
| Prompt | placeholder 仍显示 `描述您想生成的图像...` | `986 x 144` | 输入区尺寸不变 |
| AI 增强 | `AI 加强` | switch `28 x 28` | checked |
| 模型 | `MiniMax H3 Turbo` | `173 x 28` | 视频模型 |
| 参数组 | `16:9 4s 480P 1` | `193 x 28` | 合并展示比例、时长、分辨率、数量 |
| 模式 | `单帧` | `60 x 28` | 视频专属模式 |
| 音效 | switch | `24 x 26` | checked |
| 生成 | `-70% 生成 33 10` | `113 x 32` | enabled，带折扣/积分类内容 |

## 5. 模式切换差异

切换 `AI 图片 -> AI 视频` 后：

- active 状态从图片按钮转移到视频按钮，尺寸不变，active 背景仍为 `rgb(204,144,92)`。
- 上传槽文案从 `参考图 / 最多 3 张` 变为 `参考素材 / 可选`。
- 模型从 `Seedream 3.5` 变为 `MiniMax H3 Turbo`。
- 参数组从 `1:1 2 0.5K 低` 变为 `16:9 4s 480P 1`，图片的「数量」语义变成视频的「时长 + 数量」语义。
- 图片模式有 `快速模式` switch 和 `风格`按钮；视频模式变为 `单帧`模式按钮和一个音效 switch。
- 生成按钮从 disabled 的 `生成 0` 变为 enabled 的折扣/消耗展示按钮。知衡智企不应搬运折扣、积分或价格表达，只保留右下角主 CTA 的位置和强度。

## 6. Hover / Active 状态

- 模式 active：橙棕实底 `rgb(204,144,92)`、白字、pill 圆角、内阴影 `inset 0 1px 0 rgba(255,255,255,.08)`。
- 模式 inactive：透明底、灰棕字 `rgb(168,157,151)`。
- 参数按钮默认：`rgba(94,96,104,.30)`，圆角 `8px`，12px 字号，weight `500`。
- 参数按钮 hover：背景升到 `rgba(109,112,121,.36)`，文字颜色不变。
- 风格按钮默认：`rgba(255,255,255,.055)`，`1px rgba(255,255,255,.04)` 边框；hover 类名显示升到 `rgba(255,255,255,.09)`。
- 生成按钮 disabled：`rgba(126,128,132,.28)`，无阴影，仍保持 `32px` 高，避免布局跳动。
- 交互动效主要是 `transition-all/transition-colors duration-200`，生成按钮有 `active:scale-95`。

## 7. 推荐组件拆分

建议不要机械复刻 Raphael 命名，而是按知衡智企业务语义拆：

```text
AiAssetCreationWorkspace
├─ CreationWorkspaceHeader
├─ CreationModeToggle
├─ CreationComposer
│  ├─ ReferenceAssetUploadSlot
│  ├─ PromptTextarea
│  └─ PromptEnhanceToggle
└─ CreationToolbar
   ├─ GenerationModelSelect
   ├─ GenerationParameterSummary
   │  ├─ AspectRatioSelect
   │  ├─ CountOrDurationSelect
   │  └─ ResolutionSelect
   ├─ ImageAdvancedControls
   │  ├─ FastModeToggle
   │  └─ StyleSelect
   ├─ VideoAdvancedControls
   │  ├─ FrameModeSelect
   │  └─ AudioToggle
   └─ GenerateSubmitButton
```

状态建议统一在父组件维护：

- `mode: 'image' | 'video'`
- `prompt`
- `referenceAssets`
- `enhancePrompt`
- `modelId`
- `aspectRatio`
- 图片：`imageCount`, `imageResolution`, `imageStyle`, `fastMode`
- 视频：`duration`, `videoResolution`, `videoCount`, `frameMode`, `audioEnabled`

## 8. 知衡智企现有页面对应关系

当前真实页面与组件：

| Raphael UI 结构 | 知衡智企现有位置 | 现状 |
| --- | --- | --- |
| AI 图片 / 产品内容生成入口 | `src/app/dashboard/workspaces/[workspaceSlug]/page.tsx` -> `AiContentProductGeneratorPage` | 默认工作空间页使用产品内容生成器 |
| 产品生成输入组件 | `src/features/workspaces/ai-content/product-generator-page.tsx` -> `ClaudeStyleAiInput` | 支持上传图片/视频/PDF/文本，输出产品卖点、脚本、图片建议；不是图片生成任务 |
| AI 视频主生产入口 | `src/features/workspaces/automation-editing/overview-page.tsx` -> `V0AiChat` | 真实创建自动化剪辑任务，含上传、语音、比例、分辨率、模型菜单和快捷动作 |
| AI 视频骨架页 | `src/app/dashboard/workspaces/[workspaceSlug]/ai-video/page.tsx` -> `AiVideoPage` | 当前是流程骨架和空状态，不是 Raphael 式生成器 |
| 模型选择 | `V0AiChat` 的 `modelMenu`；`ClaudeStyleAiInput` 的 `ModelSelectorDropdown` | 一个展示已配置模型入口，一个是本地静态模型列表；尚未统一 |
| 上传组件 | `V0AiChat` 内置 file input；`ClaudeStyleAiInput` 内置 file input；通用 `FileUploader` | 生成器上传逻辑分散 |
| Prompt 输入 | `V0AiChat` 使用 `Textarea` + auto resize；`ClaudeStyleAiInput` 原生 textarea | 两套相似输入组件 |
| 视频素材上传 API | `/api/workspaces/[workspaceSlug]/automation/assets` | busboy 流式上传，写入 `automation_video_assets` |
| 视频生成任务 API | `/api/workspaces/[workspaceSlug]/automation/tasks` | POST 创建任务，随后 `startMoneyPrinterTaskWorker(task.id)` |
| 产品内容生成 API | `/api/ai/chat` | 文本流式 LLM，对产品内容方案生成，不是图片/视频渲染 |
| 模型配置读取 | `src/lib/settings/store.ts#getDefaultProviderConfig` -> `src/lib/ai/index.ts#getResolvedLlmConfig` | LLM 从统一模型与接口中心读取默认/启用 provider |
| 图片生成和视频生成是否分开 | 部分分开 | 产品内容生成不是真实图片生成；视频生成任务链路独立；尚无统一的图片/视频生成工作区状态机 |

## 9. 可直接复用的组件/逻辑

- `V0AiChat` 的自动高度 textarea、附件预览、底部参数按钮、浮层选择逻辑，可作为新工作区的基础。
- `automation/assets` 上传 API 可复用给视频参考素材，也可扩展为图片参考素材上传入口。
- `automation/tasks` 的任务创建、任务表、状态与 worker 启动逻辑可作为视频生成提交链路。
- `getDefaultProviderConfig('llm')` 与 `getResolvedLlmConfig()` 可继续作为文案增强、提示词优化、脚本辅助的 LLM 配置来源。
- 现有 UI 基础组件 `Button`、`Textarea`、`Popover/Dropdown`、`Switch`、`Badge`、`Icons` 可复用。

## 10. 需要重构的组件/逻辑

- `ClaudeStyleAiInput` 与 `V0AiChat` 功能重叠，应抽出共享的 `PromptComposer`、`ReferenceAssetStrip`、`CompactToolbarButton`、`ModelMenu`。
- `V0AiChat` 当前更像聊天输入，不是生成工作区；需要把聊天消息区和生成参数区解耦。
- 当前 `/ai-video` 页面是流程说明骨架，不是主生产输入区；如果要采用 Raphael 结构，应把生成器放到该页或工作空间首页首屏。
- 模型选择需要从「展示已配置模型」升级为按能力过滤：图片模型、视频模型、文案/提示词增强模型分开。
- 需要新增图片生成任务语义。目前产品生成页只调用 `/api/ai/chat` 生成内容方案，没有真实图片生成 API、图片任务表或图片输出状态。
- 视频参数需要更接近任务字段：比例、时长、分辨率、数量、音色/BGM/音效、素材匹配模式，而不是只显示语音/比例/分辨率。

## 11. 不应该搬入知衡智企的 Raphael 元素

不要搬：

- Raphael AI 品牌、Logo、宣传语。
- `免费无限制`、`无需登录`、折扣、积分、升级、价格、套餐入口。
- Raphael 模型营销文案和模型宣传区。
- Raphael 自有 API、路由、后端逻辑、私有接口参数。
- 首页 SEO 长文、FAQ、用户评价、灵感瀑布流。

可以借鉴：

- 首屏生成工作区结构。
- 图片/视频同框切换交互。
- 左侧参考素材槽 + 右侧大 Prompt 的布局。
- 右上角 Prompt 增强开关。
- 底部紧凑参数工具栏。
- 右下角固定生成按钮。
- active/hover 的低跳动状态设计。

## 12. 最终建议重构方案

建议以 `V0AiChat` 为主要基底，重构成非聊天化的 `AiAssetCreationWorkspace`：

1. 在工作空间主入口提供 `AI 图片 / AI 视频` 模式切换，默认可按业务优先级落到视频，或保留用户上次选择。
2. 将 `V0AiChat` 的 textarea、附件预览、参数浮层能力拆成可复用 composer，不再把所有能力绑定在聊天消息结构上。
3. 图片模式先接入「产品图生成建议/提示词增强」也可以，但 UI 状态要预留真实图片任务字段：模型、比例、数量、分辨率、风格、参考图。
4. 视频模式对接现有 `/automation/assets` 和 `/automation/tasks`，把现有 `selectedRatio`、`selectedResolution`、`selectedVoiceId` 扩展为 Raphael 式紧凑参数栏。
5. 模型来源统一走模型与接口中心，但前端只展示业务名称和能力标签，不暴露 Base URL、API Key、供应商敏感信息。
6. 删除首屏营销表达，保留企业工作台语气：标题建议为「今天要生成什么业务素材？」或按模块显示「AI 视频生成」/「AI 产品图生成」。
7. 第一阶段不要做复杂图片/视频后端统一抽象；先统一 UI 和状态，再分别接入图片任务 API 与视频任务 API，避免把现有自动化剪辑链路搅在一起。

