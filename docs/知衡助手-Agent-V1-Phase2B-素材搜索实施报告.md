# 知衡助手 Agent V1 - Phase 2B 素材搜索实施报告

## 概述

本报告记录「知衡助手 Agent V1 - Phase 2B：逐秒素材搜索 Tool」的实施过程与验证结果。

**完成时间**：2026-08-26

**核心目标**：
1. 完成 Phase 2A Tool Calling 的真实验收
2. 实现 `search_video_assets` Tool，支持秒级片段搜索
3. 通过真实 LLM 调用验证端到端链路

---

## 一、当前默认模型 Tool Calling 是否真实成功

**结论：是，真实成功。**

### 测试环境

| 项目 | 值 |
|------|-----|
| Provider | volcengine-ark |
| Model | deepseek-v4-flash |
| Base URL | https://ark.cn-beijing.volces.com/api/plan/v3 |
| supportsToolCalling | **true** |

### 真实验收测试结果

#### 测试 1：列出视频剪辑风格

- **用户输入**："我们现在有哪些视频剪辑风格？"
- **期望 Tool**：`list_video_skills`
- **实际调用**：`list_video_skills` ✅
- **Tool 执行结果**：返回 5 个真实 Skill（产品案例型、工厂实力型、知识科普型、老板IP观点型、行业避坑型）
- **最终回答**：LLM 根据 Tool 结果输出了包含风格名称、内容类型、核心定位的表格

#### 测试 2：老板IP风格规则

- **用户输入**："老板IP观点型视频有什么规则？"
- **期望 Tool**：`get_video_skill`
- **实际调用**：`list_video_skills` → `get_video_skill` ✅
- **Tool 执行结果**：读取了真实的「老板IP观点型」skill.json
- **最终回答**：LLM 输出了该风格的核心定位、基础规格、目标受众等详细规则

#### 测试 3：企业内容边界

- **用户输入**："企业内容有哪些东西不能乱说？"
- **期望 Tool**：`get_company_context_summary`
- **实际调用**：`get_company_context_summary` ✅
- **Tool 执行结果**：读取了真实的 Company Context（当前 guardrails 为空）
- **最终回答**：LLM 如实告知系统尚未配置明确的内容红线规则，并给出了通用建议

### 关键发现：Zod v4 兼容性修复

在 Phase 2A 中，`zodToJsonSchema` 函数基于 Zod v3 的内部 API（`_def.typeName`）编写。但项目使用的是 Zod v4，内部结构已变更（`_def.type`，小写类型名）。

**修复前的问题**：
- 所有 Tool 的 parameters 都被生成为 `{ "type": "string" }`
- LLM 不知道正确的参数名，导致参数名随机（如 `description`、`PARAMETER_NAME`）
- 搜索功能因此无法正确工作

**修复内容**（`src/lib/agent/tool-registry.ts`）：
- 将 `_def.typeName` 改为 `_def.type`
- `ZodObject` → `object`、`ZodString` → `string` 等
- `ZodArray` 的内部类型从 `_def.innerType` 改为 `_def.element`
- `ZodEnum` 的 entries 从数组改为对象，需用 `Object.values()` 转换
- 增加了 `description` 字段透传

---

## 二、search_video_assets 如何读取索引

### 索引文件位置

通过 `StorageService.getPath('assets')` 从数据库 `storage_configs` 表获取素材根目录。

当前配置：
- **assets 路径**：`D:\知衡智企数据库\企业知识库\浩明饮品\素材资源\视频`
- **索引文件**：`video-assets-detailed.json`

### 加载机制（`src/lib/agent/video-asset-index.ts`）

```
loadVideoAssetIndex()
  ├── 内存缓存（Promise 级缓存，防止并发重复加载）
  ├── 调用 StorageService.getPath('assets') 获取根目录
  ├── fs.readFile 读取 video-assets-detailed.json
  ├── JSON.parse 解析
  └── 返回 VideoAsset[] 数组
```

### 索引统计

| 指标 | 数量 |
|------|------|
| 素材总数 | 90 |
| timelineSegments（秒级片段） | 168 |
| recommendedCuts（推荐剪辑点） | 158 |
| avoidCuts（避免剪辑点） | 38 |
| duplicateGroup（重复组） | 13 |
| preferred（优选素材） | 75 |
| 竖屏素材 | 21 |
| 横屏素材 | 69 |

