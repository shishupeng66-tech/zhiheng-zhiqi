# Zhiheng Renderer HDR→SDR 方案切换报告

**日期**: 2026-08-30
**变更**: HLG/PQ → SDR 正式处理链从 `zscale+tonemap hable peak=100` 切换为 `libplacebo hable peak_detect`

---

## 一、背景

Phase 2A 修复 HLG 炸白问题后，人工视觉验收发现：
- HLG normalized segment 虽然不再炸白，但画面明显**发灰、发白、对比度低**。
- 此前"HDR→SDR 已经正确"的结论撤销。

## 二、对照实验

执行 HLG→SDR 色彩转换对照实验（6 个版本），使用真实 HLG 素材：
`afeae50bd4f303d9739d0626b1b663e7_raw.mp4`（HEVC Main10, BT.2020, HLG）

| 版本 | 方案 | 亮度统计 | 人工观感 |
|------|------|----------|----------|
| A-current | zscale+tonemap hable desat=0.5 **peak=100** | Y avg=143.4, clip=0.00% | **发灰发白，对比度低** |
| B-hable-auto | hable, peak 自动检测 | Y avg=157.2, clip=6.32% | 高光炸白 |
| C-hable-desat02 | hable desat=0.2, peak 自动 | Y avg=162.8, clip=6.55% | 高光炸白 |
| D-mobius | mobius, peak 自动 | Y avg=167.4, clip=2.72% | 高光炸白 |
| E-reinhard | reinhard, peak 自动 | Y avg=162.7, clip=3.65% | 高光炸白 |
| **F-libplacebo** | **libplacebo hable peak_detect=1** | Y avg=117.2, clip=0.01% | **色彩鲜艳，对比度好，无炸白** |

**老板实际肉眼对比后明确确认：F-libplacebo-hable.mp4 效果最好。**

实验详情：`tmp/zhiheng-renderer/hdr-tonemap-comparison/report.md`

## 三、旧方案问题根因

旧方案：`zscale=t=linear:npl=100, tonemap=hable:desat=0.5:peak=100, zscale=t=bt709`

**问题**：`tonemap` 的 `peak` 参数官方语义是 **signal peak override**（信号峰值覆盖，默认 0=自动检测），**不是** "目标 SDR 100 nit"。

此前错误地将 `peak=100` 理解为"输出 100 nit"，实际效果是：
- 强制告诉 tonemap 滤镜输入信号峰值是 100 倍参考白
- 在真实 HLG 素材（峰值通常 1000 nits）上，tonemap 曲线在低峰值区域过度压缩
- 导致动态范围被压缩，画面整体偏亮、对比度低、发灰发白

**这个选择是基于真实素材人工视觉验收，不是仅依据亮度统计自动决定。**

## 四、新正式方案

### Filter Chain（HLG/PQ → SDR）

```
scale=1080:1920:force_original_aspect_ratio=increase,
crop=1080:1920,
libplacebo=w=1080:h=1920:format=yuv420p10le:colorspace=bt709:color_primaries=bt709:color_trc=bt709:tonemapping=hable:peak_detect=1,
fps=30,
format=yuv420p10le
```

### 关键参数（与实验 F 完全一致）

- `tonemapping=hable`：Hable filmic tone mapping 算子
- `peak_detect=1`：启用动态峰值检测（每帧检测，smoothing_period=20 平滑）
- `colorspace=bt709` / `color_primaries=bt709` / `color_trc=bt709`：输出 BT.709 SDR
- `format=yuv420p10le`：输出 10-bit 4:2:0（中间格式）

### 色彩分类处理规则

| 分类 | 处理 |
|------|------|
| SDR | 不做 HDR tone mapping，直接 scale+crop+fps+format |
| HLG | libplacebo HDR→SDR（hable + peak_detect） |
| PQ_HDR10 | libplacebo HDR→SDR（hable + peak_detect） |
| UNKNOWN | 不擅自按 HDR 处理，透传 + warning |

## 五、Environment Preflight 更新

正式模式必需能力更新为：

| 类型 | 必需 |
|------|------|
| 可执行文件 | ffmpeg, ffprobe |
| 滤镜 | zscale, **libplacebo**, ass |
| 编码器 | ffv1, libx264 |

如果 libplacebo 不存在：`ready=false`，不静默退回旧 hable peak=100，不自动降级。

tonemap 降为推荐能力（保留用于潜在 fallback）。

## 六、验证结果

### 新 HLG normalized segment

- 路径：`tmp/zhiheng-renderer/phase2b-test/render-1788060238492-d6570c67/segments/segment-02.mkv`
- 格式：**ffv1, yuv420p10le(tv, bt709), 1080×1920, 30fps**
- 时长：2.40s
- 无 rotation/displaymatrix 残留
- 无音频（normalized segment 正确）

### 新 final.mp4

- 路径：`tmp/zhiheng-renderer/phase2b-test/render-1788060238492-d6570c67/final.mp4`
- 格式：**h264 High, yuv420p(tv, bt709), 1080×1920, 30fps, AAC 192kbps**
- 时长：12.000s（expected 12.000s，diff 0.000s）
- 大小：22.42 MB

### 视觉对比（同时间点抽帧）

| 版本 | 地面颜色 | 背景展板 | 人物黑色 | 对比度 |
|------|----------|----------|----------|--------|
| 旧 A-current | 淡粉/灰白 | 暗淡，文字看不清 | 发灰 | 低 |
| 实验 F-libplacebo | 明亮黄色 | 清晰，文字可见 | 深沉 | 高 |
| **新正式 Renderer** | **明亮黄色** | **清晰，文字可见** | **深沉** | **高** |

**结论：新正式 Renderer 输出 ≈ 实验 F 输出，明显优于旧 A-current。HLG 发灰发白问题已解决。**

对比帧：`tmp/zhiheng-renderer/hdr-tonemap-comparison/compare/`

## 七、修改的文件

| 文件 | 变更 |
|------|------|
| `src/engines/zhiheng-renderer/preprocess.ts` | HLG/PQ 路径从 zscale+tonemap 切换为 libplacebo；删除 peak=100；添加废弃原因注释 |
| `src/engines/zhiheng-renderer/environment.ts` | REQUIRED_FILTERS 加入 libplacebo；ass/libx264 升为必需；tonemap 降为推荐 |

**未修改**：Timeline Schema、Style Registry、Agent、MPT、Voice Service、字幕/标题样式。

## 八、Capability

`hdrToneMap=true` 保持不变。HDR→SDR 属于 Renderer 的媒体执行职责，Agent 不决定 tone mapping 算法。

## 九、后续

- Style Registry 仍为 provisional，需要老板看片后调整字号/位置/颜色。
- voice 仍为测试音频（非 1.1× 语速），后续完整链路测试时替换为 Voice Service 产物。
- 本报告基于真实素材人工视觉验收，不是仅依据亮度统计自动决定。
