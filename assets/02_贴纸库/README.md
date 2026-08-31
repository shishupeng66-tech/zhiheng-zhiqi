# 知衡智企「智剪」贴纸库 V1.0

## 概述

知衡智企自动剪辑系统的官方贴纸素材库，包含 29 个透明背景 PNG 贴纸，覆盖指示箭头、圈注标记、装饰元素、图标、文字贴纸、Emoji 风格 6 大类。

## 来源与授权

- **来源**：自制（Python + Pillow 生成）
- **生成脚本**：`scripts/generate_stickers.py`
- **授权**：自有版权，可自由商用、修改、分发
- **生成日期**：2026-08-30

## 目录结构

```
assets/02_贴纸库/
├── index.json                    # 素材索引（唯一 source of truth）
├── README.md                     # 本说明文档
├── 01_指示箭头/                  # 6个 - 方向指示、引导视线
├── 02_圈注标记/                  # 5个 - 圈重点、下划线、高亮
├── 03_装饰元素/                  # 5个 - 星星、爆炸、圆点、侧边条
├── 04_图标/                      # 5个 - 工厂、对勾、奖杯、证书、齿轮
├── 05_文字贴纸/                  # 4个 - 划重点、注意、小提示、重点
└── 06_Emoji/                     # 4个 - 惊讶、点赞、思考、火焰
```

## 素材清单

### 01_指示箭头（6个）

| ID | 名称 | 尺寸 | 适用场景 |
|---|---|---|---|
| sticker_arrow_down_yellow | 向下箭头(黄) | 512×512 | 指示下方内容、引导视线向下 |
| sticker_arrow_up_yellow | 向上箭头(黄) | 512×512 | 指示上方内容 |
| sticker_arrow_left_white | 向左箭头(白) | 512×512 | 指示左侧内容 |
| sticker_arrow_right_white | 向右箭头(白) | 512×512 | 指示右侧内容 |
| sticker_arrow_downleft_yellow | 左下箭头(黄) | 512×512 | 指示左下方 |
| sticker_arrow_downright_yellow | 右下箭头(黄) | 512×512 | 指示右下方 |

### 02_圈注标记（5个）

| ID | 名称 | 尺寸 | 适用场景 |
|---|---|---|---|
| sticker_circle_red | 红色圆圈 | 512×512 | 圈出画面重点、人物、产品 |
| sticker_circle_yellow | 黄色圆圈 | 512×512 | 圈出重点（黄色更柔和） |
| sticker_underline_red | 红色下划线 | 512×128 | 给关键词加下划线 |
| sticker_highlight_yellow | 黄色高亮条 | 512×160 | 半透明高亮文字（类似荧光笔） |
| sticker_wavy_underline_red | 红色波浪下划线 | 512×128 | 波浪线下划线，更活泼 |

### 03_装饰元素（5个）

| ID | 名称 | 尺寸 | 适用场景 |
|---|---|---|---|
| sticker_star_yellow | 黄色星星 | 512×512 | 五星好评、品质、亮点装饰 |
| sticker_sparkle_white | 白色四角星 | 512×512 | 闪光、星光、亮点装饰 |
| sticker_explosion_red | 红色爆炸框 | 512×512 | 重磅信息、爆炸式强调 |
| sticker_dot_yellow | 黄色圆点 | 256×256 | 列表项、要点标记 |
| sticker_accent_bar_yellow | 黄色侧边条 | 32×512 | 标题左侧装饰条、强调 |

### 04_图标（5个）

| ID | 名称 | 尺寸 | 适用场景 |
|---|---|---|---|
| sticker_icon_check_green | 绿色对勾 | 512×512 | 正确、认证、通过、品质保证 |
| sticker_icon_factory_blue | 蓝色工厂 | 512×512 | 工厂、生产、制造、自有工厂 |
| sticker_icon_trophy_orange | 橙色奖杯 | 512×512 | 荣誉、奖项、品质、实力 |
| sticker_icon_certificate_blue | 蓝色证书 | 512×512 | 认证、资质、证书、合规 |
| sticker_icon_gear_gray | 灰色齿轮 | 512×512 | 设备、工艺、技术、生产 |

### 05_文字贴纸（4个）

| ID | 名称 | 尺寸 | 适用场景 |
|---|---|---|---|
| sticker_text_keypoint_red | 划重点(红底白字) | 512×200 | 重点信息、核心卖点 |
| sticker_text_attention_yellow | 注意(黄底黑字) | 512×200 | 提醒、注意事项、避坑 |
| sticker_text_tip_blue | 小提示(蓝底白字) | 512×180 | 小贴士、知识点、补充信息 |
| sticker_text_important_orange | 重点(橙底白字) | 380×180 | 重要信息、关键数据 |

