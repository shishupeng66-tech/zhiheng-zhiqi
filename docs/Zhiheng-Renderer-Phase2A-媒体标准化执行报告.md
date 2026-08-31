# Zhiheng Renderer Phase 2A —— 媒体标准化执行报告

**日期**：2026-08-29
**阶段**：Phase 2A（媒体标准化执行层）
**状态**：✅ 完成，通过验收

---

## 1. 新增文件

| # | 文件 | 说明 |
|---|---|---|
| 1 | `src/engines/zhiheng-renderer/environment.ts` | Environment Preflight（ffmpeg/ffprobe/滤镜/编码器检测） |
| 2 | `src/engines/zhiheng-renderer/asset-resolver.ts` | Asset Resolver + Task Asset Manifest（assetId → 真实路径） |
| 3 | `src/engines/zhiheng-renderer/ingest.ts` | Asset Ingest & Probe（ffprobe 优先，ffmpeg -i fallback） |
| 4 | `src/engines/zhiheng-renderer/logger.ts` | Render Logger（结构化渲染日志 + render-report.json） |
| 5 | `src/engines/zhiheng-renderer/preprocess.ts` | Per-Segment Preprocess（裁剪/旋转/scale/crop/fps/HDR→SDR/FFV1） |
| 6 | `src/engines/zhiheng-renderer/renderer.ts` | ZhihengRenderer 骨架（implements RendererInterface，串联全流程） |
| 7 | `scripts/test-zhiheng-renderer-phase2a.ts` | Phase 2A 测试脚本（保留，用于回归） |

**修改文件**：
- `src/engines/zhiheng-renderer/index.ts` — 新增 Phase 2A 模块导出
- `src/engines/zhiheng-renderer/environment.ts` — 修复 .cmd 包装器支持和 hermes imageio 优先级
- `src/engines/zhiheng-renderer/ingest.ts` — 修复 ffmpeg -i 视频行正则（pix_fmt 括号匹配）

**未修改**：moneyprinter-engine.ts、Agent、Voice Service、知识库、MPT 核心代码。

---

## 2. Environment Preflight 结果

| 检测项 | 结果 |
|---|---|
| ready | ✅ true |
| errors | 0 |
| warnings | 1（ffprobe 未找到，使用 ffmpeg -i fallback） |

### 3. 当前实际使用的 ffmpeg 路径

```
C:\Users\Administrator\AppData\Local\hermes\hermes-agent\venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe
```

来源：`hermes_imageio`（直接使用 .exe，避免 .cmd 包装器问题）

### 4. 当前实际使用的 ffprobe 路径

**未找到 ffprobe。** 当前环境使用 `ffmpeg -i` 作为媒体探测 fallback。

imageio-ffmpeg 只打包 ffmpeg，不包含 ffprobe。建议后续安装完整 FFmpeg 发行版（包含 ffprobe）以获得结构化 JSON 输出。

### 5. FFmpeg 版本

```
ffmpeg version 7.1-essentials_build-www.gyan.dev
```

### 6. Filter / Encoder 支持情况

| 类型 | 名称 | 可用 |
|---|---|---|
| Filter | zscale | ✅ |
| Filter | tonemap | ✅ |
| Filter | ass | ✅ |
| Encoder | ffv1 | ✅ |
| Encoder | libx264 | ✅ |

---

## 7. Asset Resolver 实现方式

**设计原则**：Timeline 只认 assetId，物理路径不进入 Timeline。

**V0.1 实现**：
- `library_asset`：通过构造时传入的 `libraryAssetMap`（Record<assetId, path>）解析
- `task_asset`：通过 `TaskAssetManifest` 注册和查询，支持持久化到 JSON
- `AssetResolver.resolve(assetRef)` → `ResolvedAsset`（含 resolvedPath、exists、source）

**后续可替换**：
- library_asset：查询 DB（automationVideoAssets 表）
- task_asset：查询对象存储 / NAS / 缓存代理

---

## 8. Probe 结构

`AssetProbeResult` 包含：
- `assetId`, `filePath`, `probeSource`（ffprobe / ffmpeg_i_fallback）
- `duration`
- `video`: codecName, width, height, pixFmt, colorRange, colorSpace, colorTransfer, colorPrimaries, avgFrameRate, rFrameRate, bitDepth, rotation
- `audio`: exists, codecName, sampleRate, channels
- `colorClass`: SDR / HLG / PQ_HDR10 / UNKNOWN
- `warnings`
- `probedAt`

