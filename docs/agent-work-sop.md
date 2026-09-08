# 知衡智企 · Agent 工作 SOP（路径解析 / 意图路由 / 调用链）

> 版本：v1.0（2026-09-07）
> 适用：知衡智企自动剪辑 Agent 的所有对话式任务
> 核心原则：**Agent 绝不硬编码任何绝对路径。所有路径从「数据存储设置」解析；路径由用户在企业数据存储工作区设置，Agent 只负责按统一 key 调用。**

---

## 一、路径从哪来（唯一来源）

用户在 **系统管理 → 数据存储**（或工作空间数据目录设置）配置全部业务目录，持久化到 `storage_configs` 表。
Agent 侧一律通过统一 Resolver 解析，**禁止**直接拼 `D:\...`、禁止各模块自设默认值。

### 1. Workspace（客户企业）资产 —— `resolveWorkspaceAsset(workspaceId, key)`

| key | 含义 | 数据存储 key | 典型目录（用户可改） |
|---|---|---|---|
| `customerRoot` | 客户资料 | `customers` | 知识库/20_客户资料 |
| `productRoot` | 产品资料 | `products` | 知识库/21_产品资料 |
| `materialRoot` | 剪映模板库（人工母版草稿） | `assets` | 知识库/05_模板/剪映模板库 |
| `videoRoot` | 视频素材库 | `videos` | 知识库/06_视频库 |
| `voiceRoot` | TTS 音频库 | `voices` | 知识库/08_音频库 |
| `knowledgeRoot` | 企业知识库根 | `knowledge` | 知识库根目录 |
| `outputRoot` | 输出 | `assets` | 知识库/05_模板/剪映模板库 |
| `templateRoot` | 企业剪映模板 | `templates` | 知识库/05_模板/企业模板 |

解析返回：`{ key, path, source, exists, writable }`。
优先级：`WORKSPACE 显式覆盖 → DATABASE(用户设置) → DEFAULT(项目推导)`。

### 2. 系统资产（知衡智企产品自身） —— `resolveSystemAsset(key)`

`styleKnowledgeRoot`（剪辑风格知识）、`jianyingTemplateRoot`、`visualResourceRegistryRoot`、`resourceCalibrationRoot`、`resourceIndexRoot`、`editingSkillRoot`。
Agent 知识检索使用，**不**随客户变化。优先级：`DATABASE → ENV → DEFAULT`。

### 3. Runtime 内部 —— Runtime Resolver

`runtimeRoot / workerRoot / pjdRoot / logsRoot / cacheRoot / diagnosticsRoot`。
Agent 一般**不直接访问**；由桌面 Runtime（`runtime-env.cjs` 注入环境变量）内部管理。

---

## 二、意图路由（对话 → 动作）

用户消息进入 `POST /api/workspaces/:slug/automation/agent-run`，按以下顺序判定：

```
1. 模板提取意图（"分析/提取/解析/导入 + 剪映草稿"）
   → runTemplateParse（template-parser Skill）
   → 解密草稿 → 逆向 → template-asset.json 写入 <templateRoot>/<templateId>/
   → 返回：文字槽数 / 素材槽数 / 资产路径

2. 模板剪辑意图（"按 XX 模板剪一条 XX 视频"）
   → decideRoute（模板 ID/名称/片段匹配）
   → runTemplateRoute（template-usage Skill）
   → 复制母版 → 槽位文案（EXACT_CHAR_COUNT 硬约束）→ PJD 替换 → TTS+字幕 → 结构验证
   → 草稿写入剪映草稿根，任务记录写 completed

3. 未指定模板 / 无合适模板 / 明确否定模板
   → 返回 template_required，提示先选择已有企业模板或蒸馏剪映草稿
```

### 关键约束（template-editing-rules）
- **EXACT_CHAR_COUNT**：替换文本必须与槽位原字数严格相等，否则拒绝并重写（LLM 重试 ≤3 次）。
- **禁止**：改 transform / 动画 / resourceId / effectStyleId / duration / 自动缩放 / 自动换行补救。
- 素材替换：Agent 负责语义匹配素材，PJD 负责确定性写入，二者分离。
- 结构验证：`step5_verify`（文字/素材层）+ `step7_verify_voice`（配音/字幕层），`PJD_RELOAD` 不等于 `VALIDATOR_PASS`。

