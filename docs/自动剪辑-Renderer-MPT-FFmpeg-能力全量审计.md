# 自动剪辑 Renderer / MoneyPrinterTurbo / FFmpeg 能力全量审计

审计日期：2026-08-28

审计范围：

- 知衡智企自动化剪辑任务封装：`src/lib/workspaces/moneyprinter-engine.ts`
- 知衡智企自动化剪辑业务层：`src/lib/workspaces/automation-editing.ts`
- MoneyPrinterTurbo CLI：`engines/moneyprinterturbo/cli.py`
- MoneyPrinterTurbo 任务链：`engines/moneyprinterturbo/app/services/task.py`
- MoneyPrinterTurbo 视频渲染：`engines/moneyprinterturbo/app/services/video.py`
- MoneyPrinterTurbo schema：`engines/moneyprinterturbo/app/models/schema.py`
- 当前系统 FFmpeg：`ffmpeg version 7.1-essentials_build-www.gyan.dev`

本报告只做能力审计，不修改渲染代码、不升级依赖、不改变 Agent / Timeline / Workspace / FFmpeg。

---

## 1. 当前真实渲染链

当前知衡智企自动化剪辑真实链路是：

```text
自动化剪辑页面 / Agent 草稿
  ↓
automation_video_tasks
  ↓
src/lib/workspaces/moneyprinter-engine.ts
  ↓
按需预裁剪素材片段（FFmpeg）
  ↓
Voice Service 生成配音音频（当前生产链路为 Doubao WebSocket TTS）
  ↓
写入预生成 subtitle.srt
  ↓
调用 engines/moneyprinterturbo/cli.py
  ↓
MoneyPrinterTurbo task.py
  ↓
video.py / MoviePy / FFmpeg
  ↓
输出 MP4
```

关键事实：

- 知衡智企不是直接把全部参数丢给 MoneyPrinterTurbo 原版流程。
- `src/lib/workspaces/moneyprinter-engine.ts` 负责把平台任务转换成 MPT CLI 参数。
- 如果任务需要知衡智企 Voice Service，当前流程会先生成本地音频，再向 MPT 传入 `--custom-audio-file`。
- MPT 在收到 `custom_audio_file` 时会跳过自身 TTS，后续只负责字幕和视频合成。
- 秒级素材裁剪目前主要由知衡智企封装层先用 FFmpeg 生成中间片段，再交给 MPT 串联与包装。

关键代码位置：

| 环节 | 文件 / 函数 | 说明 |
|---|---|---|
| CLI 参数构造 | `src/lib/workspaces/moneyprinter-engine.ts:273` `buildCliArgs()` | 把任务配置映射为 MPT CLI 参数 |
| 画幅 scale/crop | `src/lib/workspaces/moneyprinter-engine.ts:123` `videoScaleFilter()` | 9:16 / 16:9 / 1:1 的预裁剪缩放 |
| 转场映射 | `src/lib/workspaces/moneyprinter-engine.ts:140` `mapTransition()` | 中文/产品值映射到 MPT transition |
| 秒级预裁剪 | `src/lib/workspaces/moneyprinter-engine.ts:445` `prepareExecutionTimelineMaterials()` | 使用 FFmpeg `-ss` / `-t` 裁剪素材 |
| 预生成字幕 | `src/lib/workspaces/moneyprinter-engine.ts:573` `writePrebuiltSubtitle()` | 根据任务脚本写入 SRT |
| 任务执行 | `src/lib/workspaces/moneyprinter-engine.ts:789` `runMoneyPrinterTask()` | 组织音频、字幕、MPT 调用 |
| MPT CLI | `engines/moneyprinterturbo/cli.py` | 接收视频、音频、字幕、BGM、转场参数 |
| MPT 跳过 TTS | `engines/moneyprinterturbo/app/services/task.py:439` `generate_audio()` | `custom_audio_file` 存在时跳过 MPT 内置 TTS |
| MPT 字幕生成 | `engines/moneyprinterturbo/app/services/task.py:508` `generate_subtitle()` | 支持预生成字幕或 Whisper |
| MPT 视频生成 | `engines/moneyprinterturbo/app/services/video.py:971` `generate_video()` | MoviePy + FFmpeg 合成最终视频 |
| 视频串联优化 | `engines/moneyprinterturbo/app/services/video.py:332` `concat_video_clips_with_ffmpeg()` | FFmpeg concat demuxer 串联中间片段 |

