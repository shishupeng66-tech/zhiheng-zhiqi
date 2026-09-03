# Automation Editing V1 —— 冻结记录

- 冻结日期：2026-09-03
- E2E 状态：AUTOMATION_EDITING_V1_E2E_PASS（人工确认剪映 GUI）
- 执行器：jianying（默认）；MoneyPrinter = legacy（保留，不进新主链）

## V1 正式链路

产品页面（自动剪辑工作台）
→ Agent（脚本提取/扩写）
→ 企业素材搜索（真实索引 search_video_assets）
→ Voice Service（真实 1.3x 最终配音）
→ Video Plan
→ UnifiedTimelineV2（schemaVersion=2）
→ Validator
→ Execution Asset Preflight
→ JianYingAdapter.generateDraft()
→ Python Worker（zhiheng_jianying_worker）
→ 高版本 PJD fork
→ 剪映 11.3 草稿（draft_content.json + draft_meta_info.json + root_meta_info 注册）

## 环境版本

- 剪映：11.3.0.14362
- PJD repository：aoguai/pyJianYingDraft
- PJD commit：`fdd9c04fd44257222aa1af45fdd7c4ac029e652e`（上游 `4a7730c9a14e91aa497e723c85b5c433a62a163c`）
- PJD package：fork-v0@4a7730c9；PJD 根：环境变量 `ZHIHENG_PJD_ROOT`（外部 clone，不入主仓）
- Contract 版本：0.1.0
- Timeline 版本：2（UnifiedTimelineV2）
- PJD 来源校验：remote 精确匹配 / HEAD 40 位全量相等 / sourceDirty=false / module.__file__ 位于 PJD_ROOT 内

## 测试结果（提交前）

- TS JianYing Adapter tests：35/35 PASS
- Python Worker tests：54/54 PASS
- UnifiedTimelineV2 validator tests：11/11 PASS
- Execution Asset Preflight：PASS（C1 资产合法 / C2 资产缺失 / C3 越界，逻辑正确）
- failure-path regression：PASS（bad assetRoot → PATH_OUTSIDE_ALLOWED_ROOT；missing asset → ASSET_NOT_FOUND；基线 ok）
- Agent upstream dry-run：链路可跑通（真实搜索 + 方案 + 配音 + timeline；voice 长于 video 的时长对齐属 Editing Skill 调优，非执行层回归）
- PJD source verification：PASS
- typecheck：无新增错误（仅历史 pre-existing：.next/types、scripts/test-zhiheng-renderer-official-cut.ts）

## 真实产品 E2E（2026-09-03）

- 产品页面 URL：`/dashboard/workspaces/enterprise-media`
- 草稿：`ZHIHENG-PRODUCT-E2E-V1-20260903-182115`，时长 24.1s
- 轨道：视频 6 / 字幕 6 / 关键词花字 3 / 配音 1（真实 1.3x，23.71s）
- 素材覆盖：highMatch 6/6，覆盖率 100%
- sourceAudioMuted：全部 true
- 任务状态：页面 completed，刷新后恢复 completed
- 剪映首页可见草稿、双击正常进入、无损坏提示（人工确认）

## 冻结说明

- 默认执行器 = jianying；MoneyPrinter = legacy。
- 后续剪辑质量问题（节奏 / 花字 / 字幕样式 / 转场 / BGM-SFX / 镜头选择 / 配音时长对齐）进入 **Editing Skill** 阶段处理，不再修改本执行层。