---

## 三、搜索最小单位是什么

**搜索最小单位是 `timelineSegments + recommendedCuts`（秒级片段），不是整个视频文件。**

### 设计原则

1. **以 segment 为候选单位**：将每个素材的每个 timelineSegment 展开为独立候选
2. **推荐起止时间优化**：在 segment 范围内，找到最佳的 recommendedCut 作为 `recommendedStart/End`
3. **返回片段级信息**：每个结果包含 segment 起止、推荐起止、内容描述、用途、画质等

### 返回字段说明

每个搜索结果（`VideoClipResult`）包含：

| 字段 | 说明 |
|------|------|
| assetId | 素材 ID |
| fileName | 文件名 |
| relativePath | 相对素材根目录的路径 |
| category | 分类（normalizedCategory） |
| segmentStart / segmentEnd | 片段所在 segment 的起止时间 |
| recommendedStart / recommendedEnd | 推荐使用的精确起止时间（基于 recommendedCuts） |
| clipDuration | 推荐片段时长 |
| content | 画面内容描述 |
| action | 主要动作 |
| shotType | 景别 |
| cameraAngle | 拍摄角度 |
| cameraMovement | 镜头运动 |
| topicTags | 主题标签 |
| semanticMatches | 语义匹配词 |
| usageRoles | 适用场景角色 |
| recommendedSkills | 推荐使用的剪辑风格 |
| visualQuality | 画质等级 |
| cropSafety | 裁剪安全性 |
| orientation | 横竖屏 |
| duplicateGroup | 重复组 ID |
| preferred | 是否优选素材 |
| matchScore | 匹配度评分（0-1） |
| matchReasons | 匹配理由（可解释） |

---

## 四、matchScore 怎么算

### 评分权重

| 维度 | 权重 | 说明 |
|------|------|------|
| semanticMatch | 0.30 | 语义匹配（最高权重） |
| contentMatch | 0.20 | 内容描述匹配 |
| topicMatch | 0.15 | 主题标签匹配 |
| usageRoleMatch | 0.15 | 用途角色匹配 |
| skillMatch | 0.05 | 剪辑风格匹配 |
| quality | 0.05 | 画质加分 |
| preferred | 0.05 | 优选素材加分 |
| orientation | 0.05 | 横竖屏匹配 |

### 评分逻辑

1. **semanticMatch**：query 与 segment.semanticMatches 双向包含匹配，命中数 × 0.4，上限 1.0
2. **contentMatch**：
   - 完全包含：1.0 分
   - 部分关键词匹配：(命中数 / 总关键词数) × 0.5
3. **topicMatch**：query 与 segment.topicTags 双向包含匹配，命中数 × 0.3，上限 1.0
4. **usageRoleMatch**：参数 usageRoles 与 segment.usageRoles 的交集比例
5. **skillMatch**：参数 contentType 与 segment.recommendedSkills 的匹配
6. **quality**：good=1.0, medium=0.6, 其他=0.3
7. **preferred**：true=1.0, false=0.3
8. **orientation**：匹配=1.0，不匹配但 cropSafety=good=0.5，不匹配=0.2

### matchReasons（可解释性）

每个结果都附带 `matchReasons` 数组，说明得分来源，例如：
- "语义匹配：无菌灌装为什么重要"
- "内容描述匹配"
- "主题标签匹配：灌装、无菌"
- "画质良好"
- "优选素材"

---

## 五、avoidCuts 怎么排除

### 排除规则

- 如果一个 segment 的 **超过 50%** 的时间范围落在任何 avoidCut 区间内，则该 segment 被完全排除
- 默认排除，V1 不开放 `includeAvoidCuts` 选项

### 实现位置

`src/lib/agent/video-asset-index.ts` 中的 `isInAvoidCuts` 函数：

```typescript
function isInAvoidCuts(
  segmentStart: number,
  segmentEnd: number,
  avoidCuts: AvoidCut[]
): boolean {
  const segmentDuration = segmentEnd - segmentStart;
  for (const avoid of avoidCuts) {
    const overlapStart = Math.max(segmentStart, avoid.start);
    const overlapEnd = Math.min(segmentEnd, avoid.end);
    const overlapDuration = Math.max(0, overlapEnd - overlapStart);
    if (overlapDuration / segmentDuration > 0.5) {
      return true;
    }
  }
  return false;
}
```

