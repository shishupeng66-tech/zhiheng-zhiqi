# 知衡智企「智剪」音效库 V1.0

## 概述

知衡智企自动剪辑系统的官方音效素材库，包含 30 个免费商用音效，覆盖提示音、转场音、强调音、环境音、背景音乐 5 大类。

## 来源与授权

- **来源**：Mixkit (https://mixkit.co)
- **授权**：Mixkit License - 免费商用，无需署名
- **下载日期**：2026-08-30
- **下载方式**：Mixkit CDN 直链批量下载

## 目录结构

```
assets/01_音效库/
├── index.json                    # 素材索引（唯一 source of truth）
├── README.md                     # 本说明文档
├── 01_提示音/                    # 10个 - 重点信息/标题/点击提示
├── 02_转场音/                    # 8个 - 镜头切换/场景转换
├── 03_强调音/                    # 6个 - 重磅信息/数据突出/情绪强调
├── 04_环境音/                    # 3个 - 场景氛围背景音
└── 05_BGM/                       # 3首 - 视频整体背景音乐
    └── 商务轻快/
```

## 素材清单

### 01_提示音（10个）

| ID | 名称 | 适用场景 |
|---|---|---|
| sfx_ding_clean_01 | 干净提示音 | 标题出现、重点提示 |
| sfx_ding_soft_02 | 柔和提示音 | 轻量信息提示 |
| sfx_notification_pop_03 | 弹出提示音 | 弹窗、关键词弹出 |
| sfx_chime_bell_04 | 风铃提示音 | 清新风格提示 |
| sfx_alert_simple_05 | 简单提醒音 | 注意、提醒 |
| sfx_ding_modern_06 | 现代提示音 | 科技感、现代风格 |
| sfx_chime_light_07 | 轻盈风铃音 | 轻盈、优雅提示 |
| sfx_notification_click_08 | 点击提示音 | 按钮点击、交互 |
| sfx_alert_quick_09 | 快速提醒音 | 短促、快速提示 |
| sfx_ding_minimal_10 | 极简提示音 | 极简风格、不抢戏 |

### 02_转场音（8个）

| ID | 名称 | 适用场景 |
|---|---|---|
| sfx_whoosh_swish_01 | 唰转场音 | 通用镜头切换 |
| sfx_whoosh_quick_02 | 快速转场音 | 快切、快速切换 |
| sfx_transition_sweep_03 | 扫过转场音 | 扫光、扫过转场 |
| sfx_whoosh_deep_04 | 深沉转场音 | 厚重、大场景切换 |
| sfx_transition_wind_05 | 风声转场音 | 自然风格转场 |
| sfx_whoosh_light_06 | 轻盈转场音 | 轻盈、快速切换 |
| sfx_transition_air_07 | 气流转场音 | 气流、空气感 |
| sfx_whoosh_fast_08 | 急速转场音 | 快节奏、急速切换 |

### 03_强调音（6个）

| ID | 名称 | 适用场景 |
|---|---|---|
| sfx_impact_heavy_01 | 沉重强调音 | 重磅信息、核心卖点 |
| sfx_boom_deep_02 | 低沉轰鸣音 | 开场冲击、大事件 |
| sfx_impact_punch_03 | 拳击强调音 | 有力、打击感 |
| sfx_riser_up_04 | 上升铺垫音 | 悬念铺垫、上升节奏 |
| sfx_impact_slam_05 | 猛击强调音 | 震撼、重击 |
| sfx_boom_drum_06 | 鼓点强调音 | 节奏点、鼓点强调 |

### 04_环境音（3个）

| ID | 名称 | 适用场景 |
|---|---|---|
| ambient_factory_01 | 工厂环境音 | 工厂画面、生产场景 |
| ambient_office_02 | 办公室环境音 | 办公室、商务场景 |
| ambient_crowd_03 | 人群环境音 | 展会、人群、嘈杂场景 |

### 05_BGM（3首）

| ID | 名称 | 适用场景 |
|---|---|---|
| bgm_corporate_light_01 | 轻快商务BGM | 企业宣传、产品介绍（通用） |
| bgm_business_upbeat_02 | 积极商业BGM | 活力、积极向上风格 |
| bgm_corporate_modern_03 | 现代企业BGM | 科技感、现代风格 |

## 使用指南

### 音量建议

| 类型 | 建议音量 | 说明 |
|---|---|---|
| 提示音 | 50-70% | 清晰但不刺耳 |
| 转场音 | 40-60% | 自然过渡，不突兀 |
| 强调音 | 60-80% | 突出重点，有冲击力 |
| 环境音 | 10-20% | 营造氛围，不盖过人声 |
| BGM | 15-25% | 背景音乐，人声出现时降到10% |

### 典型使用场景

1. **开场标题出现**：sfx_ding_clean_01 + bgm_corporate_light_01
2. **镜头切换**：sfx_whoosh_swish_01（每个转场配一个）
3. **重点信息/关键词**：sfx_notification_pop_03 或 sfx_ding_modern_06
4. **重磅数据/核心卖点**：sfx_impact_heavy_01 或 sfx_boom_drum_06
5. **工厂画面**：ambient_factory_01（低音量背景）
6. **悬念/铺垫**：sfx_riser_up_04
7. **结尾**：BGM 淡出 + sfx_chime_bell_04

## Renderer 集成方式

### Timeline 引用

```json
{
  "sfxTrack": [
    {
      "id": "sfx_001",
      "assetRef": {
        "type": "sound_asset",
        "assetId": "sfx_ding_clean_01"
      },
      "start": 0.5,
      "volume": 0.6
    }
  ],
  "bgmTrack": [
    {
      "id": "bgm_001",
      "assetRef": {
        "type": "sound_asset",
        "assetId": "bgm_corporate_light_01"
      },
      "start": 0,
      "volume": 0.2,
      "loop": true,
      "fadeOut": 2
    }
  ]
}
```

### 渲染流程

```
Timeline (sfxTrack / bgmTrack)
    ↓
SoundAssetResolver (根据 assetId 查 index.json → 文件路径)
    ↓
AudioMixer
    ├── BGM: 循环 + 音量 + 淡入淡出 + sidechaincompress(人声闪避)
    ├── SFX: 在指定时间点插入 + 音量
    ├── 环境音: 低音量循环
    └── 人声: 主音轨
    ↓
amix (多轨混音)
    ↓
FFmpeg
    ↓
final.mp4 (AAC 音频)
```

## 后续扩展计划

- [ ] V1.1：增加科技感、温馨、紧张悬念等 BGM 分类
- [ ] V1.2：增加 UI 交互音、打字音、倒计时音
- [ ] V1.3：增加转场音效包（匹配 xfade 转场类型）
- [ ] V1.4：从 Pixabay、Freesound 补充更多免费商用音效
- [ ] V2.0：支持音效自动匹配（根据画面内容/转场类型自动选音效）

## 版权声明

所有音效均来自 Mixkit，遵循 Mixkit License：
- ✅ 可免费商用
- ✅ 无需署名
- ✅ 可修改、剪辑
- ❌ 不可单独转售音效文件本身
- ❌ 不可用于违法、仇恨、歧视性内容

详细授权条款：https://mixkit.co/license/