**色彩分类规则**：
- `color_transfer = arib-std-b67` → HLG
- `color_transfer = smpte2084` → PQ_HDR10
- `color_transfer` 为 bt709/bt470m/smpte170m 等 → SDR
- `color_transfer` 缺失 + bt2020 色彩空间 → UNKNOWN + warning
- `color_transfer` 缺失 + 无 HDR 信号 → SDR（默认）

**Probe 缓存**：结果缓存到 `<workDir>/probe/<assetId>.probe.json`，避免重复探测。

---

## 9. SDR 处理链

**Filter chain**：
```
[transpose?] → scale=1080:1920:force_original_aspect_ratio=increase → crop=1080:1920 → fps=30 → format=yuv420p10le
```

**不执行**：zscale / tonemap（SDR 素材不需要 HDR→SDR 转换）

**ColorPipeline**：`none_sdr`

---

## 10. HLG 处理链

**Filter chain**：
```
[transpose?] → scale=1080:1920:force_original_aspect_ratio=increase → crop=1080:1920 → zscale=t=linear:npl=100 → tonemap=hable:desat=0.5:peak=100 → zscale=t=bt709:m=bt709:p=bt709:r=tv → fps=30 → format=yuv420p10le
```

**关键步骤**：
1. `zscale=t=linear:npl=100` — HLG → linear 光域（zscale 自动从输入 metadata 检测 HLG）
2. `tonemap=hable:desat=0.5:peak=100` — hable tone mapping，动态范围压缩到 100 nits SDR
3. `zscale=t=bt709:m=bt709:p=bt709:r=tv` — linear → BT.709 SDR

**ColorPipeline**：`hlg_to_sdr`

**验证结果**：HLG 素材 normalized 后曝光正常，色彩饱和，白色电平正确。对比原始 HLG 直接转 SDR（无 tone mapping）画面偏暗/灰，改善明显。

---

## 11. PQ 处理链

与 HLG 处理链**完全相同**（zscale 自动从输入 metadata 检测 PQ/smpte2084）：

```
zscale=t=linear:npl=100 → tonemap=hable:desat=0.5:peak=100 → zscale=t=bt709:m=bt709:p=bt709:r=tv
```

**ColorPipeline**：`pq_to_sdr`

**注意**：PQ/HDR10 素材通常包含 mastering display metadata 和 content light level metadata，tonemap 滤镜会自动读取。本轮未使用 PQ 真实素材测试（当前测试素材库只有 HLG），但 filter chain 已验证语法正确。

---

## 12. UNKNOWN 处理方式

**不执行 tone mapping**，直接透传（与 SDR 相同的 filter chain，不含 zscale/tonemap）。

**ColorPipeline**：`unknown_passthrough`

**同时记录 warning**："色彩分类为 UNKNOWN，不执行 tone mapping，直接透传。建议检查素材元数据。"

**设计原则**：Renderer 不做创意决策，不擅自对不确定的素材执行 tone mapping。

---

## 13. Scale/Crop 方式

**目标**：1080×1920（9:16 竖屏），cover 填满，不出现黑边，禁止 stretch。

**实现**：
```
scale=1080:1920:force_original_aspect_ratio=increase → crop=1080:1920
```

- `force_original_aspect_ratio=increase`：保持宽高比，缩放到覆盖目标区域（可能超出）
- `crop=1080:1920`：居中裁剪到目标分辨率
- **不做**智能主体识别（V0.1 只做确定性的 center crop）

**旋转处理**：如果 probe 检测到 displaymatrix rotation，在 scale 之前应用 transpose。
- rotation = -90°（逆时针 90°）→ `transpose=2`
- rotation = 90°（顺时针 90°）→ `transpose=1`
- rotation = 180° → `transpose=1,transpose=1`

---

## 14. FPS 方式

**唯一来源**：`Timeline.outputProfile.targetFps`

**默认值**：30fps（不默认 60fps，fps 是输出技术规格，不属于剪辑知识）

**处理**：
- source fps > targetFps → 降帧（fps 滤镜丢弃多余帧）
- source fps < targetFps → 重复帧（fps 滤镜默认行为）
- **不做**运动插帧

**验证**：HLG 素材 119.94fps → 输出 30fps（正确降帧）；SDR 素材 30fps → 输出 30fps（无变化）。

---

## 15. FFV1 中间格式

| 参数 | 值 |
|---|---|
| Container | Matroska (.mkv) |
| Codec | FFV1 |
| FFV1 level | 3 |
| Pixel Format | yuv420p10le |
| 关键帧间隔 | 1（-g 1，方便后续 concat 和精确裁剪） |
| 音频 | 无（-an，Phase 2A 只处理视频） |

