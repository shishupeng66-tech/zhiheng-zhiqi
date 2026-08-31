# Zhiheng Renderer Phase 2B —— 最终合成执行报告

> 日期：2026-08-29
> 阶段：Phase 2B（最终合成层）
> 状态：**代码实现完成，正式测试因缺少 ffprobe 未运行**

---

## 1. 新增/修改文件

### 新增文件

| 文件 | 说明 |
|---|---|
| `src/engines/zhiheng-renderer/ass-generator.ts` | ASS 字幕生成器：统一字幕/关键词高亮/标题的 ASS 输出 |
| `src/engines/zhiheng-renderer/compose.ts` | 最终合成：concat + ASS 烧录 + voice 混音 + H.264/AAC 编码 |
| `scripts/test-zhiheng-renderer-phase2b.ts` | Phase 2B 测试脚本：固定 Timeline（5 segment + 5 字幕 + 关键词 + 标题 + voice） |
| `docs/Zhiheng-Renderer-Phase2B-最终合成执行报告.md` | 本报告 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/engines/zhiheng-renderer/renderer.ts` | 1. 导入 AssGenerator/StyleRegistry/composeFinal；2. 版本号更新为 0.1.0-phase2b；3. capabilities 更新（concat/ASS/关键词/标题/voice 全部 true）；4. validate 移除 subtitle/title/voice 的不支持检查，保留 overlay/bgm/sfx 检查；5. render 方法在 preprocess 后加入 ASS 生成 + voice 解析 + compose 阶段；6. 输出从 segmentsDir 改为 final.mp4 |

### 未修改

- Timeline V1 schema（types.ts）
- Style Registry（style-registry.ts，仍为 provisional）
- Validator（validator.ts）
- MPT 相关代码
- Agent / Voice Service

---

## 2. ASS Generator 结构

### 核心类：`AssGenerator`

```
AssGenerator(styleRegistry, options)
  ├─ generate(subtitles, titles) → AssGenerateResult
  └─ generateToFile(subtitles, titles, outputPath) → AssGenerateResult
