# 自动剪辑后端现状扫描与架构收敛报告

- 日期：2026-09-07
- 范围：自动剪辑后端 / Agent-native Editing / Template Repository / System Asset Registry / skill-loader / 实验代码 / PJD-Worker / TTS-字幕 / workspace 配置
- 目的：按最新【知衡智企自动剪辑 SOP + Skill 架构】分类现有代码，确定 KEEP / REUSE / MOVE / MERGE / DEPRECATE

---

## 一、现状全景

| 模块 | 位置 | 状态 | 分类 |
|------|------|------|------|
| Agent-native 主链 | `src/lib/workspaces/agent-auto-edit.ts`（2057 行，runAgentAutoEditPipeline） | ✅ 已跑通、多轮验收 | **KEEP** |
| 自动化任务/草稿 | `src/lib/workspaces/automation-editing.ts`（1081 行） | ✅ 稳定 | **KEEP** |
| 剪映总装 | `src/lib/workspaces/jianying-assembly.ts`（198 行） | ✅ 稳定 | **KEEP** |
| 执行前检查 | `src/lib/workspaces/automation-execution-preflight.ts` | ✅ 稳定 | **KEEP** |
| 视觉包装 | `src/lib/workspaces/visual-resource-registry.ts`（264 行） | ✅ 稳定 | **KEEP** |
| 脚本生成 | `src/lib/workspaces/script-generation.ts` | ✅ 稳定 | **KEEP** |
| Template Repository | `src/lib/templates/`（types/repository/index） | ✅ 成熟，读 Production 库 | **KEEP + 扩展** |
| System Asset Registry | `src/lib/system-assets/`（types/defaults/registry/resolver/index） | ✅ 成熟，优先级完整 | **KEEP + 扩展 templateRoot** |
| Path Resolver | `src/lib/system-assets/resolver.ts` | ✅ 成熟 | **KEEP** |
| skill-loader | `src/lib/agent/skill-loader.ts` | ✅ 可读 editingSkillRoot 下 skill.json | **KEEP + 扩展三层 Skill 加载** |
| 风格型 Skill（01-05） | `skills/video-editing/`（项目内部） | ⚠️ 结构占位，内容待迭代 | **KEEP（产品内部）** |
| 三层模板 Skill | `知识库\06_Video_Editing_Skills\{template-parser,template-usage,template-editing-rules}` | ✅ 有真实内容但**在客户 Obsidian** | **MOVE → 项目内部** |
| 实验 Pipeline | `scripts/template-pipeline/`（step1-5 .py） | ✅ 多轮实测跑通 | **MOVE → 正式模块 + 保留脚本** |
| 实验分析脚本 | `logs/*.py`（semantic-text-poc 等） | ⚠️ 一次性研究 | **DEPRECATE（保留归档）** |
| PoC 产物 JSON | `logs/semantic-*.json` | ⚠️ 实验结论 | **DEPRECATE（结论已固化进 Skill）** |
| template-asset.json | `知识库\06...\template-usage\templates\0828-yinpin-tiepai-bikeng\` | ✅ 真实模板资产（36+17 槽） | **MOVE → 企业 Obsidian 模板目录** |
| PJD Worker 客户端 | `src/engines/jianying-adapter/worker-client.ts` | ✅ 成熟 | **KEEP** |
| TTS/字幕链路 | `agent-auto-edit.ts` + voice-service | ✅ 已验收 | **KEEP（不重构）** |
| workspace 存储 | `src/lib/storage/`（index/types） | ✅ 动态 key，成熟 | **KEEP + 扩展 templateRoot** |
| 企业上下文 | `src/lib/agent/company-context.ts` | ✅ 已修正路径 | **KEEP** |

## 二、关键发现

### 1. 只有 Agent-native 一条路线
`runAgentAutoEditPipeline` 直接走：脚本 → 配音 → 素材规划 → 字幕 → Timeline → Validator → 剪映总装。
**没有 Template Route 决策点**——任务书要求"业务上下文/脚本准备后尽早分支"。

### 2. 三层 Skill 在客户 Obsidian，不在项目内部
`06_Video_Editing_Skills` 位于 `D:\知衡智企数据库\知识库`（客户企业知识库）。
按新架构：
- **SOP + Skill = 产品内部** → 应移到项目 `skills/` 或 `src/lib/skills/`
- **企业模板 = 客户 Obsidian** → template-asset.json 应留在企业目录

### 3. 实验 Pipeline 未提升为正式模块
`scripts/template-pipeline/`（step1_decrypt → step2_reverse → step3_build_asset → step4_fill → step5_verify）已在 8 月 28 日端到端验证，但：
- 无 TS 类型定义（TemplateAsset / TemplateTextSlot / TemplateMediaSlot / SlotConstraint）
- 无正式 Repository 封装
- 与 Template Repository（src/lib/templates/）脱节

### 4. WorkspaceAssetKey 缺 templateRoot
`resolveWorkspaceAsset()` 支持 customerRoot/productRoot/materialRoot/videoRoot/voiceRoot/knowledgeRoot/outputRoot，**无企业模板目录 key**。

### 5. skill-loader 只识别旧 schema
`skill-loader.ts` 的 VideoEditingSkill 接口是 01-05 风格型 Skill 的 schema（script/assets/shots/voice/subtitle/bgm/review），**不认识** template-parser/template-usage/template-editing-rules 的 pipeline/rules 结构。

## 三、架构收敛决策

### A. 产品内部（进入项目源码，随版本管理）
- **SOP**：`docs/automation-editing-sop.md`（新写）
- **三个模板 Skill**：`skills/template-editing/{template-parser,template-usage,template-editing-rules}`（从 Obsidian 06 迁移 + 固化）
- **TemplateAsset 类型/Schema**：`src/lib/templates/asset-schema.ts`（新写，schemaVersion=1.0）
- **Template 正式服务**：`src/lib/templates/` 增加 parser/usage/fill/verify 服务层（由实验脚本收敛）
- **Template Route orchestration**：`src/lib/workspaces/template-route.ts`（新写，早期分支）
- **Workspace templateRoot**：`src/lib/system-assets/types.ts` + `storage/types.ts` + defaults

### B. 企业 Obsidian（客户资产，不进 Git）
- 企业模板目录（`<企业知识库>\剪辑模板\<templateId>\`）
- template-asset.json 实体（0828 模板）
- 素材、草稿、验收证据

### C. 保留现状
- Agent-native 主链、Worker、PJD、TTS、字幕、Visual Packaging、Template Repository、Asset Registry 全部不动

### D. 废弃归档
- `logs/semantic-*.json` 实验产物（结论已固化）
- `logs/*-poc*.py` 一次性脚本（保留为研究记录）

## 四、执行顺序（对应任务书 Phase 3-10）

1. SOP 文档（docs/automation-editing-sop.md）
2. 三层 Skill 迁移至项目内部 + skill-loader 扩展识别
3. TemplateAsset Schema（schemaVersion 1.0）
4. workspace templateRoot（types/defaults/resolver/storage 4 处）
5. Template Route orchestration（template-route.ts，早期分支）
6. 最小回归：8月25日母版 parser → asset → SAME_LENGTH usage