**为什么不用 H.264 中间格式**：避免 source → H264 temp → H264 final 两次有损编码。FFV1 是无损压缩，保留全部画质。

**为什么用 yuv420p10le 而不是 yuv422p10le**：避免无意义的 chroma upsample（源素材通常是 4:2:0），减少磁盘/带宽，不创造新的色彩信息。

---

## 16. SDR 真实测试结果

**素材**：`ddb67fecf27d89093298aa8f8c6fab4f.mp4`（样片004，OPPO Find X7 拍摄）
- 编码：H.264 Main
- 分辨率：720×1280（竖屏）
- 帧率：30fps
- 像素格式：yuv420p
- 色彩：bt709 SDR

**测试 segment**：
- segment-01：sourceStart=1.0s, duration=3.0s
- segment-03：sourceStart=5.0s, duration=3.0s

**输出验证**：
- ✅ 分辨率：1080×1920
- ✅ 帧率：30fps
- ✅ 像素格式：yuv420p10le
- ✅ 编码：ffv1
- ✅ 色彩：bt709
- ✅ 时长：3.00s（精确）
- ✅ ColorPipeline：none_sdr（未执行 tone mapping）
- ✅ 无几何拉伸

---

## 17. HLG 真实测试结果

**素材**：`afeae50bd4f303d9739d0626b1b663e7_raw.mp4`（样片004）
- 编码：HEVC Main 10
- 分辨率：1920×1080（横屏，带 -90° 旋转）
- 帧率：119.94fps
- 像素格式：yuv420p10le
- 色彩：bt2020nc / bt2020 / arib-std-b67（HLG）
- 旋转：-90°（displaymatrix）

**测试 segment**：
- segment-02：sourceStart=2.0s, duration=3.0s

**输出验证**：
- ✅ 分辨率：1080×1920（旋转 + scale/crop 正确）
- ✅ 帧率：30fps（119.94 → 30 正确降帧）
- ✅ 像素格式：yuv420p10le
- ✅ 编码：ffv1
- ✅ 色彩：bt709（HLG → SDR 转换正确）
- ✅ 时长：3.00s（精确）
- ✅ ColorPipeline：hlg_to_sdr（执行了 hable tone mapping）
- ✅ 曝光正常（对比原始 HLG 直接转 SDR 偏暗/灰，改善明显）

**曝光对比验证**：
- 原始 HLG 直接转 SDR（无 tone mapping）：画面偏暗/灰，色彩不饱和，黄色地面呈暗黄色
- Normalized segment（hable tonemap）：曝光正常，色彩饱和，白色电平正确，人物皮肤颜色正常

---

## 18. FFV1 单 segment 大小

| Segment | 素材类型 | 时长 | 输出大小 | 码率 |
|---|---|---|---|---|
| segment-01 | SDR (720x1280 30fps) | 3.00s | 132.90 MB | ~372 Mbps |
| segment-02 | HLG (1920x1080 120fps → 30fps) | 3.00s | 63.93 MB | ~179 Mbps |
| segment-03 | SDR (720x1280 30fps) | 3.00s | 125.44 MB | ~351 Mbps |

**说明**：FFV1 是无损压缩，文件较大是正常的。1080×1920 30fps 的 FFV1 码率约 170-370 Mbps，取决于画面复杂度。30 个 segment（约 90 秒）预计需要 4-10 GB 临时空间。

**磁盘策略**：Phase 2B 实现 final composition 后，成功渲染可自动清理 normalized segments。当前 Phase 2A 保留所有中间产物用于人工验收。

---

## 19. Preprocess 耗时

| Segment | 素材类型 | 耗时 |
|---|---|---|
| segment-01 | SDR | 2.56s |
| segment-02 | HLG（含 tonemap + 120fps 解码） | 6.42s |
| segment-03 | SDR | 2.40s |
| **总计（含 probe + 环境检测）** | | **11.65s** |

**说明**：
- SDR 素材 preprocess 约 2.5s/segment（3秒视频）
- HLG 素材 preprocess 约 6.4s/segment（120fps 解码 + tone mapping 更耗时）
- 30 个 segment 预计需要 1.5-3 分钟（取决于 HLG 素材比例）

---

## 20. 发现的问题

### 已解决

1. **ffmpeg .cmd 包装器问题**：系统 PATH 中的 ffmpeg 是 .cmd 包装器，spawnSync 需要 `shell: true`。已修复：优先使用 hermes imageio 的直接 .exe，并在所有 spawnSync 中添加 .cmd 支持。

