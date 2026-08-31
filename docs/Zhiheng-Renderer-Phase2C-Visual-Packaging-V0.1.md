# Zhiheng Renderer Phase 2C —— Visual Packaging Layer V0.1

**日期**: 2026-08-30
**阶段**: Phase 2C Visual Packaging Layer V0.1
**状态**: 已完成真实视频验证

---

## 一、包装层架构

### 职责边界

| 层 | 职责 | 输出 |
|---|---|---|
| Agent / Timeline | 语义意图：type, styleId, anchor, start, duration, text | overlayTrack 条目 |
| Layout Registry | "放在哪里"：anchor → 像素坐标, safe area, 字幕避让 | x, y, width, height |
| Style Registry | "长什么样"：颜色, 字体, 描边, 背景 | ASS 样式 / graphic 样式 |
| Graphic Generator | 生成背景 PNG（色块/底板/卡片），无文字 | PNG 文件 |
| Renderer | 串联：graphic 生成 → layout 计算 → overlay 合成 → ASS 烧录 | final.mp4 |
| FFmpeg | overlay 滤镜 + ass 滤镜 + H.264/AAC 编码 | 最终视频 |

### 核心原则

- Timeline 只写语义意图（type/styleId/anchor/start/duration），禁止输出 x/y/width/fontSize/opacity/FFmpeg filter
- 文字全部走 ASS，背景走 graphic PNG + overlay，分层执行
- 不使用 drawtext
- 包装元素不随机互相盖住，有正式 Layer Order

---

## 二、Timeline 扩展

### overlayTrack 结构

```typescript
{
  id: string,                    // 唯一标识
  type: 'image' | 'logo' | 'badge' | 'title_panel' | 'info_card',
  assetRef?: AssetRef,           // image/logo 类型必需
  styleId: string,               // 样式 ID
  anchor: Anchor,                // 锚点位置
  start: number,                 // 开始时间（秒）
  duration: number,              // 持续时长（秒）
  text?: string,                 // badge/title_panel/info_card 文字
  subtitle?: string,             // info_card 副标题
  opacity?: number               // 透明度 0-1（可选）
}
```

### Anchor 支持

V0.1 支持 9 个固定语义锚点：
- top_left, top_center, top_right
- center_left, center, center_right
- bottom_left, bottom_center, bottom_right

不允许 Timeline 写自由 x/y。

---

## 三、Layout Registry

### 文件
`src/engines/zhiheng-renderer/layout-registry.ts`

### Safe Area（provisional，基于 1080×1920）

| 参数 | 值 | 说明 |
|---|---|---|
| top | 80px | 顶部安全区 |
| bottom | 80px | 底部安全区 |
| sideMargin | 60px | 左右边距 |
| subtitleReservedHeight | 320px | 字幕预留区（从底部算起） |
| titleReservedHeight | 200px | 标题预留区（从顶部算起） |

### 字幕避让

bottom_* 锚点的元素如果进入字幕预留区（height - 320px 以下），自动上移到字幕区之上 + 20px 间距。

V0.1 只实现静态区域避让，不做 CV 人物检测。

### Layer Order（正式）

| 层级 | 值 | 内容 |
|---|---|---|
| Video | 0 | 视频底图 |
| Graphic Background / Title Panel | 10 | 半透明底板 |
| Image / Logo Overlay | 20 | PNG/Logo |
| Badge | 30 | 角标 |
| Info Card | 40 | 信息卡 |
| ASS Subtitle | Layer 0 | 字幕（ASS 内） |
| ASS Title | Layer 2 | 标题（ASS 内） |
| ASS Badge/Card Text | Layer 3 | 角标/信息卡文字（ASS 内） |

---

## 四、Graphic Generator

### 文件
`src/engines/zhiheng-renderer/graphic-generator.ts`

### 职责
根据 overlay type + styleId 生成背景 PNG（无文字），使用 FFmpeg color 源滤镜。

### 支持的 Graphic 样式（provisional）

