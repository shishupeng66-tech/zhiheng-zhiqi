# 视频剪辑 Skill 库(V1 结构)

> 目录:`skills/video-editing/`
> 状态:结构占位,内容待迭代
> 定位:**每一个 Skill 代表一套可执行的自动剪辑规则**(脚本 + 素材 + 镜头 + 配音 + 字幕 + BGM)

---

## 一、什么是「视频剪辑 Skill」

知衡智企的自动剪辑**不是让 LLM 自由发挥**,而是:

```
用户需求
  ↓
Agent 判断视频类型
  ↓
选择对应 Skill
  ↓
读取:企业定位 + Skill + 视频素材索引
  ↓
生成脚本 → 生成 edit plan → 调用视频工具
```

每个 Skill = 一套完整的剪辑规则,针对一种内容形态(知识科普 / 老板 IP / 行业避坑 / 工厂实力 / 产品案例…)。

**Skill 由 Agent Orchestrator 负责加载**,MoneyPrinterTurbo 只负责执行最终参数,**不理解 Skill**。

---

## 二、目录结构

```
skills/video-editing/
├─ README.md                      ← 本文件(说明与加载原则)
├─ schema.v1.json                 ← Skill V1 数据结构规范(JSON Schema)
└─ <Skill 名>/
   ├─ skill.md                    ← 给人看:完整说明,方便持续调优
   └─ skill.json                  ← 给 Agent/程序读:结构化规则
```

当前 5 个初始 Skill(结构占位):

| Skill 文件夹 | 内容形态 | 状态 |
|---|---|---|
| `知识科普型` | 知识科普 | 草稿 |
| `老板IP观点型` | 老板 IP 观点 | 草稿 |
| `行业避坑型` | 避坑 / 行业建议 | 草稿 |
| `工厂实力展示型` | 工厂实力展示 | 草稿 |
| `产品案例型` | 产品 / 案例 | 草稿 |

> 状态取值:草稿(draft) / 测试中(testing) / 已发布(published)。当前全部为草稿占位。

---

## 三、为什么第一版用 Markdown + JSON

| 理由 | 说明 |
|---|---|
| **快速迭代** | Skill 内容会频繁调整(结合真实成片测试),文件改起来比 DB 快、可 diff、可回滚 |
| **人机同源** | `skill.md` 给人看(评审/调优),`skill.json` 给程序读(结构化),两份由同一内容维护 |
| **零迁移成本** | 不建数据库表、不加 migration,先验证"哪种 Skill 规则真正有效"再决定是否落库 |
| **Agent 友好** | JSON 可直接被 Agent Orchestrator 加载为结构化上下文 |

未来内容稳定后,可将 `skill.json` 的规则沉淀进 DB(参考 `storage_configs` 的演进路径)。

---

## 四、Skill 加载原则(未来 Agent)

1. Agent Orchestrator 扫描 `skills/video-editing/*/skill.json`
2. 根据用户需求(contentType / category)匹配 Skill
3. 将 `skill.json` 的结构化规则注入 Agent 上下文
4. Agent 依据「企业定位 + Skill 规则 + 素材索引」生成脚本与 edit plan
5. 最终参数交给 MoneyPrinterTurbo 执行

> 禁止:让 MoneyPrinterTurbo 直接读取/理解 Skill。

---

## 五、Skill 数据模型(Schema V1)

字段定义见 `schema.v1.json`。核心分组:

- **meta**:id / name / category / status / version / description
- **content**:contentType / targetAudience / targetPlatform / durationRange
- **script**:systemPrompt / scriptPrompt / hookRules / structureRules / toneRules / ctaRules
- **assets**:assetSelectionRules / preferredCategories / forbiddenCategories / reuseRules / orientationRules
- **shots**:shotRules / clipDurationRules / pacingRules / transitionRules
- **voice**:voiceStyle / voiceRate / emotionRules
- **subtitle**:subtitleStyle / subtitlePosition / subtitleSize / highlightRules
- **bgm**:bgmStyle / bgmVolume / bgmRules
- **review**:referenceVideoIds / qualityRules / failureRules / acceptanceRules

> V1 允许按实际需要精简,不必填满所有字段;未填字段视为"未约束,由 Agent 默认处理"。

---

## 六、Skill 调用流程(目标态)

```
用户需求 → Agent 判断视频类型 → 选 Skill
  → 读取 企业定位 + skill.json + 素材索引
  → 生成脚本(scriptPrompt + hook/structure/tone/cta 规则)
  → 生成 edit plan(素材匹配 + 镜头编排 + 转场/时长)
  → 生成配音/字幕/BGM 参数
  → 调用 MoneyPrinterTurbo 执行
```

---

## 七、与自动化剪辑工作台的关系

- **普通员工**:Agent 按 Skill 自动完成,不需要进工作台
- **高级用户 / 管理员**:生成计划后进入工作台人工调整(四栏:01 视频内容 / 02 素材与画面 / 03 配音与音乐 / 04 字幕样式)
- 未来支持:`[查看剪辑方案] [打开高级编辑] [开始生成]`

---

## 八、迭代约定

- 本轮**只建结构占位**,不写完整 Prompt(避免与 Agent 审计冲突)
- 真正内容后续结合:企业定位 + 人工优秀视频分析 + 真实成片测试 持续迭代
- 每轮成片测试结论应回写对应 `skill.md` 的失败规则 / 验收规则
