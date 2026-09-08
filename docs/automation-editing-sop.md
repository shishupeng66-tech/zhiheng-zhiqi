# 知衡智企自动剪辑 SOP（Automation Editing SOP）

> 状态：正式（v1.0） · 位置：项目内部 `docs/automation-editing-sop.md` · 随源码版本管理
> 性质：**产品内部固定工作流**。不属于任何客户，不因换客户而改变。
> 配套：三层 Skill（template-parser / template-usage / template-editing-rules）在 `skills/template-editing/`。
> 关系：**SOP 决定整体怎么做；Skill 决定具体能力怎么执行；工作流决定什么时候调用哪个 Skill；Template Asset 描述企业模板事实；企业模板属于客户 Obsidian；PJD 只负责确定性执行。**

---

## 0. 三条铁律

1. **SOP / Skill = 产品源码**（本项目内，随 Git 版本管理）；**企业模板 = 客户资产**（企业 Obsidian，绝不允许进项目 Git / src / 安装包）。
2. **正式自动剪辑只有 Template Route**：人工剪映草稿 → 蒸馏企业模板 → 按模板复用；无模板时必须先选择或蒸馏模板，不能回退自由剪辑。
3. **PJD 只负责确定性执行（replace_text / 素材替换 / 结构写回），不负责审美与语义决策。** Agent 决定用什么素材、填什么文字；PJD 负责把内容换进去。

---

## 1. 路线决策（用户任务解析后立即执行）

```
用户：“按 XX 模板，剪一条 XX 饮料的视频”
  ↓
Agent 解析任务：
  - workspace / 客户 / 产品
  - 是否指定模板
  - 目标平台 / 画幅
  - 是否已有脚本
  ↓
模板决策（在业务上下文读取后、脚本适配前完成）：
  A. 用户指定模板 → 检查该模板是否 approved / 可用
  B. 用户未指定   → 从企业模板目录检索 approved 模板（resolveWorkspaceAsset(templateRoot)）
  C. 没有合适模板 → 阻断，提示先选择已有企业模板或蒸馏剪映草稿
```

**单一路线原则**：正式自动剪辑入口只接受可用企业模板；旧自由剪辑链路只能作为历史实验/诊断能力，不进入正式 SOP。

---

## 2. 公共前置：读取业务上下文

模板路线前置：

- 客户知识（customers）
- 产品资料（products）
- 历史内容（chats / knowledge）
- 素材库（videos / images / voices）
- 风格知识（styleKnowledgeRoot）+ Editing Skill（editingSkillRoot）

统一通过 `resolveSystemAsset()` / `resolveWorkspaceAsset()` 获取路径，禁止硬编码绝对路径。

---

## 3. 生成完整口播脚本（先解决“说什么”）

- 用户已有脚本 → 直接使用 / 必要时优化。
- 无脚本 → LLM 先生成完整口播脚本（满足模板推荐时长 / 视频目标）。
- **完整脚本优先于 Slot 文案**：不要先填 Slot 再生成完整脚本。

---

## 4. Template Route 内容适配

仅 Template Route：

1. 读取 template-asset.json（**不要重新 parser**，直接读取已入库资产）。
2. 把完整脚本映射到 semantic slots。
3. 按 Slot Constraint 压缩/改写文字。
4. **EXACT_CHAR_COUNT 必须严格等字数**；不满足则 LLM 重写（最多 N 次），仍失败报 CONSTRAINT_UNSATISFIED。
5. 生成 text-slot fill plan。

## 5. TTS + 字幕

- 豆包/火山 TTS 生成配音（已验收链路）。
- 使用 TTS_NATIVE timing（语音段 VAD 对齐）。
- 字幕按当前正式分段规则生成（subtitle gap fill 等已验收能力）。
- 得到最终 voice duration 作为时间基准。

## 6. 素材检索与 Media Slot Filling

- **Template Route**：按模板 media slot 语义（factory / production_line / product / packaging / inspection / office）从素材索引检索，生成 Media Fill Plan；优先竖屏素材。

## 7A. Template Route 草稿生成

1. 复制 frozen template draft（母版只读）。
2. PJD `replace_text()` 替换文字（text_template 保留 JSON styles 结构；花字同步 styles/words）。
3. 替换 video/image/audio slot（只改 path/duration/width/height/type/material_name）。
4. 保留：动画 / 花字 / text_template / transform / duration structure / visual packaging / BGM / 贴纸 / 特效 / 转场。

## 8. 验证

- **Template Route**：Slot Constraint validation → Structure Diff（0 STRUCTURE_DRIFT，仅允许 text content / style range 变化）→ Material Dependency check → Missing Media check → PJD reload → 适用的 Validator / Preflight。
  - **明确区分 PJD_RELOAD_PASS 与 VALIDATOR_PASS**：reload 成功 ≠ Validator 通过。

## 9. 输出剪映草稿

- 草稿写入剪映草稿目录（com.lveditor.draft）。
- 生成验收清单（review JSON + comparison MD）。

## 10. 用户剪映验收（必须人工）

- 状态机：PENDING_USER_REVIEW →（用户剪映确认）→ HUMAN_APPROVED。
- **程序生成成功 ≠ 视觉通过**。程序不自动宣布视觉 PASS。

---

## 11. 模板生产阶段（新模板入库，不随每次剪辑运行）

```
人工在剪映完成母版
  ↓
template-parser（一次性）：
  解密（step1）→ 逆向（step2）→ 生成资产（step3）
  ↓
template-asset.json（textSlots + mediaSlots + constraints + dependencies + baseline）
  ↓
人工验证关键 Slot → 更新 constraint evidence
  ↓
模板进入企业 Obsidian（<企业知识库>\05_模板\企业模板\<templateId>\）
  ↓
以后正式运行直接读取 template-asset（不再重新 parser）
```

---

## 12. 生命周期与验收门禁

| 阶段 | 动作 | 门禁 |
|------|------|------|
| 母版制作 | 人工在剪映完成 | 视觉合格 |
| Parser | 解析为 template-asset.json | 槽位数量/画幅/时长与母版一致 |
| testing | 允许显式测试使用 | 人工验收 |
| approved | 草稿快照冻结进企业模板库 | 人工验收 + frozenDraft + fingerprint |
| disabled | 不再进入候选 | — |

---

## 13. 边界（本轮不做 / 明确禁止）

- 不研究从零注入 ScriptTemplate（resourceId → 直建模板）。
- 不自动缩放 / 换行 / 移位置 / 改字号来“补救”超长文字。
- 正式入口不允许在缺少模板时自动切入自由剪辑。
- 不修改历史实验链路 / Worker / PJD / TTS / 字幕 / Visual Packaging。
- 企业模板不进项目 Git / src / 安装包。
