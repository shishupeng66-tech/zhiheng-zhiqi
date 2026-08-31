# Zhiheng Renderer Phase 2D —— 素材库集成执行报告

## 1. 本轮目标

将已建好的素材库（音效库30个、贴纸库29个、花字模板库10个、字体库8款）正式集成到 Zhiheng Renderer，使 Renderer 能消费：
- 贴纸叠加（overlayTrack sticker 类型）
- BGM 循环播放
- SFX 时间点插入
- 多轨音频混音（voice + BGM + SFX）

## 2. 新增/修改文件

### 新增
- `src/engines/zhiheng-renderer/packaging-asset-resolver.ts` — 包装素材解析器（音效/贴纸/花字/字体 assetId → 真实路径）
- `scripts/test-zhiheng-renderer-phase2d-packaging.ts` — Phase 2D 测试脚本

### 修改
- `src/engines/zhiheng-renderer/types.ts` — OverlayTypeSchema 增加 'sticker' 类型
- `src/engines/zhiheng-renderer/renderer.ts` — 集成 PackagingAssetResolver、sticker overlay 分支、bgm/sfx 解析、Capability 更新、版本号 0.2.0-phase2d
- `src/engines/zhiheng-renderer/compose.ts` — 多轨音频 filter_complex（voice+BGM循环+SFX延迟+amix）、ffmpeg 输入增加 -stream_loop -1、音频映射改 -map [outa]
- `src/engines/zhiheng-renderer/validator.ts` — 删除旧 bgm/sfx 不支持 warning

## 3. PackagingAssetResolver 结构

统一读取各素材库 index.json，assetId → 真实文件路径。

支持四种素材类型：
- `sound_asset` — 音效（sfx_/bgm_/ambient_ 前缀）
- `sticker_asset` — 贴纸（sticker_ 前缀）
- `textstyle_asset` — 花字模板（textstyle_ 前缀）
- `font_asset` — 字体（font_ 前缀）

自动按 ID 前缀检测类型，无需调用方指定。

提供方法：
- `resolve(assetId, assetType?)` — 解析单个素材
- `getAllSoundIds()` / `getAllStickerIds()` / `getAllTextStyleIds()`
- `getStats()` — 各库素材数量统计
- `reload()` — 重新加载 index.json

## 4. 贴纸集成

- Timeline overlayTrack 新增 `type: "sticker"`
- sticker 类型用 PackagingAssetResolver 解析贴纸库 PNG，不用普通 AssetResolver
- 默认贴纸尺寸 160×160（由 styleId 控制，Timeline 不提供像素宽高）
- 通过 FFmpeg overlay 滤镜叠加，支持透明 PNG
- 测试用贴纸：sticker_star_yellow（黄色星星）、sticker_arrow_down_yellow（向下箭头）

## 5. BGM 循环

- Timeline bgmTrack 引用 assetId（如 bgm_corporate_light_01）
- PackagingAssetResolver 解析到音效库 BGM 文件
- ffmpeg 输入使用 `-stream_loop -1` 无限循环
- filter_complex 处理：volume → atrim 限制时长 → afade 淡入0.5s → afade 淡出1s
- 测试 BGM：bgm_corporate_light_01（轻快商务BGM），volume=0.25

## 6. SFX 时间点

- Timeline sfTrack 引用 assetId + start 时间
- ffmpeg 输入使用普通 `-i`（不循环）
- filter_complex 处理：adelay 延迟到 start 时间（双声道 delay|delay）→ volume
- 测试 SFX：
  - sfx_ding_clean_01 — 开场 0.1s，volume=0.6
  - sfx_notification_pop_03 — 信息卡 11.2s，volume=0.5
  - sfx_chime_bell_04 — OEM强调 14.0s，volume=0.5

## 7. 多轨音频混音

音频 filter_complex 结构：
```
voice: volume → [voice_in]
BGM:   volume + atrim + afade(in/out) → [bgm0]
SFX:   adelay + volume → [sfx0], [sfx1], [sfx2]
混合:  [voice_in][bgm0][sfx0][sfx1][sfx2] amix=inputs=N:duration=first:dropout_transition=0:normalize=0 → [outa]
```

- amix duration=first：以第一轨（voice）时长为准，避免 BGM 循环导致无限输出
- normalize=0：不自动归一化音量，保留各轨原始音量比例
- 最终输出映射 `-map [outa]`

## 8. Capability 更新

ZhihengRenderer V0.2（Phase 2D）：
- sourceTrim=true
- multiSegmentConcat=true
- scaleCrop=true
- hdrToneMap=true
- assSubtitles=true
- keywordHighlight=true
- titleTrack=true
- overlayTrack=true（含 sticker）
- bgmTrack=true
- sfxTrack=true
- voiceMix=true
- outputProfile=true
- transitions=["hard_cut"]

## 9. 真实测试结果

测试脚本：`scripts/test-zhiheng-renderer-phase2d-packaging.ts`

测试配置：
- 20秒完整包装视频
- 7段视频（SDR+HLG混合）
- 无配音（voiceTrack=[]）
- 7条字幕 + 关键词高亮
- 2个标题（hook + emphasis）
- 5个overlay（2个title_panel accent bar + 1个info_card + 2个sticker）
- 1条BGM（循环，volume=0.25）
- 3条SFX（时间点插入）

