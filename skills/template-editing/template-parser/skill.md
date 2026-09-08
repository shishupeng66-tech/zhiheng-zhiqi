# 模板解析器（第一层 Skill）

> 状态:测试中 · 版本 0.1.0 · id: zhiheng-template-parser
> 作用:把人工剪映母版 → 可复用模板资产。**解析一次，永久复用**。

## 定位

用户给一个新的人工剪辑母版草稿时，先用本 Skill 解析成结构化模板资产。
以后 Agent 直接用资产，**不用每次重新解析**（避免浪费时间）。

```
人工剪映母版草稿（用户提供）
  → step1 解密
  → step2 逆向（文字槽 / 视频槽 / 轨道）
  → step3 生成模板资产 template-asset.json
  → 人工确认资产完整 → 入库
```

## 使用时机

- 用户提供新母版草稿目录（如"8月28日"）
- 用户说"把这个模板解析一下"
- 模板库没有该模板资产，需要新建

## 执行步骤

### Step 1 解密
```bash
python step1_decrypt.py <母版草稿目录> <输出明文目录>
```
产出: `draft-content-decrypted.json` / `draft-meta-info-decrypted.json`

### Step 2 逆向
```bash
python step2_reverse.py <明文draft_content.json> <逆向JSON>
```
产出: 文字槽（segmentId/原文/字数/资源类型/时间点）+ 视频槽（materialId/时间段/原素材）+ 轨道结构

### Step 3 生成资产
```bash
python step3_build_asset.py <逆向JSON> <templateId> <输出资产JSON> --name 模板名
```
产出: template-asset.json（模板资产的骨架，replacementPlan 待人工/LLM 填充）

### Step 4 人工确认（必须）
- 文字槽数量是否与母版一致
- 视频槽数量是否与母版一致
- 画幅 / 时长 / 轨道结构是否正确
- 确认后资产才算入库

## 模板资产放哪里

```
D:\知衡智企数据库\知识库\06_Video_Editing_Skills\template-usage\templates\<templateId>\
  └── template-asset.json
```

## 资产字段

| 字段 | 说明 |
|------|------|
| templateId | 模板唯一ID（如 0828-yinpin-tiepai-bikeng） |
| templateName | 模板名（如 饮品贴牌避坑） |
| templateInfo | 画幅/时长/轨道/来源母版/内容结构 |
| textSlots | 每个文字槽（segmentId/原文/字数/资源类型/时间点） |
| mediaSlots | 每个视频槽（materialId/时间段/原素材） |
| constraintMode | 约束策略（当前 EXACT_CHAR_COUNT） |
| replacementPlan | 替换方案（text + media 映射，填充后生效） |

## 已入库模板

| templateId | 模板名 | 画幅 | 时长 | 文字槽 | 视频槽 |
|------------|--------|------|------|--------|--------|
| 0828-yinpin-tiepai-bikeng | 饮品贴牌避坑 | 9:16 | 53.6s | 36 | 17 |

## 禁止

1. 修改原母版草稿
2. 产出残缺资产（必须全字段）
3. 把未人工确认的资产标记为已入库