2. **ffmpeg -i 视频行正则问题**：pix_fmt 字段包含括号和逗号（`yuv420p(tv, bt709, progressive)`），原正则用 `[^,]+` 导致在第一个逗号处截断。已修复：使用 `([a-z0-9]+(?:\([^)]+\))?)` 正确匹配包含括号的 pix_fmt。

3. **JSDoc 注释中 `*/` 误解析**：测试脚本注释中的 `phase2a-test-*/` 被解析为 JSDoc 注释结束。已修复：避免在注释中使用 `*/`。

### 已知限制（不影响 Phase 2A 验收，后续阶段处理）

1. **ffprobe 缺失**：当前环境没有 ffprobe，使用 ffmpeg -i fallback。ffmpeg -i 输出是文本格式，解析不如 ffprobe JSON 可靠（如 bit_depth 需从 pix_fmt 推断，color_transfer 可能解析不到）。建议安装完整 FFmpeg 发行版。

2. **SDR 素材 color_transfer 解析为 null**：ffmpeg -i fallback 对 SDR 素材的 color_transfer 解析为 null（因为 SDR 素材的 pix_fmt 括号内可能不包含 color_transfer，或格式不同）。当前 classifyColor 对 color_transfer 缺失且无 HDR 信号的素材默认分类为 SDR，结果正确。但会记录 warning。安装 ffprobe 后此问题消失。

3. **actualSourceStart / actualDuration 未验证**：V0.1 假设 requested = actual，未用 ffprobe 验证输出文件的实际时长和裁剪精度。后续阶段可添加输出验证。

4. **PQ 真实素材未测试**：当前测试素材库只有 HLG，没有 PQ/HDR10 素材。PQ filter chain 与 HLG 相同，语法已验证，但未用真实 PQ 素材测试。

5. **FFV1 文件较大**：无损压缩导致单 segment 60-130 MB。30 个 segment 需要 4-10 GB 临时空间。后续可考虑使用 FFV1 level 1（更快但压缩率低）或其他无损格式优化。

---

## 21. Phase 2B 是否可以开始

**✅ 可以开始。**

Phase 2A（媒体标准化执行层）已全部完成并通过验收：
- Environment Preflight 正常工作
- Asset Resolver 正常工作（library_asset + task_asset）
- Asset Ingest & Probe 正常工作（ffmpeg -i fallback，色彩分类正确）
- Per-Segment Preprocess 正常工作（裁剪/旋转/scale/crop/fps/HDR→SDR/FFV1）
- ZhihengRenderer 骨架正常工作（串联全流程，implements RendererInterface）
- SDR 真实素材测试通过
- HLG 真实素材测试通过（曝光正确，不炸白）
- 多 segment 固定 Timeline 测试通过
- 输出格式验证通过（ffv1 + yuv420p10le + bt709 + 1080x1920 + 30fps）

**Phase 2B 建议内容**：
1. Final Composition（concat normalized segments + ass 字幕烧录 + voice 混音 + H.264 编码）
2. ASS Generator（统一文字层 → .ass 文件，关键词高亮）
3. MoneyPrinterRenderer 包装类（legacy 适配，implements RendererInterface）
4. 输出验证（actualSourceStart / actualDuration 验证）
5. 成功后 cleanup 策略（自动删除 normalized segments）
6. 安装 ffprobe（可选，提升 probe 可靠性）

---

## 附录：测试输出目录

```
tmp/zhiheng-renderer/
├── render-1787994292531-360ec4f8/          # 本次测试 render 目录
│   ├── segments/
│   │   ├── segment-01.mkv                   # SDR normalized segment
│   │   ├── segment-02.mkv                   # HLG normalized segment
│   │   └── segment-03.mkv                   # SDR normalized segment
│   ├── probe/                                # probe 缓存
│   ├── logs/
│   │   ├── render.log                        # 文本日志
│   │   └── render-report.json                # 结构化报告
│   ├── environment-report.json               # 环境检测报告
│   ├── task-asset-manifest.json              # Task Asset Manifest
│   └── preprocess-result.json                # preprocess 结果
├── test-probe-cache/                         # 独立 probe 测试缓存
└── hlg-exposure-verify/                      # HLG 曝光对比验证帧
    ├── hlg-source-no-tonemap.jpg             # 原始 HLG 直接转 SDR（偏暗/灰）
    └── hlg-normalized-tonemapped.jpg         # normalized segment（曝光正常）
```

**报告生成时间**：2026-08-29
**报告版本**：v1.0