输出：
- 路径：`tmp/zhiheng-renderer/phase2d-packaging-20s/render-1788080444139-63d72d12/final.mp4`
- 大小：27.01 MB
- 渲染耗时：30.51s
- errors: 0
- warnings: 1（segment 4 缺少 color_transfer 元数据，正常）

ffprobe 验证：
- 视频：H.264, 1080×1920, yuv420p, BT.709, 30fps, 20.000s
- 音频：AAC, 48000Hz, 2声道, 20.000s
- 时长精确：expected=20.000s, final=20.000s, diff=0.000s

抽帧验证：
- frame_1s：黄色星星贴纸（右上角）+ hook标题 + 字幕关键词高亮 ✓
- frame_12s：info_card 背景 + 字幕 ✓
- frame_15s：向下箭头贴纸（顶部中间）+ emphasis标题 + 字幕关键词高亮 ✓

## 10. 遇到的问题与修复

### 问题1：PowerShell 破坏 TypeScript 模板字符串
- 现象：renderer.ts 中多处反引号 `` ` `` 和 `${}` 被 PowerShell 解释为转义字符和变量插值，导致语法错误
- 修复：用普通字符串拼接（'...' + var + '...'）替换所有被破坏的模板字符串

### 问题2：validator.ts 旧的 bgm/sfx 不支持 warning
- 现象：validator.ts 第142-151行有旧的 warning 逻辑（"已定义 N 条，但 V0.1 Renderer 不执行"），与新 Capability 冲突
- 修复：删除该段 warning，改为注释

### 问题3：PackagingAssetResolver.getStats() 可选链 bug
- 现象：`this.soundIndex?.assets.length` 可选链只检查了 `this.soundIndex`，没检查 `assets`，当 soundIndex 存在但 assets 为 undefined 时报错
- 修复：所有 `?.assets.length` 改为 `?.assets?.length`

### 问题4：graphic 生成时把 sticker 类型也传进去
- 现象：generateAllGraphics 接收整个 overlayTrack，对 sticker 类型尝试生成 graphic，导致 "Graphic style not found: sticker.default"
- 修复：调用 generateAllGraphics 前过滤掉 sticker/image/logo 类型，只传 badge/title_panel/info_card

### 问题5：filterComplexStr 构建顺序错误（关键 bug）
- 现象：`filterComplexStr = filterComplexParts.join(';')` 在音频 filter 加入之前就构建好了，导致音频 filter 没进最终 filter_complex 字符串，ffmpeg 报错 "Output with label 'outa' does not exist"
- 修复：把 filterComplexStr 构建移到音频 filter 加入之后

### 问题6：compose.ts 文件换行符丢失
- 现象：删除旧 filterComplexStr 时用 `Set-Content -NoNewline` 导致整个文件变成一行，TypeScript 无法解析
- 修复：用 Write 工具重写整个 compose.ts，确保换行正确

## 11. 尚未支持能力

- 花字模板库（textstyle_*）集成到 ASS Generator — 当前花字模板 JSON 已建好，但 ASS Generator 还没有消费逻辑
- 动效/动画系统（入场/出场动画）— 当前动画参数内嵌在花字模板 JSON 中，Renderer 未实现
- 字体库正式集成 — NotoSansSC-VF.ttf 已复制到 assets/05_字体库/，但 ASS Generator 还没有正式使用
- BGM/SFX 音量曲线（当前只支持固定 volume）
- 多 voice track（当前只支持单 voice）
- 音频淡入淡出时长可配置（当前硬编码 0.5s/1.0s）
- 特效视频库（光效/粒子/转场视频）— 尚未建设

## 12. 视觉样式状态

所有 Style Registry 样式仍为 **provisional**：
- subtitle.default / subtitle.keyword
- title.hook / title.emphasis / title.badge / title.card_title / title.card_subtitle
- panel.default / panel.hook / panel.accent_bar
- badge.default / badge.oem / badge.factory / badge.dark / badge.accent
- card.info / card.small / card.accent

花字模板库所有模板状态为 **provisional**。

需人工看片确认后升级为 confirmed。

## 13. 下一阶段建议

### Phase 2E（花字模板集成）
- ASS Generator 根据 styleId 读取花字模板 JSON
- 应用模板中的 assStyle + decorations + animation
- 支持入场/出场动画（\fad, \move, \t 等 ASS 标签）

### Phase 2F（视觉样式调优）
- 基于人工看片反馈，调整 Style Registry 参数
- 升级 provisional → confirmed
- 统一包装视觉语言（品牌色、圆角、留白、字号比例）

### Phase 3（Agent 接入）
- Agent 根据脚本和素材库自动生成 Unified Timeline
- 自动选择贴纸/BGM/SFX/花字模板
- 端到端自动剪辑流程

## 14. 结论

Phase 2D 素材库集成成功完成：
- 贴纸叠加 ✓
- BGM 循环 ✓
- SFX 时间点 ✓
- 多轨音频混音 ✓
- PackagingAssetResolver ✓
- Capability 声明准确 ✓
- 真实测试视频生成 ✓

技术链路已打通，Renderer 能正式消费素材库。视觉样式仍需人工调优，花字模板集成留待下一阶段。