### 验证结果

- 有 avoidCuts 的素材：22 个
- 排除机制正常工作，avoid 区域占比超 50% 的 segment 不会出现在搜索结果中

---

## 六、duplicateGroup 怎么去重

### 去重规则

- 同一个 `duplicateGroup` 在同一次搜索中**最多返回 1 个**结果
- 优先保留 `preferred = true` 的素材
- 如果都不是 preferred，则保留 matchScore 最高的

### 实现位置

搜索流程的「去重」步骤（在排序之后、limit 之前）：

```
排序 → duplicateGroup 去重 → limit → 格式化输出
```

### 验证结果

- 13 个重复组
- 去重后每组最多 1 个，验证通过

---

## 七、横屏/竖屏怎么排序

### 设计原则

**不一刀切**：方向不匹配但语义明显更匹配的素材，仍然保留但适当降权。

### 具体规则

1. **方向完全匹配**：orientation 权重满分（0.05）
2. **方向不匹配但 cropSafety = good**：orientation 权重给 0.5（0.025）
3. **方向不匹配且 cropSafety ≠ good**：
   - 如果用户请求 portrait 但素材是 landscape 且 cropSafety 不好：**排除**（横屏无法安全裁剪为竖屏）
   - 其他情况：orientation 权重给 0.2（0.01）

### 语义优先

由于 orientation 权重只有 0.05，即使方向不匹配，只要语义匹配度高（semanticMatch + contentMatch + topicMatch = 0.65 权重），仍然可以排在前面。

---

## 八、实际三组搜索测试结果

### 测试 A：无菌灌装素材搜索

- **用户输入**："帮我找适合讲无菌灌装的素材。"
- **LLM 调用参数**：`{ "query": "无菌灌装" }`
- **返回片段数**：10 个
- **Top 结果**：
  1. 01_无菌_1.MP4 [0s-3.5s] 无菌灌装线操作（score: 0.485）
  2. 07_无菌_2.MP4 [0s-3.5s] 无菌灌装线操作（score: 0.485）
  3. 07_无菌_2.MP4 [4s-7.5s] 无菌灌装线操作（score: 0.485）
- **结论**：✅ 正确命中无菌灌装相关素材

### 测试 B：老板IP + 工厂混合素材

- **用户输入**："找5个适合做老板IP视频的镜头，最好有人物，也穿插工厂生产。"
- **LLM 调用**：2 次 search_video_assets（分别搜索人物和工厂）
- **返回片段数**：10 个
- **结果分析**：包含老板口播人物素材 + 工厂生产线素材，混合正确
- **结论**：✅ 正确混合人物与工厂素材

### 测试 C：品控主题素材

- **用户输入**："我想讲客户为什么应该重视品控，有哪些画面可以配？"
- **LLM 调用参数**：`{ "query": "品控 质量 质检 检测" }`
- **返回片段数**：10 个
- **Top 3 结果**：
  1. 03_品控_1.MP4 [0s-2.8s] 品控检测（片段）（score: 0.34）
  2. 03_品控_1.MP4 [2.8s-5.5s] 品控检测（片段）（score: 0.34）
  3. 03_品控_1.MP4 [5.5s-8.3s] 品控检测（片段）（score: 0.34）
- **结论**：✅ 正确命中品控/质检相关素材

---

## 九、「原材料验收」音画一致性测试结果

### 测试输入

脚本句子：
> "原材料进入工厂以后，第一步不是直接生产，而是先经过验收和检查。"

要求：只搜索匹配画面。

### LLM 调用

- **Tool**：`search_video_assets`
- **参数**：`{ "query": "原材料进入工厂 验收 检查 质检 入库" }`

### 测试结果

- **返回片段数**：10 个
- **Top 3 结果**：
  1. 02_原材料验收_1.mp4 [0s-3.5s] 完整片段：原材料验收（片段）（score: 0.26）
  2. 06_原材料验收_2.mp4 [0s-3.5s] 完整片段：原材料验收（片段）（score: 0.26）
  3. 10_原材料验收_3.mp4 [0s-3.5s] 完整片段：原材料验收（片段）（score: 0.26）

### 结论