| styleId | 背景色 | 尺寸 | 说明 |
|---|---|---|---|
| panel.default | black@0.65 | 960×120 | 标题底板（半透明） |
| panel.hook | black@0.75 | 960×140 | 钩子标题底板 |
| panel.solid | #1a1a1a@1.0 | 960×120 | 实心标题底板 |
| badge.default | #FFD700@1.0 | 280×72 | 黄色角标 |
| badge.oem | #FFD700@1.0 | 240×72 | OEM/ODM 角标 |
| badge.factory | #2E8B57@1.0 | 280×72 | 工厂实拍角标 |
| badge.dark | black@0.8 | 280×72 | 深色角标 |
| card.info | black@0.75 | 900×200 | 信息卡（半透明） |
| card.small | black@0.7 | 800×160 | 小信息卡 |
| card.accent | #1a1a2e@0.9 | 900×200 | 强调信息卡 |

### 文字处理
badge/title_panel/info_card 的文字不走 graphic，而是通过 titleTrack + Style Registry 中的对应样式（title.badge, title.card_title, title.card_subtitle）走 ASS。

---

## 五、Compose 层修改

### 文件
`src/engines/zhiheng-renderer/compose.ts`

### 变更
- 从简单 `-vf` 滤镜链改为 `filter_complex`，支持多输入 overlay
- 新增 `OverlayInput` 类型：imagePath, x, y, start, end, layer, opacity
- overlay 使用 `enable='between(t,start,end)'` 控制时间范围
- 按 layer 排序依次叠加，数值越大越靠上
- 透明度通过 `colorchannelmixer=aa=opacity` 预处理
- overlay 图片输入用 `-loop 1` 持续显示，用 enable 控制时间

### filter_complex 结构
```
[0:v]format=yuv420p10le[base];
[base][1:v]overlay=x:y:enable='between(t,s1,e1)'[v1];
[v1][2:v]overlay=x:y:enable='between(t,s2,e2)'[v2];
[v2]ass='ASS_PATH',format=yuv420p[outv]
```

---

## 六、Renderer 集成

### 文件
`src/engines/zhiheng-renderer/renderer.ts`

### 变更
- 版本号更新为 `0.1.0-phase2c`
- `getCapabilities()`: overlayTrack=true
- 移除 validate 中 overlayTrack 的 UNSUPPORTED_CAPABILITY 检查
- render 方法新增 overlay 处理阶段（第 9 步）：
  1. 调用 `generateAllGraphics()` 生成 badge/title_panel/info_card 背景 PNG
  2. 对每个 overlay：
     - image/logo 类型：通过 Asset Resolver 获取 PNG 路径
     - badge/title_panel/info_card：使用生成的 graphic 路径
     - 调用 `calculateLayout()` 计算像素坐标
     - 构建 `OverlayInput`
  3. 将 overlays 列表传给 `composeFinal()`

---

## 七、Style Registry 新增样式

### 文件
`src/engines/zhiheng-renderer/style-registry.ts`

### 新增样式（全部 provisional）

| styleId | 说明 | 位置 |
|---|---|---|
| title.badge | 角标文字（黑色，配合黄色 badge 背景） | 右上角 (alignment=9) |
| title.card_title | 信息卡标题（白色 Heavy） | 左上角 (alignment=7) |
| title.card_subtitle | 信息卡副标题（浅灰 Medium） | 左上角，标题下方 |

---

## 八、真实测试结果

### 测试 Timeline
- 5 个 video segment（SDR + HLG 混合）
- 1 个 voice asset
- 5 条字幕（含 4 个关键词高亮）
- 5 个标题（hook + emphasis + badge + card_title + card_subtitle）
- 4 个 overlay：
  1. title_panel top_center（0-3s，配合 hook title）
  2. title_panel center（6-9s，配合 emphasis title）
  3. badge top_right（2.4-7.2s，OEM/ODM）
  4. info_card bottom_left（0-4s，自有工厂 + OEM/ODM）

### 输出
- 路径：`tmp/zhiheng-renderer/phase2c-packaging-test/render-1788061941366-9040c714/final.mp4`
- 大小：20.95 MB
- 时长：12.00s
- 格式：H.264 High, yuv420p(tv, bt709), 1080×1920, 30fps, AAC 192kbps
- 渲染耗时：24.46s

### 视觉验证（抽帧）

**t=1.5s（SDR 石碑素材）**：
- ✅ 顶部黑色半透明 title_panel（通栏）
- ✅ 中部 "浩明饮品" hook title（黄色）
- ✅ 左下角 info_card（黑色半透明背景），含 "自有工厂" + "OEM / ODM 定制"
- ✅ 底部字幕 "欢迎来到浩明饮品"
- ✅ info_card 未压字幕（字幕在最底部）