```

### 输出结构

完整的 .ass 文件包含三个部分：

1. **[Script Info]**：ScriptType v4.00+、PlayResX/PlayResY（基于 outputProfile）、WrapStyle 0、ScaledBorderAndShadow yes、YCbCr Matrix TV.709
2. **[V4+ Styles]**：只输出 Timeline 用到的样式（subtitle.default、subtitle.keyword、title.hook、title.emphasis 等），样式参数从 Style Registry 获取
3. **[Events]**：Dialogue 行，包含字幕和标题

### 设计原则

- Timeline 只提供 styleId，具体视觉参数由 Style Registry 决定
- Agent / Timeline 不输出 ASS 标签，所有标签由 Generator 生成
- ASS 特殊字符由 Generator 转义（`{}`→全角、`\n`→`\N`）
- 所有文字元素统一走 ASS，不使用 drawtext

---

## 3. 字幕实现

### 输入

`SubtitleSegment`：
- `id`：唯一标识
- `start` / `duration`：显示时间（秒）
- `text`：字幕文本
- `styleId`：样式 ID（如 `subtitle.default`）
- `highlights`：关键词高亮列表

### 处理流程

1. 从 Style Registry 获取样式定义
2. 校验时间范围（不超过视频总时长）
3. 转义 ASS 特殊字符
4. 应用关键词高亮（见第 4 节）
5. 格式化为 ASS Dialogue 行：
   ```
   Dialogue: 0,0:00:00.00,0:00:02.40,subtitle_default,sub_001,0,0,0,,欢迎来到浩明饮品
   ```
6. 字幕默认 Layer 0

---

## 4. 关键词高亮实现

### 核心方法：`applyKeywordHighlights(text, highlights, keywordColor)`

### 实现方式

使用 ASS 内联颜色标签实现局部高亮：

```
{\c&H0000FFFF&}OEM{\c}
```

- `{\c&H...&}`：设置后续文字颜色（覆盖样式默认颜色）
- `{\c}`：恢复样式默认颜色
- 关键词颜色从 Style Registry 的 `subtitle.keyword` 样式获取（当前为黄色 `&H0000FFFF&`）

### 支持的关键词类型

- 单关键词：`"OEM"`
- 多关键词：`["OEM", "ODM"]`
- 中文关键词：`"二十年"`、`"品质保证"`
- 英文关键词：`"OEM"`、`"ODM"`

### 定位策略

1. 如果 `highlight.startChar` 和 `highlight.endChar` 都指定了，只高亮该精确位置的关键词
2. 否则，高亮文本中所有出现的关键词（全局替换）
3. 避免重复高亮：检查关键词前面是否已有 `{\c` 标签未闭合

### 测试覆盖

测试 Timeline 包含：
- sub_002：`"我们支持 OEM 和 ODM 定制"` → 高亮 OEM、ODM（多英文关键词）
- sub_003：`"专注饮品制造二十年"` → 高亮 二十年（中文关键词）
- sub_004：`"品质保证 交付及时"` → 高亮 品质保证（中文关键词）

---

## 5. 标题实现

### 输入

`TitleSegment`：
- `id`：唯一标识
- `start` / `duration`：显示时间
- `text`：标题文本
- `styleId`：样式 ID（`title.hook` / `title.subhook` / `title.emphasis`）
- `layer`：ASS Layer 层级（默认 2，显示在字幕之上）

### 处理流程

1. 从 Style Registry 获取样式定义
2. 校验时间范围
3. 转义 ASS 特殊字符
4. 格式化为 ASS Dialogue 行，使用指定的 layer
5. 标题与字幕共用同一个 ASS 文件，通过 Layer 区分显示层级

### V0.1 限制

- 只做静态显示，不做动画
- 通过 start + duration 控制显示时间
- 允许标题和字幕同时存在
- 不支持动态标题、字幕动画、fade 转场

### 测试覆盖

- title_hook_001：`"浩明饮品"`，0-3s，title.hook，Layer 2
- title_emphasis_001：`"OEM/ODM 定制"`，6-9s，title.emphasis，Layer 2

---

## 6. Concat 实现

### 方式：concat demuxer

因为 Phase 2A 已经将所有 segment 统一为：
- Codec：FFV1
- Pixel Format：yuv420p10le
- Resolution：1080×1920
- FPS：30（来自 outputProfile）
- Color Space：BT.709 SDR

所以使用 **concat demuxer**（`-f concat`）是最快、最稳定的方式，不需要重新编码。

### 流程

1. 生成 concat-list.txt：
   ```
   file 'D:/.../segments/segment-01.mkv'
   file 'D:/.../segments/segment-02.mkv'
   ...
   ```
2. ffmpeg 命令：`-f concat -safe 0 -i concat-list.txt`
3. 路径用正斜杠，单引号包裹（Windows 兼容）

### 为什么不用 filter_complex concat

- concat demuxer 不需要重新编码，速度更快
- 所有 segment 已完全统一，concat demuxer 可以直接拼接
- 更简单可靠，调试更容易

---

## 7. Voice Mix 实现

### 设计原则

- Renderer 不调用 TTS，voice asset 必须在 Renderer 启动前已生成完成
- V0.1 只支持一个 voice track
- 不支持 BGM、SFX、source audio

### 处理流程

1. 从 Timeline.voiceTrack 获取第一个 voice segment
2. 通过 Asset Resolver 解析 voice asset 路径
3. 如果解析失败，渲染失败（不静默跳过）
4. 作为 ffmpeg 的第二个输入：`-i voice.m4a`
5. 音量控制：如果 `volume != 1.0`，使用 `volume=` 音频滤镜
6. 编码为 AAC 192k 48000Hz stereo

### 时长控制

- 使用 `-t videoDuration` 限制最终输出时长，避免 voice 比 video 长导致输出变长
- 不使用 `-shortest`（可能导致意外截断）

### 测试 voice 文件

- 路径：`D:\知衡智企\tmp\test-assets\test-voice-15s.m4a`
- 来源：从样片004的 HLG 素材提取的 12.65 秒音频
- 格式：AAC LC 48000Hz stereo 192kbps
- **注意：这不是 1.1× 语速的 Voice Service 产物**，只是测试音频。正式使用时应由 Voice Service 上游生成 1.1× 语速的 voice asset。

---

## 8. Final Composition 实现

### 完整 ffmpeg 命令结构

```
ffmpeg
  -f concat -safe 0 -i concat-list.txt    # 视频输入（拼接后的 FFV1 segments）
  -i voice.m4a                               # 音频输入（voice asset）
  -vf "ass='subtitles.ass',format=yuv420p" # ASS 烧录 + 像素格式转换
  -af "volume=1.0"                           # 音量控制（如果需要）
  -c:v libx264 -preset medium -crf 18       # H.264 编码
  -pix_fmt yuv420p                            # 输出像素格式
  -colorspace bt709 -color_primaries bt709  # 显式 BT.709 metadata
  -color_trc bt709 -color_range tv
  -g 60 -r 30                                 # 关键帧间隔 + 帧率
  -c:a aac -b:a 192k -ar 48000 -ac 2        # AAC 音频编码
  -t 12.000                                    # 时长限制
  -f mp4 -movflags +faststart -y final.mp4   # MP4 输出 + faststart
```

### 关键设计决策

1. **ASS 烧录用 `ass` 滤镜**（不是 `subtitles` 滤镜）：ass 滤镜直接加载 .ass 文件，支持完整 ASS 特性
2. **Windows 路径处理**：ass 滤镜路径中的反斜杠转正斜杠，冒号转义为 `\:`，整个路径用单引号包裹
3. **显式 BT.709 metadata**：避免播放器色彩空间误判
4. **faststart**：`-movflags +faststart` 使 moov atom 前置，便于网络播放
5. **CRF 18**：高质量 H.264 编码（视觉无损级别）
6. **不使用 -shortest**：明确用 -t 控制时长，避免意外截断

---

## 9. Expected vs Actual Duration

### 时长规则

- **expectedDuration**：`sum(videoTrack.duration)` = 12.0s
- **finalDuration**：ffprobe 探测的最终文件时长
- **durationDiff**：`|finalDuration - expectedDuration|`
- 允许非常小的 frame rounding 误差（< 0.1s）

### 校验机制

compose 完成后，用 `ffmpeg -i final.mp4` 探测 Duration，与 expectedDuration 对比。如果差异 > 0.1s，产生 warning。

### 当前状态

因缺少 ffprobe，正式测试未运行，无法提供实际时长数据。代码已实现时长校验逻辑，安装 ffprobe 后可验证。

---

## 10. Output Codec / FPS / Color

### 最终输出规格

| 项目 | 值 |
|---|---|
| 视频编码 | H.264 (libx264) |
| 视频像素格式 | yuv420p |
| 分辨率 | 1080×1920（来自 outputProfile） |
| 帧率 | 30fps（来自 outputProfile，不默认 60） |
| 色彩空间 | BT.709 SDR（显式 metadata） |
| 音频编码 | AAC LC |
| 音频比特率 | 192kbps |
| 音频采样率 | 48000Hz |
| 音频声道 | stereo |
| 容器 | MP4（faststart） |

---

## 11. 真实测试 Timeline

### 概览

- Timeline ID：`phase2b-final-test-001`
- 总时长：12.0 秒
- 5 个 video segment（SDR + HLG 混合）
- 1 个 voice asset（测试音频，非 1.1×）
- 5 条字幕（含 4 个关键词高亮）
- 2 个标题（1 hook + 1 emphasis）

### Video Track

| # | assetId | 素材类型 | sourceStart | duration |
|---|---|---|---|---|
| 1 | test_sdr_001 | SDR 720×1280 | 0.5s | 2.4s |
| 2 | test_hlg_001 | HLG 1920×1080 rotation=-90 | 2.0s | 2.4s |
| 3 | test_raw_001 | raw 素材 | 1.0s | 2.4s |
| 4 | test_raw_002 | raw 素材 | 0.5s | 2.4s |
| 5 | test_sdr_002 | SDR 720×1280（复用） | 1.0s | 2.4s |

### Subtitle Track

| ID | 时间 | 文本 | 高亮 |
|---|---|---|---|
| sub_001 | 0-2.4s | 欢迎来到浩明饮品 | 无 |
| sub_002 | 2.4-4.8s | 我们支持 OEM 和 ODM 定制 | OEM, ODM |
| sub_003 | 4.8-7.2s | 专注饮品制造二十年 | 二十年 |
| sub_004 | 7.2-9.6s | 品质保证 交付及时 | 品质保证 |
| sub_005 | 9.6-12s | 联系我们 开启合作 | 无 |

### Title Track

| ID | 时间 | 文本 | 样式 | Layer |
|---|---|---|---|---|
| title_hook_001 | 0-3s | 浩明饮品 | title.hook | 2 |
| title_emphasis_001 | 6-9s | OEM/ODM 定制 | title.emphasis | 2 |

### Voice Track

| assetId | start | duration | volume |
|---|---|---|---|
| test_voice_001 | 0s | 12.0s | 1.0 |

---

## 12. final.mp4 路径

**因缺少 ffprobe，正式测试未运行，final.mp4 未生成。**

安装 ffprobe 后，运行测试脚本将输出到：
```
tmp/zhiheng-renderer/phase2b-test/render-<timestamp>-<uuid>/final.mp4
```

同时保留：
- `timeline.json`
- `subtitles.ass`
- `preprocess-result.json`
- `render-report.json`
- `segments/`（normalized FFV1 segments）
- `logs/render.log`

---

## 13. 发现的问题

### 阻塞问题

1. **缺少 ffprobe**：当前环境只有 ffmpeg，没有 ffprobe。正式模式要求 ffmpeg + ffprobe，Environment Preflight 正确阻止了渲染。
   - 解决方案：安装完整 FFmpeg distribution（包含 ffmpeg.exe + ffprobe.exe）
   - 建议 bundled 目录：`项目 bin/ffmpeg/`，包含 ffmpeg.exe + ffprobe.exe

### 潜在问题（需正式测试验证）

1. **ASS 滤镜 Windows 路径**：ass 滤镜在 Windows 上的路径转义（冒号、反斜杠）需要实际测试验证。代码已做转义处理，但需实测确认。
2. **concat demuxer 与 FFV1 兼容性**：理论上 FFV1 完全统一后 concat demuxer 可以直接拼接，但需实测确认无花屏/卡顿。
3. **Style Registry 样式参数**：所有样式均为 provisional，字号/颜色/描边/位置需要人工看片确认后调整。
4. **voice 与视频同步**：voice 从 0 开始，与视频拼接后的起始时间对齐，需实测确认音画同步。

---

## 14. 当前 Style Registry Provisional 状态

所有 5 个内置样式均为 **provisional** 状态：

| styleId | 状态 | 说明 |
|---|---|---|
| subtitle.default | provisional | 白色粗体、黑色描边、底部居中、字号48 |
| subtitle.keyword | provisional | 黄色、黑色描边、用于内联高亮 |
| title.hook | provisional | 黄色 Heavy、黑色描边、正中偏下、字号72 |
| title.subhook | provisional | 白色 Medium、正中、字号42 |
| title.emphasis | provisional | 蓝色粗体、白色描边、正中、字号56 |

**注意**：
- 这些值是基于人工样片拆解的语义观察推导的候选值，未经过实测确认
- 字体使用 `Source Han Sans SC`（思源黑体），需要确认项目是否有自带字体文件
- Phase 2B 成片生成后，需要人工看片对比样片，调整后标记为 confirmed
- **不要因为成片成功就自动把样式标为 confirmed**

---

## 15. 尚未支持能力

V0.1 当前不支持（Timeline 中出现会返回 UNSUPPORTED_CAPABILITY）：

| 能力 | 状态 | 计划阶段 |
|---|---|---|
| overlayTrack（PNG/Logo/印章） | false | Phase 2C |
| bgmTrack（背景音乐） | false | Phase 2C |
| sfxTrack（音效） | false | Phase 2C |
| 动态标题 / 字幕动画 | false | 待定 |
| fade 转场 | false | 待定 |
| zoom / speed ramp | false | 待定 |
| LUT | false | 待定 |
| 多 voice track / 多人对话 | false | 待定 |
| source audio（素材原生音频） | false | 待定 |

当前支持的转场：仅 `hard_cut`。

---

## 16. 是否建议进入 Phase 3（Agent 接入）

**暂不建议。**

原因：
1. Phase 2B 正式测试未运行（缺少 ffprobe），最终合成能力未经过真实视频验证
2. Style Registry 所有样式均为 provisional，需要人工看片确认
3. ASS 烧录、concat、voice 混音等核心功能需要实测验证稳定性
4. HDR/HLG tone mapping + rotation 修复虽然在 Phase 2A.2 验证通过，但需要在最终成片中确认

**建议的下一步顺序**：
1. 安装 ffprobe（完整 FFmpeg distribution）
2. 运行 Phase 2B 测试脚本，生成 final.mp4
3. 人工看片验收：方向、字幕、关键词高亮、标题、voice、时长、HDR 曝光
4. 根据看片结果调整 Style Registry 样式参数，标记为 confirmed
5. 修复测试中发现的问题
6. 确认稳定后，再进入 Phase 3（Agent 接入）

---

## 附录：质量检查结果

| 检查项 | 结果 |
|---|---|
| typecheck（tsc --noEmit） | ✅ 通过 |
| oxlint（新增文件） | ✅ 0 warnings 0 errors |
| oxlint（renderer.ts） | ⚠️ 3 warnings（Phase 2A existing，未使用导入） |
| Timeline 验证 | ✅ valid=true, 0 errors |
| Capabilities 声明 | ✅ 准确（concat/ASS/关键词/标题/voice=true，overlay/bgm/sfx=false） |
| Environment Preflight | ✅ 正确阻止缺少 ffprobe 的正式渲染 |
| 正式 final.mp4 生成 | ⏸️ 未运行（缺少 ffprobe） |