---

## 2. 能力分级口径

本报告使用两套分级：

能力状态：

| 等级 | 含义 |
|---|---|
| A | 当前已经完整支持，可直接被知衡智企产品链路使用 |
| B | 当前部分支持，能跑通核心场景，但参数、体验或稳定性不完整 |
| C | FFmpeg / MPT 底层具备能力，但知衡智企当前没有封装成产品能力 |
| D | 当前链路完全没有，或需要另建能力 |

产品投入等级：

| 等级 | 含义 |
|---|---|
| L1 | 已经可直接用于产品 |
| L2 | 已有底层能力，只缺少少量封装 |
| L3 | 需要中等开发 |
| L4 | 需要复杂开发 / 大量测试 |
| L5 | 当前不建议做 |

---

## 3. MoneyPrinterTurbo 当前完整能力矩阵

### 3.1 输入与素材

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| 本地视频素材输入 | A | L1 | `moneyprinter-engine.ts:398`，`cli.py --video-materials` | 可传本地素材列表 |
| 多素材输入 | A | L1 | `moneyprinter-engine.ts:398` | 逗号分隔多个素材路径 |
| 在线素材搜索 | B | L2 | `task.py:570`，`material.py` | MPT 支持 Pexels 等来源，但知衡智企企业素材链路优先本地 |
| 按脚本文案匹配素材 | B | L2 | `--match-materials-to-script`，`task.py:626` | 有开关，但匹配质量依赖上层素材选择 |
| 秒级 sourceStart / sourceEnd | B | L2 | `moneyprinter-engine.ts:445` | 知衡智企预裁剪支持；MPT 原生不是完整 Timeline |
| 素材去重 / 避免循环 | B | L2 | 上层选材与预裁剪 | 可通过上层传足片段控制；MPT 自身仍有补齐逻辑 |
| 素材分类检索 | B | L2 | `src/lib/agent/video-asset-index.ts` | 已有索引能力，但不是 Renderer 本身能力 |
| 图片输入 | B | L2 | `cli.py` / MPT schema | MPT 参数允许部分图片素材，当前自动剪辑产品主链偏视频 |
| 多轨素材 | D | L4 | 无 | 当前是单主轨串联，不是多轨时间线 |

### 3.2 剪辑与画面

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| 顺序拼接 | A | L1 | `VideoConcatMode.sequential`，`--video-concat-mode` | 已封装 |
| 随机拼接 | A | L1 | `VideoConcatMode.random` | 已封装 |
| 片段最大时长 | A | L1 | `--video-clip-duration` | 支持统一最大片段时长 |
| 播放速度 | B | L2 | `--video-clip-speed`，`video.py` | 支持全局片段速度，不支持逐片段变速 |
| 9:16 输出 | A | L1 | `VideoAspect.portrait`，`videoScaleFilter()` | 1080x1920 |
| 16:9 输出 | A | L1 | `VideoAspect.landscape` | 1920x1080 |
| 1:1 输出 | A | L1 | `VideoAspect.square` | 1080x1080 |
| 自动 scale/crop | A | L1 | `videoScaleFilter()`，`video.py` | 支持填满画幅 |
| 逐片段裁切框 | D | L3 | 无 | 无可控 crop box / safe area |
| 逐片段位置 / 缩放关键帧 | D | L4 | 无 | FFmpeg 支持，当前未封装 |
| 画中画 | C | L3 | FFmpeg `overlay` 可用 | 当前产品未封装 |
| Logo / 水印 | C | L2 | FFmpeg `overlay` 可用 | 当前产品未封装 |
| 标题条 / CTA 贴片 | C | L3 | FFmpeg `drawtext` / overlay 可用 | 当前产品未封装 |
| 调色 / LUT | C | L3 | FFmpeg `eq` / `hue` / `lut3d` 可用 | 当前产品未封装 |
| 去噪 / 锐化 / 模糊 | C | L3 | FFmpeg `gblur` / `unsharp` 等可用 | 当前产品未封装 |
| 绿幕 / 抠像 | C | L4 | FFmpeg `chromakey` 可用 | 不适合作为当前优先项 |

