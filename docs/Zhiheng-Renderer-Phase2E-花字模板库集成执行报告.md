# Zhiheng Renderer Phase 2E —— 花字模板库集成执行报告

## 1. 本轮目标

将已建好的花字模板库（10个模板）正式集成到 Zhiheng Renderer，使 Renderer 能：
- 根据 titleTrack 的 styleId（textstyle_* 开头）从花字模板库读取模板
- 应用模板的 assStyle（字体、字号、颜色、对齐、边距）
- 应用模板的 animation（入场/出场动画）
- 将模板的 decorations（sticker）自动转为 overlay
- graphic decoration V0.1 暂不支持，记录 warning

## 2. 新增/修改文件

### 修改
- `src/engines/zhiheng-renderer/packaging-asset-resolver.ts` — 增加花字模板类型定义（TextStyleTemplate 等）和 `getTextStyle(assetId)` 方法
- `src/engines/zhiheng-renderer/ass-generator.ts` — 重写，支持花字模板 styleId、动画标签生成、textStyleOverlays 返回
- `src/engines/zhiheng-renderer/renderer.ts` — AssGenerator 传入 textStyleResolver；ASS 生成后转换 textStyleOverlays 为 sticker overlay；overlay 循环使用合并数组
- `src/engines/zhiheng-renderer/validator.ts` — 对 textstyle_ 开头的 styleId 跳过 Style Registry 检查

### 新增
- `scripts/test-zhiheng-renderer-phase2e-textstyle.ts` — Phase 2E 测试脚本

## 3. 花字模板库结构

- 根目录：`assets/03_花字模板库/`
- 根 index.json：包含10个模板的元数据（id, name, category, file, tags, status）
- 模板文件：按分类目录组织，每个模板一个独立 JSON 文件
  - 01_开场标题：textstyle_opening_boom, textstyle_opening_clean
  - 02_重点强调：textstyle_emphasis_block, textstyle_emphasis_underline
  - 03_划重点：textstyle_keypoint_red, textstyle_keypoint_yellow
  - 04_数据突出：textstyle_data_big, textstyle_data_with_unit
  - 05_情绪表达：textstyle_shock_warning
  - 06_结尾引导：textstyle_ending_follow

## 4. 花字模板内部结构

每个模板 JSON 包含：
- `id` / `name` / `category` / `description` / `version` / `status` — 元数据
- `assStyle` — ASS 样式（fontName, fontSize, primaryColor, outlineColor, bold, alignment, marginL/R/V 等）
- `decorations` — 装饰元素数组
  - `type: "sticker"` — 引用贴纸库 assetId（如 sticker_accent_bar_yellow）
  - `type: "graphic"` — 生成图形（如 rounded_rect 圆角矩形）
  - `position` — 位置（left_of_text, behind_text 等）
  - `scale` / `opacity` / `offsetX` / `offsetY` / `paddingX` / `paddingY` / `cornerRadius`
- `animation` — 动画
  - `in` — 入场动画（fade_in, pop_in, shake_in, slide_up, slide_right, fade_in_scale）
  - `inDuration` — 入场时长（毫秒）
  - `out` — 出场动画
  - `outDuration` — 出场时长
  - `popScale` — 弹入缩放关键帧
- `usage` / `tags` — 使用说明和标签

## 5. ASS Generator 花字模板处理

### 5.1 样式生成
- 当 title.styleId 以 "textstyle_" 开头时，从 PackagingAssetResolver 读取模板
- 模板的 assStyle 直接映射为 ASS [V4+ Styles] 中的一行
- 样式名使用模板 id（如 textstyle_opening_clean）

### 5.2 动画标签生成
支持的动画类型及 ASS 标签映射：

| 动画类型 | ASS 标签 | 说明 |
|---------|---------|------|
| fade_in | `\fad(inDuration, outDuration)` | 淡入 |
| fade_out | 包含在 \fad 中 | 淡出 |
| fade_in_scale | `\fad + \fscx80\fscy80 + \t(0,in,\fscx100\fscy100)` | 淡入+缩放 |
| pop_in | `\fscx0\fscy0 + \t(0,in,\fscx100\fscy100)` | 从0弹入 |
| shake_in | 降级为 fade_in | V0.1 不实现抖动 |
| slide_up | 降级为 fade_in | V0.1 不实现位移 |
| slide_right | 降级为 fade_in | V0.1 不实现位移 |

降级时记录 warning："花字模板 XXX 的入场动画 YYY V0.1 降级为 fade_in"

### 5.3 装饰贴纸转换
- 模板的 decorations 中 type="sticker" 的元素，通过 `textStyleOverlays` 返回给 Renderer
- 每个 sticker 包含：assetId, position, scale, opacity, offsetX, offsetY, start, duration
- Renderer 将其转换为临时 overlay 对象，加入 overlay 处理循环

### 5.4 graphic decoration
- V0.1 不支持 graphic 类型 decoration（需要动态尺寸图形生成）
- 记录 warning："花字模板 XXX 的 graphic decoration V0.1 暂不支持，仅显示文字"
- 后续 Phase 可实现：根据模板的 backgroundColor/padding/cornerRadius 生成 PNG 背景

## 6. Renderer 集成

### 6.1 AssGenerator 创建
```typescript
const assGenerator = new AssGenerator(styleRegistry, {
  width: outputProfile.width,
  height: outputProfile.height,
  videoDuration: totalDuration,
  textStyleResolver: packagingResolver  // 新增
});
```

