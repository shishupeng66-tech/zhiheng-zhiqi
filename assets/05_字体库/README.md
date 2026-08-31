# 知衡智企「智剪」字体库 V1.0

## 概述

知衡智企自动剪辑系统的官方字体库，包含 8 款中文字体，覆盖正文、字幕、标题、花字、装饰等使用场景。

## 字体清单

| ID | 名称 | 字重 | 来源 | 授权 | 推荐用途 |
|---|---|---|---|---|---|
| font_msyh_regular | 微软雅黑 | 常规 | Windows系统 | 系统授权 | 正文、字幕 |
| font_msyh_bold | 微软雅黑粗体 | 粗体 | Windows系统 | 系统授权 | 大标题、花字、强调 |
| font_msyh_light | 微软雅黑细体 | 细体 | Windows系统 | 系统授权 | 副标题、说明文字 |
| font_noto_sans_sc | 思源黑体 | 可变 | Google/Adobe | SIL OFL 1.1（开源免费） | 跨平台交付、正文、标题 |
| font_simhei | 黑体 | 常规 | Windows系统 | 系统授权 | 标题、装饰、大字报 |
| font_simsun | 宋体 | 常规 | Windows系统 | 系统授权 | 正文、传统风格 |
| font_simkai | 楷体 | 常规 | Windows系统 | 系统授权 | 手写风格、引用 |
| font_simfang | 仿宋 | 常规 | Windows系统 | 系统授权 | 公文风格、正式文件 |

## 默认字体配置

```json
{
  "subtitle": "font_msyh_regular",
  "subtitleKeyword": "font_msyh_bold",
  "title": "font_msyh_bold",
  "titleHook": "font_msyh_bold",
  "titleEmphasis": "font_msyh_bold",
  "textStyle": "font_msyh_bold",
  "crossPlatform": "font_noto_sans_sc"
}
```

## Bundled 字体

当前字体库自带 1 款开源字体：

- **NotoSansSC-VF.ttf**（思源黑体，17.4 MB）
  - 来源：Google / Adobe
  - 授权：SIL Open Font License 1.1
  - 特点：可变字体（Variable Font），支持多种字重
  - 用途：跨平台交付时使用，避免目标机器没有微软雅黑

## 字体使用原则

### Windows 环境（当前开发环境）
- 主力字体：微软雅黑（msyh.ttc / msyhbd.ttc）
- 原因：Windows 自带，渲染效果好，企业视频常用

### 企业交付环境
- 优先使用：思源黑体（NotoSansSC-VF.ttf，bundled）
- 原因：开源免费，可随项目分发，无版权风险
- Fallback：如果目标机器有微软雅黑，可优先使用微软雅黑

### 字体选择建议
| 场景 | 推荐字体 | 字号范围（1080×1920） |
|---|---|---|
| 底部字幕 | 微软雅黑常规 | 48-60 |
| 关键词高亮 | 微软雅黑粗体 | 54-72 |
| 开场大标题 | 微软雅黑粗体 | 80-120 |
| 花字模板 | 微软雅黑粗体 | 64-96 |
| 副标题/说明 | 微软雅黑细体 | 36-48 |
| 数据大字 | 微软雅黑粗体 | 100-160 |
| 装饰/手写风格 | 楷体 | 48-72 |

## 注意事项

1. **微软雅黑版权**：微软雅黑是 Windows 系统字体，可随系统使用，但单独分发字体文件可能有版权限制。企业交付时建议使用思源黑体。
2. **可变字体支持**：NotoSansSC-VF.ttf 是可变字体，ASS 和 FFmpeg 对可变字体的字重选择支持可能不完善。如遇问题，可下载固定字重版本（NotoSansSC-Regular.otf / NotoSansSC-Bold.otf）。
3. **字体回退**：Renderer 应实现字体回退机制——优先使用指定字体，如果不存在则使用系统默认中文字体。
4. **字体缓存**：FFmpeg/libass 会缓存字体，更换字体后可能需要清除缓存才能生效。

## Renderer 集成方式

### ASS 字体指定
```ass
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, ...
Style: Default, Microsoft YaHei, 54, &H00FFFFFF, ...
```

### 字体目录配置
FFmpeg libass 字体搜索路径：
1. 系统字体目录（C:\Windows\Fonts）
2. 项目字体目录（assets/05_字体库）
3. ASS 文件同目录

## 后续扩展计划

- [ ] V1.1：下载 Noto Sans SC 固定字重版本（Regular/Bold），替代可变字体
- [ ] V1.2：增加装饰字体（如站酷快乐体、庞门正道标题体等免费商用字体）
- [ ] V1.3：增加英文字体（Montserrat、Inter 等开源字体）
- [ ] V2.0：字体自动匹配（根据视频风格自动选字体）

## 重新生成

字体库为静态资源，无需生成脚本。如需添加新字体：
1. 将字体文件放入 `assets/05_字体库/` 目录
2. 在 `index.json` 的 `fonts` 数组中添加字体信息
3. 在 `fontMapping` 中配置使用场景映射