### 3.3 转场

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| 无转场 | A | L1 | `VideoTransitionMode.none` | 已支持 |
| 随机转场 | A | L1 | `VideoTransitionMode.shuffle` | 已支持 |
| 淡入 | A | L1 | `video_effects.py:7` | 已支持 |
| 淡出 | A | L1 | `video_effects.py:12` | 已支持 |
| 滑入 | A | L1 | `video_effects.py:17` | 已支持 |
| 滑出 | A | L1 | `video_effects.py:46` | 已支持 |
| 放大 | B | L2 | `video_effects.py:119`，`schema.py` | MPT schema 有，知衡智企 UI/CLI 映射不完整 |
| 缩小 | B | L2 | `video_effects.py:134`，`schema.py` | 同上 |
| 逐段不同转场 | D | L3 | 无 | 当前是任务级统一转场 |
| 转场时长控制 | D | L3 | 无 | 当前未作为产品参数暴露 |
| FFmpeg xfade 高级转场 | C | L3 | FFmpeg `xfade` 可用 | 未封装 |

当前真实转场列表：

- `none`
- `shuffle`
- `fade-in`
- `fade-out`
- `slide-in`
- `slide-out`
- MPT schema 中存在 `zoom-in` / `zoom-out`，但知衡智企当前映射和 UI 不应视为完整产品能力。

### 3.4 字幕

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| 字幕开关 | A | L1 | `--subtitle-enabled` | 已支持 |
| 预生成 SRT | A | L1 | `moneyprinter-engine.ts:573`，`task.py:508` | 知衡智企可写入 SRT |
| Whisper 自动转字幕 | B | L2 | `subtitle.py` | MPT 保留，但知衡智企 custom audio 场景优先预生成 |
| 字体选择 | A | L1 | `--font-name`，`video.py` | 使用 `resource/fonts` |
| 字幕位置 | A | L1 | `--subtitle-position` | top / center / bottom / custom |
| 自定义位置 | B | L2 | `--custom-position` | 已有参数，产品体验一般 |
| 字幕颜色 | A | L1 | `--text-fore-color` | 已支持 |
| 描边颜色 | A | L1 | `--stroke-color` | 已支持 |
| 描边粗细 | A | L1 | `--stroke-width` | 已支持 |
| 字幕背景 | A | L1 | `--subtitle-background-enabled` | 已支持 |
| 圆角背景 | B | L2 | `--rounded-subtitle-background` | 有参数，视觉能力有限 |
| 关键词高亮 | D | L3 | 无 | 当前没有逐词样式 |
| 卡拉 OK / 逐字高亮 | D | L4 | 无 | 需要更细时间戳 |
| ASS 高级字幕 | C | L3 | FFmpeg `ass` / `subtitles` 可用 | 当前未封装 |
| 动态字幕动画 | D | L4 | 无 | 需要 ASS 或独立字幕渲染层 |

当前字幕能力结论：

- 产品级基础字幕已经可用。
- 制造企业短视频需要的“品牌字幕模板、关键词强调、标题字幕、口播字幕分层”还没有形成。

### 3.5 音频

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| 自定义配音音频 | A | L1 | `--custom-audio-file`，`task.py:439` | 知衡智企主链路使用 |
| 跳过 MPT 内置 TTS | A | L1 | `generate_audio()` | custom audio 存在时跳过 |
| 无配音 | A | L1 | `voice-name no-voice` | 已支持 |
| 配音音量 | A | L1 | `--voice-volume` | 已支持 |
| 配音语速 | B | L2 | `--voice-rate` | 取决于上游 TTS 和 MPT 处理 |
| 随机 BGM | A | L1 | `--bgm-type random` | 已支持 |
| 无 BGM | A | L1 | `--bgm-type none` | 已支持 |
| 自定义 BGM | A | L1 | `--bgm-file` | 已支持 |
| BGM 音量 | A | L1 | `--bgm-volume` | 已支持 |
| AI 音乐 / Sonilo | B | L3 | `--sonilo-bgm-prompt` | 存在第三方能力，不应作为当前企业默认能力 |
| 响度标准化 | C | L2 | FFmpeg `loudnorm` 可用 | 未封装 |
| 自动闪避 / ducking | C | L3 | FFmpeg `sidechaincompress` 可用 | 未封装 |
| 音频淡入淡出 | C | L2 | FFmpeg `afade` 可用 | 未封装 |
| 降噪 / 压缩 / 限幅 | C | L3 | FFmpeg `afftdn` / `acompressor` / `alimiter` 可用 | 未封装 |
| 多轨混音 | D | L4 | 无 | 当前不是多轨音频工程 |