### 06_Emoji风格（4个）

| ID | 名称 | 尺寸 | 适用场景 |
|---|---|---|---|
| sticker_emoji_surprise | 惊讶表情 | 512×512 | 震惊、意外、没想到 |
| sticker_emoji_thumbsup | 点赞表情 | 512×512 | 认可、棒、好、推荐 |
| sticker_emoji_thinking | 思考表情 | 512×512 | 思考、疑问、想想看 |
| sticker_emoji_fire | 火焰 | 512×512 | 热门、火爆、厉害、重点 |

## 颜色方案

| 颜色 | 色值 | 用途 |
|---|---|---|
| 黄色 | #FBBF24 | 主强调色、箭头、星星、高亮 |
| 红色 | #EF4444 | 警告、圈注、爆炸框、划重点 |
| 蓝色 | #3B82F6 | 信息、品牌、工厂、证书 |
| 橙色 | #F97316 | 重点、奖杯、活力 |
| 绿色 | #22C55E | 正确、对勾、通过 |
| 白色 | #FFFFFF | 文字、图标、箭头 |
| 黑色 | #000000 | 描边、文字 |

## 使用指南

### 贴纸大小建议

| 贴纸类型 | 建议显示尺寸（1080×1920画面） | 说明 |
|---|---|---|
| 箭头 | 100-150px | 不要太大，指示即可 |
| 圆圈 | 200-400px | 根据圈注对象大小调整 |
| 星星/闪光 | 60-120px | 小装饰，点缀即可 |
| 图标 | 120-180px | 中等大小，清晰可辨 |
| 文字贴纸 | 300-450px宽 | 根据文字长度调整 |
| Emoji | 100-150px | 不要太大，避免幼稚 |

### 典型使用场景

1. **产品介绍**：工厂图标 + 对勾图标 + 黄色箭头指示产品
2. **重点数据**：爆炸框 + 文字贴纸"重点" + 红色圆圈圈出数据
3. **避坑提醒**：文字贴纸"注意" + 红色下划线 + 惊讶表情
4. **品质证明**：奖杯图标 + 证书图标 + 对勾图标 + 星星装饰
5. **列表要点**：黄色圆点 + 文字贴纸"划重点" + 蓝色小提示
6. **情绪表达**：点赞表情 + 火焰 + 思考表情（少量使用）

### 使用原则

- ✅ 一屏贴纸不超过 3 个
- ✅ 贴纸放在画面空白区域，不挡主体
- ✅ 同屏贴纸颜色不超过 3 种
- ✅ 箭头/圆圈等指示性贴纸要明确指向重点
- ❌ 不要满屏贴纸，显得杂乱
- ❌ 不要用贴纸挡人脸、产品、文字
- ❌ 企业视频不要过度使用 Emoji（显得不专业）

## Renderer 集成方式

### Timeline 引用

```json
{
  "overlayTrack": [
    {
      "id": "sticker_001",
      "type": "sticker",
      "assetRef": {
        "type": "sticker_asset",
        "assetId": "sticker_arrow_down_yellow"
      },
      "anchor": "bottom_center",
      "start": 2.0,
      "duration": 3.0,
      "scale": 0.3,
      "opacity": 0.9
    }
  ]
}
```

### 渲染流程

```
Timeline (overlayTrack type=sticker)
    ↓
StickerAssetResolver (根据 assetId 查 index.json → PNG路径)
    ↓
OverlayCompositor
    ├── scale (按 scale 参数缩放)
    ├── opacity (透明度)
    ├── anchor + LayoutRegistry (计算位置)
    └── FFmpeg overlay (alpha 合成)
    ↓
final.mp4
```

## 后续扩展计划

- [ ] V1.1：补充装饰元素（闪光、线条、边框、对话框）
- [ ] V1.2：增加行业图标（饮料、食品、包装、物流）
- [ ] V1.3：增加动态贴纸（GIF/APNG/序列帧）
- [ ] V1.4：从 OpenMoji、Flaticon 补充更多免费贴纸
- [ ] V2.0：支持贴纸自动匹配（根据画面内容自动选贴纸）

## 重新生成

如需修改贴纸样式或重新生成：

```bash
python scripts/generate_stickers.py
```

修改脚本中的颜色、尺寸、形状参数后重新运行即可。
