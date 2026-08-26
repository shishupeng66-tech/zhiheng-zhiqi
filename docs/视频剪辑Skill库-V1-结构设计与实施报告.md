# 视频剪辑 Skill 库 · V1 结构设计与实施报告

> 日期:2026-08-26
> 范围:自动化剪辑空间结构调整 + 「风格库」升级为「视频剪辑 Skill 库」基础结构
> 状态:实施完成,typecheck / build / 浏览器验证通过,未 push

---

## 1. 原「素材资产」入口在哪

- **顶栏定义**:`src/lib/workspaces/registry.ts` 的 `enterpriseMediaModules` 数组(自动化剪辑空间 = `enterprise-media` 类型)
- 入口项:
  ```ts
  { key: 'assets', label: '素材资产', path: 'assets', description: '管理企业实拍视频…', requiredPermission: 'assets:view' }
  ```
- **路由/页面**:`src/app/dashboard/workspaces/[workspaceSlug]/assets/page.tsx` → 渲染 `AssetsPage`(`src/features/workspaces/video-production/module-pages.tsx`)
- 顶栏渲染链路:workspace layout → `getWorkspaceModules(workspaceType, enabledModules)` → `WorkspaceShell` → `WorkspaceModuleNav`

## 2. 是否已从工作空间移除

**✅ 已移除。**
- 修改 `src/lib/workspaces/registry.ts`:`enterpriseMediaModules` 中**删除** `assets`(素材资产)模块定义
- 顶栏现为:**视频生产 / 任务审核 / 复盘 / 风格库 / 成员**(与目标一致)
- 浏览器实测确认:workspace 顶栏无「素材资产」tab

> 补充:DB 中 `enabled_modules` 仍含 `"assets"`(历史数据),因 registry 已无该模块定义,`getWorkspaceModules` 过滤后不显示,无需迁移数据。

## 3. 底层旧素材逻辑是否仍保留

**✅ 全部保留(兼容层,未删任何东西)。**

| 底层 | 状态 | 说明 |
|---|---|---|
| `automation_video_assets` 表 | ✅ 保留 | schema.ts 未动 |
| `automation-editing.ts` 的 `createAutomationVideoAsset` 等 | ✅ 保留 | 自动剪辑链路依赖 |
| `/api/workspaces/[workspaceSlug]/automation/assets` API | ✅ 保留 | 工作台四栏「02 素材与画面」使用 |
| `assets/page.tsx` 路由 + `AssetsPage` 组件 | ✅ 保留 | 仅不在 enterprise-media 顶栏展示;其他 workspace 类型(video-production 等)仍可用 |
| `automation_video_assets` 数据 | ✅ 未删 | 未迁移、未删除 |

> ⚠ 关键区分:**顶栏「素材资产」tab** 与 **自动化剪辑工作台四栏「02 素材与画面」**是两回事。前者已移除;后者(overview-page 内的"素材与画面"面板)是自动剪辑工作台的核心功能,**必须保留**。

## 4. 当前风格库真实实现是什么

- **路由**:`/dashboard/workspaces/[workspaceSlug]/projects`(enterprise-media 类型)
- **页面组件**:`src/features/workspaces/automation-editing/style-library-page.tsx` → `AutomationEditingStyleLibraryPage`
- **升级前真实实现**:**硬编码占位** —— 组件内写死 4 个 style 对象(工业实力展示风 / 老板行业观点风 / 客户痛点科普风 / 产品案例展示风),**无 DB schema / 无编辑能力 / 无 MoneyPrinter 参数关联 / 无 prompt-JSON 配置**,纯静态展示卡片
- **升级后**:重写为「视频剪辑 Skill 库」占位页,展示 5 个 Skill 卡片 + 草稿状态标签

## 5. 风格库如何升级成 Skill 库

1. **定位转变**:从"视觉风格"→"视频剪辑 Skill 库"(每个 Skill = 一套可执行的自动剪辑规则:脚本/素材/镜头/配音/字幕/BGM)
2. **UI 升级**:页面文案改为"管理自动剪辑 Skill,每种 Skill 定义脚本、素材、镜头、配音、字幕和 BGM 规则";5 张卡片(知识科普型/老板IP观点型/行业避坑型/工厂实力展示型/产品案例型),各带状态(草稿/测试中/已发布,当前均为草稿)
3. **结构落地**:新建 `skills/video-editing/` 目录,含 schema.v1.json + README + 5 个 Skill 文件夹(各含 skill.md + skill.json)
4. **未来**:Agent Orchestrator 按内容类型加载对应 skill.json 驱动自动剪辑;MoneyPrinterTurbo 只执行最终参数

## 6. Skill V1 数据结构

Schema 文件:`skills/video-editing/schema.v1.json`(JSON Schema,遵循现有项目能力精简)。

| 分组 | 字段 | 说明 |
|---|---|---|
| meta | id / name / category / status / version / description | 基础信息 |
| content | contentType / targetAudience / targetPlatform / durationRange | 内容定位 |
| script | systemPrompt / scriptPrompt / hookRules / structureRules / toneRules / ctaRules | 脚本规则 |
| assets | assetSelectionRules / preferredCategories / forbiddenCategories / reuseRules / orientationRules | 素材规则 |
| shots | shotRules / clipDurationRules / pacingRules / transitionRules | 镜头规则 |
| voice | voiceStyle / voiceRate / emotionRules | 配音规则 |
| subtitle | subtitleStyle / subtitlePosition / subtitleSize / highlightRules | 字幕规则 |
| bgm | bgmStyle / bgmVolume / bgmRules | BGM 规则 |
| review | referenceVideoIds / qualityRules / failureRules / acceptanceRules | 参考与评价 |