### 3.6 Overlay / 包装

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| 字幕作为文字 Overlay | B | L1 | `SubtitlesClip` / `video.py` | 基础字幕可视为一种 Overlay |
| Logo | C | L2 | FFmpeg `overlay` 可用 | 产品未封装 |
| 水印 | C | L2 | FFmpeg `overlay` 可用 | 产品未封装 |
| 角标 | C | L3 | FFmpeg `overlay` / `drawtext` 可用 | 产品未封装 |
| 标题卡 | C | L3 | FFmpeg / MoviePy 可做 | 产品未封装 |
| 片尾 CTA | C | L3 | FFmpeg / MoviePy 可做 | 产品未封装 |
| 多层图文包装 | D | L4 | 无 | 需要 Timeline 图层系统 |

### 3.7 输出

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| MP4 输出 | A | L1 | `video.py:1254` | 当前主输出 |
| H.264 / libx264 | A | L1 | `video.py:82` | 默认编码 |
| 硬件编码候选 | B | L2 | `h264_nvenc` / `h264_amf` / `h264_qsv` | 配置允许，失败回退 libx264 |
| AAC 音频 | A | L1 | `video.py:70` | 192k |
| 固定 FPS | A | L1 | `video.py:71` | 30fps |
| 多分辨率 | B | L2 | 9:16 / 16:9 / 1:1 | 固定三种 |
| MOV / WebM / GIF | C | L3 | FFmpeg 支持 | 产品未封装 |
| 封面图输出 | D | L3 | 无产品封装 | 可由 FFmpeg 截帧实现 |
| 预览低清版 | D | L3 | 无 | 可作为性能优化项 |

### 3.8 性能与并发

| 能力 | 当前状态 | 产品等级 | 代码位置 | 说明 |
|---|---:|---:|---|---|
| CLI 线程数 | A | L1 | `--n-threads`，`moneyprinter-engine.ts:306` | 知衡智企限制 1-16 |
| MPT API 并发配置 | B | L2 | `config.toml max_concurrent_tasks = 5` | MPT API 侧存在，知衡智企当前主链主要走 CLI/worker |
| 队列容量配置 | B | L2 | `config.toml max_queued_tasks = 100` | MPT API 侧存在 |
| 硬件编码探测与回退 | B | L2 | `video.py:170`、`:222`、`:292` | 有回退逻辑 |
| 断点续跑 | D | L4 | 无完整产品能力 | 失败后需要人工重试 |
| 任务取消 | B | L3 | MPT 有部分 task state 能力 | 知衡智企 UI/执行链未完整产品化 |
| 进度日志 | B | L2 | `moneyprinter-engine.ts` logStream | 有日志，但不是完整阶段进度系统 |

---

## 4. 当前 FFmpeg 环境真实能力

当前检测到：

- FFmpeg：`7.1-essentials_build-www.gyan.dev`
- 核心库：`libavcodec 61.19.100`，`libavfilter 10.4.100`
- 已编译能力包含：`libass`、`libfreetype`、`libfribidi`、`libharfbuzz`、`libx264`、`libx265`、`nvenc`、`amf`、`qsv`、`vpx`、`webp`、`mp3lame`、`opus`、`rubberband` 等。

确认存在的关键滤镜：

