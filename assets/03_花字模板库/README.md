# 知衡智企「智剪」花字模板库 V1.0

## 概述

知衡智企自动剪辑系统的官方花字模板库，包含 10 个设计好的文字模板，覆盖开场标题、重点强调、划重点、数据突出、情绪表达、结尾引导 6 大类。

每个花字模板 = ASS 文字样式 + 装饰元素（贴纸/图形）+ 入场/出场动画。

## 来源与授权

- **来源**：自制（基于企业短视频包装设计规范）
- **生成脚本**：`scripts/generate_text_styles.py`
- **授权**：自有版权，可自由商用、修改
- **状态**：provisional（待人工看片确认后升级为 confirmed）
- **生成日期**：2026-08-30

## 目录结构

```
assets/03_花字模板库/
├── index.json                    # 素材索引（唯一 source of truth）
├── README.md                     # 本说明文档
├── 01_开场标题/                  # 2个 - 开场大标题
├── 02_重点强调/                  # 2个 - 核心卖点强调
├── 03_划重点/                    # 2个 - 知识点/注意标注
├── 04_数据突出/                  # 2个 - 关键数据展示
├── 05_情绪表达/                  # 1个 - 震惊/警告
└── 06_结尾引导/                  # 1个 - 关注/合作引导
```

## 模板清单

### 01_开场标题（2个）

| ID | 名称 | 风格 | 适用场景 |
|---|---|---|---|
| textstyle_opening_boom | 开场爆炸式 | 红色爆炸框+黄色大字+弹入 | 强冲击力开场，如"饮品代工怎么选" |
| textstyle_opening_clean | 开场简洁式 | 白色大字+黄色侧边条+淡入 | 商务风格开场，企业介绍/品牌故事 |

### 02_重点强调（2个）

| ID | 名称 | 风格 | 适用场景 |
|---|---|---|---|
| textstyle_emphasis_block | 重点色块式 | 黄色半透明底板+黑字+弹入 | 核心卖点、关键结论，任何背景都清晰 |
| textstyle_emphasis_underline | 重点下划线式 | 白色粗体+黄色下划线+淡入 | 简洁优雅的强调，B-roll画面标注 |

### 03_划重点（2个）

| ID | 名称 | 风格 | 适用场景 |
|---|---|---|---|
| textstyle_keypoint_yellow | 划重点黄色式 | 黄色圆角底板+黑字+弹入 | 知识点、注意事项，像便签纸 |
| textstyle_keypoint_red | 划重点红色式 | 红色圆角底板+白字+抖动 | 警告、避坑、重要提醒，有警示感 |

### 04_数据突出（2个）

| ID | 名称 | 风格 | 适用场景 |
|---|---|---|---|
| textstyle_data_big | 数据大字式 | 超大黄色数字+白色小单位+淡入 | 关键数据，如"20年"、"10万+"、"99%" |
| textstyle_data_with_unit | 数据带单位式 | 白色数字+黄色单位+图标+滑入 | 带图标和单位的数据，如"自有工厂"+工厂图标 |

### 05_情绪表达（1个）

| ID | 名称 | 风格 | 适用场景 |
|---|---|---|---|
| textstyle_shock_warning | 震惊警告式 | 红色底板+白字+抖动+惊讶表情 | "没想到"、"震惊"、"警告"、"避坑" |

### 06_结尾引导（1个）

| ID | 名称 | 风格 | 适用场景 |
|---|---|---|---|
| textstyle_ending_follow | 结尾引导式 | 蓝色半透明底板+白字+从右滑入 | 结尾关注/联系/合作引导 |

## 模板结构说明

每个花字模板 JSON 包含以下字段：

```json
{
  "id": "textstyle_opening_boom",
  "name": "开场爆炸式",
  "category": "opening",
  "description": "...",
  "version": "1.0",
  "status": "provisional",
  "assStyle": {
    "fontName": "Microsoft YaHei",
    "fontSize": 96,
    "primaryColor": "&H0024BBFB",
    "outlineColor": "&H00000000",
    "bold": true,
    "outline": 6,
    "shadow": 2,
    "alignment": 5,
    "marginL": 60,
    "marginR": 60,
    "marginV": 400
  },
  "decorations": [
    {
      "type": "sticker",
      "assetId": "sticker_explosion_red",
      "position": "behind_text",
      "scale": 1.8,
      "opacity": 0.95
    }
  ],
  "animation": {
    "in": "pop_in",
    "inDuration": 400,
    "out": "fade_out",
    "outDuration": 200
  },
  "usage": "...",
  "tags": ["开场", "爆炸", "大标题"]
}
```