### 6.2 装饰贴纸转换
ASS 生成后，将 textStyleOverlays 转换为临时 overlay：
```typescript
const textStyleOverlaySegments: any[] = [];
for (const tso of assResult.textStyleOverlays) {
  // position -> anchor 映射（V0.1 简化）
  let anchor = 'top_left';
  if (tso.position === 'behind_text') anchor = 'center';
  else if (tso.position === 'left_of_text') anchor = 'top_left';
  textStyleOverlaySegments.push({
    id: 'textstyle_' + tso.titleId + '_dec' + tso.decorationIndex,
    type: 'sticker',
    assetRef: { type: 'library_asset', assetId: tso.assetId },
    styleId: 'sticker.default',
    anchor: anchor,
    start: tso.start,
    duration: tso.duration,
    transition: 'hard_cut'
  });
}
```

### 6.3 overlay 循环合并
```typescript
const allOverlays = [...(tl.overlayTrack || []), ...textStyleOverlaySegments];
for (const ov of allOverlays) { ... }
```

## 7. Validator 修改

对 titleTrack 中以 "textstyle_" 开头的 styleId，跳过 Style Registry 检查：
```typescript
if (styleId.startsWith('textstyle_')) continue;
```

花字模板的存在性由 ASS Generator 在运行时检查，不在 Timeline 验证阶段检查。

## 8. 真实测试结果

测试脚本：`scripts/test-zhiheng-renderer-phase2e-textstyle.ts`

测试配置：
- 20秒视频
- 7段视频（SDR+HLG混合）
- 7条字幕 + 关键词高亮
- 2个花字模板标题：
  - 开场：textstyle_opening_clean（白色88号字+左侧黄色装饰条+fade_in）
  - 中段：textstyle_emphasis_block（黑色72号居中字+pop_in弹入，graphic背景V0.1不支持）
- 手动 overlay：黄色星星、向下箭头、info_card
- BGM + 3个SFX

输出：
- 路径：`tmp/zhiheng-renderer/phase2e-textstyle-test/render-1788081814829-2a89bc6f/final.mp4`
- 大小：27.05 MB
- 渲染耗时：30.25s
- errors: 0
- warnings: 2
  - segment 4 缺少 color_transfer 元数据（正常）
  - textstyle_emphasis_block 的 graphic decoration V0.1 暂不支持（预期）

### 8.1 ASS 文件验证
- 花字模板样式正确生成：
  - `textstyle_opening_clean`: Microsoft YaHei, 88号, 白色, 左对齐(4), marginL=140, marginV=380
  - `textstyle_emphasis_block`: Microsoft YaHei, 72号, 黑色, 居中(5), marginV=500
- 动画标签正确生成：
  - opening_clean: `{\fad(500,300)}` — 500ms淡入, 300ms淡出
  - emphasis_block: `{\fad(200,200)\fscx0\fscy0\t(0,350,\fscx100\fscy100)}` — pop_in弹入

### 8.2 render.log 验证
- 花字模板装饰贴纸转换：1 个 sticker overlay（opening_clean 的 sticker_accent_bar_yellow）
- overlay textstyle_title_hook_001_dec0: x=48, y=60, t=0.00-2.80s

### 8.3 视觉验证（抽帧）
- frame_1s：开场花字标题白色88号字+左侧黄色装饰条+右上角星星贴纸+底部字幕关键词高亮 ✓
- frame_15s：emphasis花字标题黑色72号居中字+顶部向下箭头+底部字幕关键词高亮 ✓
- HLG 曝光正常，方向正确，无拉伸

## 9. 尚未支持能力

- graphic decoration（圆角矩形色块背景）— 需要 graphic-generator 支持动态尺寸
- shake_in / slide_up / slide_right 动画 — V0.1 降级为 fade_in
- 花字模板装饰贴纸的精确位置（相对于文字）— V0.1 用 anchor 简化映射
- 花字模板的 scale/opacity 应用到 sticker overlay — V0.1 使用默认尺寸
- 花字模板的 offsetX/offsetY — V0.1 未应用

## 10. 下一阶段建议

### Phase 2F（花字模板完善）
- 实现 graphic decoration（根据模板参数生成 PNG 背景）
- 实现 shake_in / slide_up / slide_right 动画
- 花字模板装饰贴纸的精确位置计算（相对于文字位置）
- 应用 scale/opacity/offsetX/offsetY 到 sticker overlay

### Phase 2G（视觉样式调优）
- 基于人工看片反馈，调整花字模板参数
- 升级 provisional → confirmed
- 统一包装视觉语言

### Phase 3（Agent 接入）
- Agent 根据脚本自动选择花字模板
- 端到端自动剪辑流程

## 11. 结论

Phase 2E 花字模板库集成成功完成：
- 花字模板 assStyle 正确应用 ✓
- 花字模板 animation（fade_in/pop_in）正确生成 ✓
- 花字模板 sticker decoration 自动转为 overlay ✓
- graphic decoration V0.1 不支持，有明确 warning ✓
- validator 对 textstyle_ 开头的 styleId 正确处理 ✓
- 真实测试视频生成 ✓

技术链路已打通，Renderer 能正式消费花字模板库。graphic decoration 和复杂动画留待下一阶段。
