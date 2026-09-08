# 模板使用器（第二层 Skill）

> 状态:测试中 · 版本 0.1.0 · id: zhiheng-template-usage
> 作用:读模板资产 → 填新文案 + 新素材 → 生成新剪映草稿
> 前置:必须先加载第三层 `template-editing-rules`

## 定位

用户说"按 XX 模板，剪一条 XX 饮料的视频"时，本 Skill 负责执行：

```
用户一句话
  → 解析任务（客户/产品/平台/是否指定模板）
  → 选模板（指定 or 从模板库检索）
  → 读模板资产（textSlots + mediaSlots + 约束）
  → LLM 按约束生成替换文案（等字数）
  → 素材库按语义检索素材
  → step4 替换 → 新草稿
  → step5 结构验证
  → 验收清单 → 用户剪映验收
```

## 模板库

```
D:\知衡智企数据库\知识库\05_模板\企业模板\<templateId>\
  └── template-asset.json
```

模板资产属于企业知识库，不随 Skill 源码提交。运行时必须通过 `resolveWorkspaceAsset('templateRoot')` 解析真实目录。

## 执行步骤

### Step 1 选模板
- 用户指定 → 查模板资产，确认可用（approved/testing）
- 未指定 → 按内容类型/时长/画幅从模板库检索
- 无合适模板 → 阻断并提示先选择已有企业模板或蒸馏剪映草稿

### Step 2 读资产
读 template-asset.json，拿到:
- textSlots（每个槽的原文/字数/角色/资源类型）
- mediaSlots（每个槽的时间段/语义）
- constraintMode（EXACT_CHAR_COUNT）

### Step 3 LLM 生成替换文案
输入: 槽位列表 + 约束 + 业务上下文（客户/产品/口播目标）
输出: 每个槽的新文本（**严格等字数**）

品牌词槽（如"河南浩明饮品"）与硬实力词槽（如"万级洁净车间"）默认保留。

### Step 4 素材检索
按 mediaSlots 语义从素材索引检索:
- `resolveWorkspaceAsset('videoRoot')\video-assets-detailed.json`
- 优先: 竖屏素材 > 语义匹配 > 质量等级

### Step 5 替换执行
```bash
python step4_fill.py <母版草稿目录> <明文draft_content.json> <资产JSON> <输出草稿名>
```
- 复制母版 → 替换文字（等字数）+ 视频（path/duration/width/height）→ 明文写回

### Step 6 结构验证
```bash
python step5_verify.py <母版明文> <填充后draft_content.json>
```
- diff PASS 才能交付；FAIL 则回查并修复

### Step 7 验收清单
生成 review JSON + comparison MD：
- 每个槽位: 原文/新文/字数/时间点/资源类型
- 状态: PENDING_USER_REVIEW
- 用户在剪映确认后 → HUMAN_APPROVED

## 约束（来自第三层，摘要）

- 文字必须等字数替换
- 禁止自动缩放/换行/移位置/改字号
- 禁止覆盖 text_template 的 JSON 样式结构
- 搭配组必须整体替换
- BGM/贴纸/特效/转场零改动
- 母版只读，复制出新草稿

## 禁止

1. 跳过第三层规则直接操作
2. 无合适模板时硬套模板
3. 程序自动宣布视觉 PASS
4. 修改母版原草稿