✅ **音画一致性测试通过**。Top 3 全部是「原材料验收」素材，正确命中脚本语义，而不是仓库、装车、老板口播、产品展示等不相关内容。

---

## 十、修改了哪些文件

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/lib/agent/video-asset-index.ts` | 素材索引服务层（核心搜索逻辑） |
| `scripts/test-asset-search.ts` | 素材搜索功能独立测试脚本 |
| `scripts/test-asset-search-agent.ts` | 素材搜索真实 Agent 测试脚本 |
| `scripts/verify-tool-calling.ts` | Tool Calling 真实验收脚本 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/lib/agent/tools/index.ts` | 新增 `search_video_assets` Tool 注册 |
| `src/lib/agent/tool-registry.ts` | 修复 Zod v4 兼容性（zodToJsonSchema）；新增 toolArguments / toolResult 事件字段 |
| `src/lib/agent/orchestrator.ts` | tool_completed 事件增加 toolResult；tool_started 事件增加 toolArguments |

---

## 十一、typecheck / build 结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck (`tsc --noEmit`) | ✅ 通过 |
| Next.js build (`next build`) | ✅ 通过 |

Build 警告（与本次修改无关）：
- Google Sans Flex 字体 fallback 警告
- next.config.ts NFT tracing 警告（已存在的警告）

---

## 十二、下一阶段如何进入 create_video_plan

### 当前状态

Phase 2A + Phase 2B 已完成：
- ✅ Unified LLM Tool Calling 基础设施
- ✅ Agent Orchestrator（6 轮循环、SSE 事件）
- ✅ Tool Registry（Zod Schema → JSON Schema）
- ✅ 4 个只读 Tool（list_video_skills / get_video_skill / get_company_context_summary / search_video_assets）
- ✅ 真实 LLM（deepseek-v4-flash）Tool Calling 验证通过
- ✅ 秒级素材搜索（168 个 segment、158 个 recommendedCuts）
- ✅ UI Tool 状态展示（SSE 事件驱动）

### Phase 3 建议方向：create_video_plan

下一阶段可以进入「视频策划」阶段，核心是 `create_video_plan` Tool：

1. **输入**：用户需求（主题、风格、时长、目标受众等）
2. **输出**：结构化的视频策划方案
   - 脚本结构（Hook → 正文 → 结尾 CTA）
   - 每个句子的文本
   - 每个句子推荐的素材（调用 search_video_assets）
   - 推荐的剪辑风格（调用 get_video_skill）
   - 配音建议
   - 字幕/BGM 建议

3. **实现要点**：
   - 仍然是只读 Tool（riskLevel = low）
   - 不生成实际视频，只输出策划方案
   - 方案可以保存为草稿（后续阶段）
   - 用户可以确认方案后进入执行阶段

4. **依赖关系**：
   - 复用现有的 search_video_assets（为每个脚本句子匹配画面）
   - 复用 get_video_skill（获取风格规则）
   - 复用 get_company_context_summary（确保符合企业定位）

5. **后续阶段**：
   - Phase 3A：create_video_plan（策划方案生成）
   - Phase 3B：方案保存/编辑/确认
   - Phase 4：execute_video_task（实际视频生成，MoneyPrinter 集成）

---

## 附录：关键技术决策

### 1. 为什么不用向量数据库？

当前只有 90 条素材、168 个 segment，数据量极小。使用规则匹配（关键词 + tags + semanticMatches + usageRoles）已经足够，引入向量数据库会：
- 增加运维复杂度
- 增加冷启动时间
- 降低可解释性（黑盒相似度 vs 可解释的 matchReasons）

等素材量达到上千/上万条时再升级不迟。

### 2. 为什么搜索最小单位是 segment 而不是 recommendedCut？

- segment 是语义完整的最小单元（有独立的 content、topicTags、usageRoles 等元数据）
- recommendedCut 是在 segment 内的「最佳剪辑点」，没有独立语义
- 因此以 segment 为搜索单位，用 recommendedCut 优化输出的起止时间

### 3. 为什么文件存在性校验在搜索时做而不是加载索引时做？

- 索引文件可能与实际文件不同步（文件被移动/删除）
- 加载时全量校验会拖慢首次加载速度
- 搜索时校验确保返回给 Agent 的都是真实存在的文件
- 不存在的文件静默跳过并记录 warning

---

*报告结束*