| 类型 | 可用能力 |
|---|---|
| 视频拼接 | `concat` |
| 转场 | `xfade` |
| 缩放裁切 | `scale`、`crop`、`zscale` |
| 硬件缩放 | `scale_cuda`、`scale_qsv`、`scale_vaapi` |
| 字幕文字 | `drawtext`、`subtitles`、`ass` |
| 叠加 | `overlay`、`overlay_cuda`、`overlay_qsv` |
| 画面调整 | `eq`、`hue`、`huesaturation`、`lut3d` |
| 模糊锐化 | `boxblur`、`gblur`、`unsharp` |
| 镜像旋转 | `hflip`、`vflip`、`rotate` |
| 绿幕 | `chromakey`、`chromakey_cuda` |
| 音量混音 | `volume`、`amix` |
| 响度处理 | `loudnorm`、`volumedetect` |
| 音频动态 | `sidechaincompress`、`acompressor`、`alimiter` |
| 音频淡入淡出 | `afade` |
| 音频速度 | `atempo` |
| 音频降噪均衡 | `afftdn`、`equalizer`、`firequalizer` |

确认存在的关键编码器：

| 类型 | 编码器 |
|---|---|
| H.264 | `libx264`、`h264_nvenc`、`h264_amf`、`h264_qsv` |
| H.265 | `libx265`、`hevc_nvenc`、`hevc_amf`、`hevc_qsv` |
| Web | `libvpx`、`libvpx-vp9`、`libwebp`、`libwebp_anim` |
| 图片/动图 | `png`、`mjpeg`、`gif`、`apng` |
| 音频 | `aac`、`libmp3lame` |

结论：

- FFmpeg 底层能力很强，足够支撑制造企业短视频剪辑、字幕包装、音频处理、封面生成、Logo/水印、调色和基础动态效果。
- 当前产品封装远少于 FFmpeg 实际能力。不能把“FFmpeg 支持”直接等同于“知衡智企已支持”。

---

## 5. 已支持 / 部分支持 / 未封装 / 不支持总表

| 能力域 | A 完整支持 | B 部分支持 | C 底层支持未封装 | D 当前没有 |
|---|---|---|---|---|
| 素材输入 | 本地多视频、上传素材 | 在线素材、图片素材、脚本匹配 | 更复杂资产检索 | 多轨素材 |
| 剪辑 | 顺序/随机拼接、统一片段时长 | 秒级预裁剪、统一变速 | keyframe、精确 crop、滤镜 | 完整 NLE Timeline |
| 转场 | none、shuffle、fade、slide | zoom schema 残留 | xfade 转场族 | 逐段转场编排 |
| 字幕 | SRT、字体、颜色、位置、描边、背景 | Whisper、圆角背景 | ASS、关键词高亮 | 逐字动态字幕 |
| 音频 | custom audio、BGM、音量 | 语速、第三方音乐 | ducking、loudnorm、afade、降噪 | 多轨混音工作站 |
| Overlay | 基础字幕 | - | Logo、水印、标题、角标 | 完整包装模板系统 |
| 输出 | MP4、H264、AAC、三种画幅 | 硬件编码回退 | WebM/GIF/封面 | 多版本批量导出 |
| 性能 | 线程数 | 队列、硬编探测 | 低清预览 | 断点续跑 |

---

## 6. 当前 10 个最大能力缺口

1. 缺少真正的 Unified Timeline。当前只是在上层预裁剪，再交给 MPT 串联，不是完整可编辑时间线。
2. 缺少逐片段转场配置。现在是任务级转场，无法给每个镜头指定转场、时长和重叠。
3. 缺少品牌 Overlay。Logo、水印、角标、标题条、片尾 CTA 都没有产品化。
4. 字幕能力偏基础。没有 ASS 模板、关键词高亮、逐字高亮、品牌字幕样式。
5. 音频混音能力不足。没有响度标准化、旁白 ducking、BGM 淡入淡出、限制器。
6. 缺少逐片段画面控制。没有镜头级 crop safe area、位置、缩放、平移、旋转、变速。
7. 缺少封面生成。当前字幕与包装里有封面概念，但没有真实输出链路。
8. 缺少低清预览 / 快速预渲染。每次完整合成成本较高。
9. 任务执行状态还不够产品化。日志存在，但进度、失败原因、重试、取消、恢复需要增强。
10. 缺少模板化渲染配置。制造企业短视频常用的“科普型 / 案例型 / 工厂展示型”还没有固化成渲染模板。