> V1 允许按需精简,未填字段 = "未约束,由 Agent 默认处理"。映射 MPT 参数(`--voice-rate`/`--bgm-volume`/`--subtitle-position`/`--font-size` 等)已在 schema 注释中标明。

## 7. 为什么第一版建议 Markdown + JSON

| 理由 | 说明 |
|---|---|
| 快速迭代 | Skill 规则会随真实成片测试频繁调整,文件改起来比 DB 快、可 diff、可回滚 |
| 人机同源 | `skill.md` 给人看(评审/调优),`skill.json` 给 Agent 读(结构化),同一内容两份形态 |
| 零迁移成本 | 不建表、不加 migration,先验证"哪种规则有效"再决定是否落库 |
| Agent 友好 | JSON 可直接被 Agent Orchestrator 加载为结构化上下文 |

未来内容稳定后可参照 `storage_configs` 演进路径,把 `skill.json` 沉淀进 DB。

## 8. 5 个初始 Skill 结构

位置:`skills/video-editing/<Skill 名>/{skill.md, skill.json}`(本轮为结构占位,不含完整 Prompt)

| Skill 文件夹 | id | category | 内容形态 | 状态 |
|---|---|---|---|---|
| 知识科普型 | knowledge-science | knowledge | 知识科普 | 草稿 |
| 老板IP观点型 | executive-ip | ip | 老板 IP 观点 | 草稿 |
| 行业避坑型 | industry-avoidance | avoidance | 避坑/行业建议 | 草稿 |
| 工厂实力展示型 | factory-showcase | factory | 工厂实力展示 | 草稿 |
| 产品案例型 | product-case | case | 产品/案例 | 草稿 |

每个 skill.json 均含完整分组字段(内容定位已填,规则数组为空占位待迭代)。

## 9. Agent 未来如何加载 Skill

```
用户需求 → Agent 判断视频类型 → 选 Skill
  → 读取 企业定位 + skill.json + 素材索引
  → 生成脚本(scriptPrompt + hook/structure/tone/cta 规则)
  → 生成 edit plan(素材匹配 + 镜头编排 + 转场/时长)
  → 生成配音/字幕/BGM 参数
  → 调用 MoneyPrinterTurbo 执行
```
- Skill 由 **Agent Orchestrator** 负责加载;**MoneyPrinterTurbo 不理解 Skill**,只执行最终参数
- 加载方式:Agent 扫描 `skills/video-editing/*/skill.json` → 按 contentType/category 匹配 → 注入上下文

## 10. 自动化剪辑工作台如何继续作为高级编辑器

- **保留**:现有四栏工作台(01 视频内容 / 02 素材与画面 / 03 配音与音乐 / 04 字幕样式)全部保留,`overview-page.tsx` 未动
- **未来定位**:
  - 普通员工:Agent 按 Skill 自动完成,不进工作台
  - 高级用户/管理员:生成计划后进入工作台人工调整
- **未来交互**:Agent 生成计划后支持 `[查看剪辑方案] [打开高级编辑] [开始生成]`(本轮不做,仅规划)

## 11. 本轮修改了哪些文件

| 文件 | 操作 |
|---|---|
| `src/lib/workspaces/registry.ts` | 改:`enterpriseMediaModules` 移除 `assets`(素材资产)模块定义 |
| `src/features/workspaces/automation-editing/style-library-page.tsx` | 改:重写为「视频剪辑 Skill 库」占位页(5 卡片 + 状态) |
| `skills/video-editing/README.md` | 新增:Skill 库说明与加载原则 |
| `skills/video-editing/schema.v1.json` | 新增:Skill V1 数据结构规范 |
| `skills/video-editing/知识科普型/{skill.md,skill.json}` | 新增:Skill 占位 |
| `skills/video-editing/老板IP观点型/{skill.md,skill.json}` | 新增:Skill 占位 |
| `skills/video-editing/行业避坑型/{skill.md,skill.json}` | 新增:Skill 占位 |
| `skills/video-editing/工厂实力展示型/{skill.md,skill.json}` | 新增:Skill 占位 |
| `skills/video-editing/产品案例型/{skill.md,skill.json}` | 新增:Skill 占位 |

**未修改**(遵守约束):LLM / Tool Calling / MoneyPrinterTurbo / Voice Service / DB schema / automation_video_assets / 旧素材 API / 真实素材 / 未做 Agent / 未建向量库 / 未迁移数据

## 12. typecheck / build 结果

- `npx tsc --noEmit` → **0 错误** ✅
- `npm run build` → **通过**(Compiled in 16.1s,静态页 32/32)✅
- 路由表:`/dashboard/workspaces/[workspaceSlug]/assets` 仍存在(底层兼容层保留)

### 浏览器实测(next start + puppeteer)

| 验证点 | 结果 |
|---|---|
| 全局侧边栏:素材库/视频库/图片库/音色库/声音复刻 | ✅ 全部存在,不受影响 |
| workspace 顶栏 tabs | ✅ 视频生产/任务审核/复盘/风格库/成员(素材资产已移除) |
| 风格库(projects)页面 | ✅ 正常访问,文案=「视频剪辑 Skill 库」,5 卡片 + 草稿标签 |
| 截图 | `_screenshot_tool/skill-library.png` / `workspace-tabs.png` |

---

*本轮仅结构调整与占位建立,未实现完整 Agent,未 push。*