### 关键字段说明

- **assStyle**：ASS 字幕样式，Renderer 直接用于生成 ASS Dialogue
- **decorations**：装饰元素列表，支持 sticker（贴纸）和 graphic（图形）
  - `position`: behind_text（文字后面）、left_of_text、right_of_text、below_text
  - `scale`: 缩放比例
  - `opacity`: 透明度
- **animation**：动画参数
  - `in`/`out`: 入场/出场动画类型
  - `inDuration`/`outDuration`: 动画时长（毫秒）
  - 支持的动画类型：fade_in、pop_in、shake_in、slide_up、slide_right、fade_in_scale

## 支持的动画类型

| 动画类型 | 效果 | 适用场景 |
|---|---|---|
| fade_in | 淡入（透明度0→1） | 通用，简洁不突兀 |
| pop_in | 弹入（缩放0→1.2→1.0） | 重点、强调，有弹性 |
| shake_in | 抖动入场（左右抖动后稳定） | 警告、震惊、避坑 |
| slide_up | 从下往上滑入 | 数据、信息出现 |
| slide_right | 从右往左滑入 | 结尾引导、侧边信息 |
| fade_in_scale | 淡入+轻微放大（0.8→1.0） | 数据大字，有高级感 |

## 使用原则

- ✅ 一条视频使用 2-3 种花字模板，不要每种都用
- ✅ 开场用 opening 类，中间用 emphasis/keypoint/data 类，结尾用 ending 类
- ✅ 同屏花字不超过 1 个（避免和字幕、贴纸冲突）
- ✅ 花字位置避开主体（人脸、产品）和字幕区域
- ❌ 不要每条字幕都用花字模板（花字是强调，不是普通字幕）
- ❌ 不要一屏同时出现花字+信息卡+贴纸+大字幕（过载）
- ❌ 不要在 1080×1920 竖屏上用超过 100 号的字（会溢出）

## Renderer 集成方式

### Timeline 引用

```json
{
  "titleTrack": [
    {
      "id": "title_001",
      "text": "饮品代工怎么选",
      "styleId": "textstyle_opening_boom",
      "start": 0,
      "duration": 3
    }
  ]
}
```

### 渲染流程

```
Timeline (titleTrack.styleId)
    ↓
TextStyleResolver (根据 styleId 读取模板 JSON)
    ↓
ASSGenerator
    ├── 应用 assStyle 生成 ASS Dialogue
    ├── 应用 animation 生成 ASS 动画标签（\fad、\t、\fscx等）
    └── 处理关键词高亮
    ↓
OverlayCompositor
    ├── 加载 decorations 中的 sticker/graphic
    ├── 按 position（behind_text/left_of_text等）计算位置
    └── FFmpeg overlay 合成
    ↓
final.mp4
```

## 后续扩展计划

- [ ] V1.1：增加更多开场模板（科技感、温馨、悬念）
- [ ] V1.2：增加动态花字（逐字出现、打字机效果）
- [ ] V1.3：增加行业专属模板（饮品、食品、制造业）
- [ ] V1.4：从剪映/AE模板提取设计灵感，优化现有模板
- [ ] V2.0：支持花字模板自动匹配（根据文案内容自动选模板）

## 重新生成

如需修改模板样式或重新生成：

```bash
python scripts/generate_text_styles.py
```

修改脚本中的颜色、字号、装饰元素、动画参数后重新运行即可。

## 状态说明

当前所有模板状态为 `provisional`（ provisional = 暂定的，待确认）。

升级为 `confirmed`（确认）的条件：
1. 在真实视频中使用并人工看片确认效果
2. 字号、位置、颜色、动画都经过实际验证
3. 在多种画面背景下都清晰可读

确认后修改模板 JSON 中的 `"status": "confirmed"`。