---

## 7. 最值得优先补的 5 项

1. Unified Timeline Adapter
   - 价值：把 Agent 生成的镜头计划稳定落到可执行时间线。
   - 投入：L3。
   - 建议：先不做可视化剪辑器，只定义稳定 JSON schema，并适配现有 MPT / FFmpeg。

2. ASS 字幕模板与关键词高亮
   - 价值：最直接提升成片质感。
   - 投入：L2-L3。
   - 建议：基于 FFmpeg `ass`，先做 3 套制造企业常用字幕模板。

3. 音频 loudnorm + BGM ducking
   - 价值：提升可听性和专业感。
   - 投入：L2。
   - 建议：Voice + BGM 混音阶段引入 `loudnorm`、`sidechaincompress`、`afade`。

4. 品牌包装层
   - 价值：企业宣传视频必须有 Logo、标题、片尾行动引导。
   - 投入：L2-L3。
   - 建议：先支持 Logo、水印、标题条、片尾卡四类 Overlay。

5. 逐片段视觉控制
   - 价值：解决横屏素材做竖屏视频时主体被裁掉的问题。
   - 投入：L3。
   - 建议：Timeline 增加 `fitMode`、`cropSafety`、`focus`、`position`、`scale`。

---

## 8. 当前不值得优先开发的能力

| 能力 | 原因 |
|---|---|
| 复杂粒子特效 | 制造企业宣传短视频不是特效片，投入产出低 |
| 完整剪辑软件式轨道 UI | 当前目标是 AI 自动生产，人只做必要干预 |
| 绿幕抠像 | FFmpeg 支持，但不是当前素材形态的核心需求 |
| 复杂 3D 动画 | 超出 MPT/FFmpeg 轻量合成定位 |
| WebM/GIF 批量输出 | 当前核心交付是抖音/视频号/宣传 MP4 |
| 高级调色工作台 | 先做预设 LUT / 简单色彩增强即可 |
| 多人协同逐帧审片 | 后续审核中心可以做，但不是 Renderer 第一优先级 |

---

## 9. 制造企业短视频 Renderer 最小能力集

建议 V1 真正产品化的 Renderer 最小能力集：

### 9.1 镜头层

- 多素材片段输入
- 每段 `sourceStart` / `sourceEnd`
- 每段 1.5-4 秒控制
- 每段画幅适配：cover / contain / blur-background
- 每段主体安全裁切提示
- 不重复循环同一镜头

### 9.2 音频层

- 知衡智企 Voice Service 输出旁白音频
- `custom-audio-file` 进入 MPT / FFmpeg
- BGM 选择
- BGM 音量
- 自动 loudnorm
- 旁白优先 ducking

### 9.3 字幕层

- SRT / ASS 字幕
- 品牌字体
- 字幕颜色 / 描边 / 背景
- 关键词高亮
- 标题字幕

### 9.4 包装层

- 企业 Logo
- 视频标题
- 片尾品牌卡
- 封面图
- 标签 / 简介文案输出

### 9.5 输出层

- 1080x1920 MP4
- H.264 + AAC
- 固定 30fps
- 任务日志
- 输出路径可追踪
- 失败原因可读

---

## 10. MPT 是否继续保留

建议：短期继续保留 MPT，长期逐步弱化 MPT。

### 短期保留原因

- 当前 MPT 已经能稳定完成 MP4 合成。
- 已有素材串联、字幕、BGM、编码回退等基础能力。
- 知衡智企已经通过 `custom-audio-file` 绕开 MPT TTS，避免语音能力受 MPT 限制。
- 继续保留可降低短期交付风险。

### 长期弱化原因

- MPT 不是完整企业级 Timeline Renderer。
- 高级字幕、Overlay、逐片段转场、音频 ducking、封面、模板化包装，都会逐渐突破 MPT 当前封装边界。
- 如果继续在 MPT 内部堆定制，维护成本会越来越高。

### 推荐路线