**t=4.0s（HLG 展会素材）**：
- ✅ 右上角黄色 badge "OEM/ODM"（黑色文字）
- ✅ 底部字幕 "我们支持 OEM 和 ODM 定制"，OEM/ODM 黄色高亮
- ✅ HLG 曝光正常（地面明黄色，背景清晰）
- ✅ 方向正确（人物站立）

**t=7.5s（HLG 展会素材）**：
- ✅ 中部 title_panel（黑色半透明）+ "OEM/ODM 定制" emphasis title（蓝色白描边）
- ✅ 底部字幕 "品质保证 交付及时"，"品质保证" 黄色高亮
- ✅ HLG 曝光正常

### Graphic 生成
- `graphics/ov_panel_hook.png`（0.8 KB）
- `graphics/ov_panel_emphasis.png`（0.7 KB）
- `graphics/ov_badge_oem.png`（0.3 KB）
- `graphics/ov_card_factory.png`（1.0 KB）

---

## 九、Capability 声明

```typescript
{
  sourceTrim: true,
  multiSegmentConcat: true,
  scaleCrop: true,
  hdrToneMap: true,
  assSubtitles: true,
  keywordHighlight: true,
  titleTrack: true,
  overlayTrack: true,      // Phase 2C 新增
  bgmTrack: false,
  sfxTrack: false,
  voiceMix: true,
  outputProfile: true,
  transitions: ['hard_cut']
}
```

---

## 十、尚未支持能力

- BGM / SFX
- PNG Logo Overlay（架构已支持，但测试缺真实 Logo 资产）
- 动态标题 / 字幕动画
- 复杂转场（fade/dissolve/slide）
- 圆角 graphic（当前用矩形）
- CV 人物检测 / 动态避让
- LUT / speed ramp
- 自定义 x/y 坐标（只支持 anchor）

---

## 十一、provisional 参数清单

以下参数均为 provisional，需要人工看片确认后调整为 confirmed：

1. **Safe Area**: top=80, bottom=80, sideMargin=60, subtitleReservedHeight=320
2. **Graphic 尺寸**: panel 960×120/140, badge 240/280×72, card 900×200
3. **Graphic 颜色/透明度**: panel black@0.65/0.75, badge #FFD700, card black@0.75
4. **Badge 文字样式**: title.badge 字号 36, 黑色, 右上角 marginV=100
5. **Info Card 文字样式**: title.card_title 字号 44 白色, title.card_subtitle 字号 32 浅灰
6. **Title Panel 位置**: 与 title.hook/title.emphasis 的 ASS 位置对齐需微调
7. **Info Card 位置**: 左下角 marginV=1450/1390，需确认与字幕避让效果

---

## 十二、下一阶段建议

1. **人工看片确认**：老板检查 final-packaged.mp4，确认包装元素视觉效果
2. **样式参数调优**：根据看片结果调整 provisional 参数（字号、位置、颜色、透明度）
3. **真实 Logo 资产**：准备浩明饮品 Logo PNG，测试 image/logo overlay
4. **圆角 graphic**：评估是否需要圆角（当前矩形），可用 FFmpeg geq 或预生成圆角 PNG
5. **动画系统**：包装层结构稳定后，增加 animationPreset（fade/slide/scale）
6. **BGM/SFX**：Phase 2D 实现背景音乐和音效

---

## 十三、新增/修改文件清单

### 新增
- `src/engines/zhiheng-renderer/layout-registry.ts` — Layout Registry（safe area/anchor/字幕避让/Layer Order）
- `src/engines/zhiheng-renderer/graphic-generator.ts` — Graphic Generator（背景 PNG 生成）
- `scripts/test-zhiheng-renderer-phase2c.ts` — Phase 2C 测试脚本

### 修改
- `src/engines/zhiheng-renderer/types.ts` — overlayTrack 结构扩展（type/styleId/anchor/text/subtitle/opacity）
- `src/engines/zhiheng-renderer/compose.ts` — 从 -vf 改为 filter_complex，支持多层 overlay
- `src/engines/zhiheng-renderer/renderer.ts` — 集成 graphic generator + layout calculator + overlay，capability overlayTrack=true
- `src/engines/zhiheng-renderer/validator.ts` — 移除 overlayTrack 旧警告
- `src/engines/zhiheng-renderer/style-registry.ts` — 新增 title.badge/title.card_title/title.card_subtitle 样式
- `.gitignore` — 添加 bin/ffmpeg/ 忽略