---

## 三、调用链（模板剪辑完整链路）

```
用户："按 XX 模板剪一条 XX 饮料的视频"
  │
  ├─ 0. Agent 解析任务（workspace / 客户 / 产品 / 指定模板？/ 画幅 / 脚本）
  ├─ 1. 模板决策
  │      · 指定 → resolveWorkspaceAsset(templateRoot) 下找 template-asset.json
  │      · 未指定 → 列出 approved/testing 模板让用户选 / 自动匹配
  │      · 无合适 → 阻断，提示先蒸馏或选择模板
  ├─ 2. 业务上下文（resolveWorkspaceAsset: customers/products/knowledgeRoot + videos/images/voices）
  ├─ 3. LLM 生成完整口播脚本（先解决"说什么"）
  ├─ 4. 模板内容适配（template-usage）
  │      · 完整脚本 → 映射 semantic slots → 按约束压缩 → EXACT 校验
  ├─ 5. TTS + 字幕
  │      · generateVoiceAudio（豆包 TTS，VOICE_SERVICE_URL 桌面本地桥）
  │      · 配音写入 voiceRoot，字幕按 TTS_NATIVE timing 生成
  │      · step6_voice：替换配音轨 + 新增底部字幕轨
  ├─ 6. 素材检索（resolveWorkspaceAsset: videoRoot，按 media slot 语义）
  ├─ 7. 草稿生成
  │      · 复制母版 → step4_fill（PJD replace_text + 素材替换）
  ├─ 8. 验证（step5 + step7 + 结构 diff + PJD reload）
  └─ 9. 输出剪映草稿 → 10. 用户剪映验收
```

### 模板提取链路（新模板入库）

```
用户："分析剪映里【8月28日】这篇草稿"
  ├─ resolveParseTarget：剪映草稿根下按名称/路径定位草稿目录
  ├─ runTemplateParse：CLI parse
  │      step1 解密 → step2 逆向 → step3 构建 template-asset.json
  └─ 写入 <templateRoot>/<templateId>/template-asset.json + source/ 母版明文
       （status=testing，需人工验收后才可正式使用）
```

---

## 四、桌面 Runtime 注入（客户机）

| 环境变量 | 用途 | 注入来源 |
|---|---|---|
| `ZHIJING_TEMPLATE_CLI` | 模板管线 CLI EXE | runtime-env → runtime/template-pipeline/zhiheng-template-cli.exe |
| `ZHIHENG_TEMPLATE_PIPELINE_DIR` | 管线脚本/字幕样式目录 | runtime-env |
| `ZHIHENG_DRAFT_ROOT` | 剪映草稿根 | runtime-env（jianying-resolver 检测） |
| `ZHIHENG_JIANYING_DIR` | 剪映版本目录（解密用） | runtime-env（installRoot/primaryVersion） |
| `VOICE_SERVICE_URL` | 豆包 TTS 本地桥 | runtime-env（主进程分配端口） |
| `VOICE_DEFAULT_ID` | 默认音色 | runtime-env |
| `ZHIHENG_PJD_ROOT` | bundled PJD | runtime-env |
| `ZHIHENG_ASSETS_ROOT` | 客户素材根（首次向导） | runtime-env |

开发机（无桌面环境变量）回退：开发 venv python + `D:\知衡智企\scripts\template-pipeline`。

---

## 五、禁止项

1. 禁止在代码/提示词中硬编码 `D:\知衡智企数据库\...` 或任何客户绝对路径。
2. 禁止 Agent 直接读写剪映草稿 JSON（必须经 PJD/CLI）。
3. 禁止把客户模板/素材/脚本提交 Git 或打入安装包。
4. 禁止 PJD 做语义/审美决策；语义归 Agent，写入归 PJD。
5. 禁止把 NOT_REQUIRED 依赖（Git/Node/Bun/Python/FFmpeg）当作失败。