```text
阶段 1：保留 MPT CLI，知衡智企负责素材选择、TTS、字幕、任务管理
阶段 2：建立 Unified Timeline，先编译到 MPT 可接受的参数和预裁剪素材
阶段 3：新增 Zhiheng FFmpeg Renderer Adapter，处理字幕、Overlay、音频混音等高级能力
阶段 4：MPT 退化为兼容后端，核心企业视频由 Zhiheng Renderer 直接输出
```

结论：

- 当前不要大规模魔改 MPT。
- 应该把新的能力沉淀在知衡智企自己的 Renderer Adapter / Timeline 层。

---

## 11. Unified Timeline 未来字段建议

建议新增独立 Timeline Schema，不直接复用 MPT 参数。

```json
{
  "version": "1.0",
  "duration": 32.5,
  "canvas": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "background": "#000000"
  },
  "clips": [
    {
      "id": "clip-001",
      "sourcePath": "relative/or/absolute/path.mp4",
      "sourceStart": 3.2,
      "sourceEnd": 6.8,
      "timelineStart": 0,
      "timelineEnd": 3.6,
      "fitMode": "cover",
      "crop": {
        "x": 0.5,
        "y": 0.5,
        "width": 1,
        "height": 1
      },
      "motion": {
        "type": "slow_zoom_in",
        "fromScale": 1,
        "toScale": 1.08
      },
      "transitionIn": {
        "type": "none",
        "duration": 0
      },
      "transitionOut": {
        "type": "fade",
        "duration": 0.25
      },
      "scriptText": "对应这一段画面的口播内容",
      "tags": ["无菌灌装", "生产线"]
    }
  ],
  "audio": {
    "voice": {
      "path": "audio/voice.mp3",
      "volume": 1,
      "loudnessNormalize": true
    },
    "bgm": {
      "path": "audio/bgm.mp3",
      "volume": 0.18,
      "ducking": true,
      "fadeIn": 1,
      "fadeOut": 1
    }
  },
  "subtitles": {
    "source": "subtitle.srt",
    "format": "ass",
    "preset": "enterprise_clean",
    "font": "企业默认字体",
    "fontSize": 46,
    "color": "#FFFFFF",
    "strokeColor": "#000000",
    "strokeWidth": 2,
    "keywordHighlights": ["无菌灌装", "微生物", "稳定性"]
  },
  "overlays": [
    {
      "type": "logo",
      "path": "brand/logo.png",
      "position": "top-right",
      "opacity": 0.9
    }
  ],
  "output": {
    "format": "mp4",
    "codec": "libx264",
    "audioCodec": "aac",
    "bitrate": "auto",
    "path": "output/final.mp4"
  }
}
```

字段分层建议：

| 层级 | 字段 |
|---|---|
| Canvas | width、height、fps、background |
| Clip | sourcePath、sourceStart、sourceEnd、timelineStart、timelineEnd、fitMode、crop、motion |
| Transition | transitionIn、transitionOut、duration、easing |
| Audio | voice、bgm、volume、ducking、loudnessNormalize |
| Subtitle | source、format、preset、font、color、stroke、highlight |
| Overlay | logo、watermark、title、endCard、position、opacity |
| Output | format、codec、resolution、fps、path |

---

## 12. 最终能力判断

当前知衡智企自动化剪辑 Renderer 已经具备：

- 用真实素材生成 9:16 MP4 的基础能力。
- 使用知衡智企 Voice Service 配音，并通过 `custom-audio-file` 交给 MPT 合成。
- 基础字幕、BGM、拼接、画幅转换、编码输出能力。
- 通过 FFmpeg 预裁剪支持秒级素材段落。

当前还不具备：

- 完整可编辑时间线。
- 企业级字幕模板和关键词动态强调。
- 品牌包装层。
- 专业音频混音链。
- 精细画面控制和逐镜头转场。

综合建议：

- MPT 当前可作为“能出片的施工队”继续保留。
- FFmpeg 是底层能力充足的“工具箱”。
- 知衡智企下一阶段应该建设自己的 `Unified Timeline + Renderer Adapter`，不要把新能力继续散落在页面、Agent 和 MPT 参数映射里。
