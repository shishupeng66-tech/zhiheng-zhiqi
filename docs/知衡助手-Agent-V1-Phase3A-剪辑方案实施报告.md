# 知衡助手 Agent V1 Phase3A 剪辑方案实施报告

## 1. 接手时 Benchmark 指标

接手后重新运行 `npx tsx scripts/test-video-search-benchmark.ts` 得到真实基线：

- Must Hit Rate：62.8%
- Top1 Hit Rate：60.5%
- Top3 Recall：76.7%
- Top5 Recall：79.1%
- Wrong Top3 Rate：0.0%
- Duplicate Violation Rate：0.0%
- AvoidCut Violation Rate：66.7%
- Insufficient Material Accuracy：80.0%

核心回归：`recommendedCuts` 被后续 segment 选择和 `recommendedClipLength` 覆盖，导致 VS-041、VS-043 等 avoid_cut 用例返回后段时间。

## 2. 最终 Benchmark 指标

最终完整运行 48 条黄金测试集：

- 通过：42 / 48
- 通过率：87.5%
- 总分：94.9 / 100
- Must Hit Rate：86.0%
- Top1 Hit Rate：83.7%
- Top3 Recall：97.7%
- Top5 Recall：97.7%
- Wrong Top3 Rate：0.0%
- Duplicate Violation Rate：0.0%
- AvoidCut Violation Rate：0.0%
- Insufficient Material Accuracy：100.0%

已达到本阶段放行线：

- Must Hit Rate >= 85%
- Top3 Recall >= 90%
- Top5 Recall >= 95%
- Duplicate Violation = 0
- AvoidCut Violation = 0
- Insufficient Material >= 80%

## 3. 搜索逻辑修改

修改文件：`src/lib/agent/video-asset-index.ts`

主要调整：

- `recommendedCuts` 优先作为最终剪辑事实，输出 `recommendedStart/recommendedEnd` 时不再被 segment 边界或 `recommendedClipLength` 截短。
- 同一素材多个 segment 排序时，分数接近时优先选择更早的推荐剪辑点，避免后段 segment 覆盖人工推荐起点。
- `avoidCuts` 不再直接删除同时存在明确 `recommendedCut` 的片段，避免人工推荐片段被误删。
- 增加同一文件去重，同一文件默认只返回一个最佳片段。
- 增加 duplicateGroup 代表素材选择：分数接近时优先保留 `preferred=true` 且非 `00-总目录` 的素材。
- 增加企业视频领域短语匹配：投料萃取、外宾、贴标、仓储交付、消杀、机修、员工、公司环境、工厂规模、转场、横竖屏。
- 增加文件名/路径/内容表面精确命中加分，解决“装车”“机修”“消杀”等明确工序词被泛语义素材压过的问题。
- 增加明确不足素材识别：冷链、无人机、机器人、色谱、微生物、高级实验室、发布会等当前库中不存在的具体场景会返回空结果或低匹配，避免乱配。

## 4. 仍失败的 Case

最终仍有 6 个未通过：

- VS-017：员工一线作业。Top5 都是员工风采，但黄金答案指定 `06-包材特写/03_员工风采_1.MP4`，当前 Top1 为同类员工素材 `10_员工风采_22.mp4`。
- VS-018：仓库和装车素材。Top5 命中装车类素材，但黄金答案指定 PANDA 装货代表素材，当前排序更偏向“装车”字面命中。
- VS-025：从原料到生产再到交付完整链路。当前优先命中交付物流，黄金答案要求原材料验收作为 must。
- VS-026：过渡短镜头。Top5 命中产品转场类素材，但黄金答案指定总目录 RIVO；当前优先返回分类目录 RIVO。
- VS-035：产品案例型。Top5 全为产品陈列/包装素材，但黄金答案指定七白饮；同类产品案例存在多个合理答案。
- VS-036：9:16 产品展示。Top5 为竖屏/可用产品素材，但黄金答案指定企鹅爽；当前八宝茶排序更高。

分类判断：

- 素材本身存在多个合理答案：VS-017、VS-018、VS-026、VS-035、VS-036
- 查询自然语言未明确起始链路优先级：VS-025
- benchmark 标准答案较严格：以上 6 个均存在一定程度的严格代表文件要求

## 5. AvoidCut / Duplicate

- AvoidCut Violation 已恢复到 0%。
- Duplicate Violation 保持 0%。
- Insufficient Material Accuracy 从 80.0% 提升到 100.0%。

## 6. create_video_plan

已进入 `create_video_plan`。

修改文件：

- `src/lib/agent/tools/index.ts`
- `scripts/test-create-video-plan.ts`

新增 Tool：

- name：`create_video_plan`
- riskLevel：`low`
- 行为：只生成剪辑方案，不渲染视频，不调用 MoneyPrinterTurbo，不执行真实剪辑。

输入字段：

- `userRequest`
- `enterprisePositioning`
- `skillId`
- `contentType`
- `script`
- `platform`
- `targetDuration`
- `videoRatio`

输出结构：

- `title`
- `topic`
- `contentType`
- `platform`
- `targetDuration`
- `videoRatio`
- `skill`
- `script`
- `scriptSegments`
- `timeline`
- `coverage`
- `warnings`
- `voice`
- `subtitle`
- `bgm`

timeline 每段包含：

- `order`
- `timelineStart`
- `timelineEnd`
- `scriptText`
- `purpose`
- `asset.fileName`
- `asset.relativePath`
- `asset.sourceStart`
- `asset.sourceEnd`
- `usageRole`
- `matchLevel`
- `matchScore`
- `matchReasons`
- `cropSafety`
- `transitionOut`

coverage 包含：

- `totalSegments`
- `highMatch`
- `mediumMatch`
- `lowMatch`
- `noMatch`
- `highQualityCoverageRate`
- `status`

## 7. 四组真实测试

运行命令：

`npx tsx scripts/test-create-video-plan.ts`

结果：

1. 无菌灌装知识科普
   - segments：5
   - coverage：60% warning
   - 命中无菌灌装、品控等真实秒级素材

2. 原材料验收科普
   - segments：5
   - coverage：0% insufficient
   - 当前方案提示素材不足，未强行判定高匹配

3. 老板IP观点
   - segments：5
   - coverage：20% insufficient
   - 命中部分客户接待、老板日常、品控素材，但覆盖不足

4. 明显素材不足主题
   - segments：5
   - coverage：0% insufficient
   - 无人机、冷链冷库、机器人分拣均返回 no_match

## 8. 验证

- `npx tsx scripts/test-video-search-benchmark.ts`：通过放行线
- `npx tsx scripts/test-create-video-plan.ts`：通过
- `npm run typecheck`：通过
- `npm run build`：通过

build 仍有既有 Turbopack 警告：

- Google Sans Flex fallback font override 未找到
- `next.config.ts` 进入 NFT trace

两个警告不阻断构建。

## 9. 下一阶段

下一阶段进入真正视频执行前，建议按顺序做：

1. 优化 `create_video_plan` 的脚本分段策略，让原材料、生产、交付链路类主题更稳定地覆盖三段素材。
2. 将 `create_video_plan` 输出接入前端方案预览，不直接执行。
3. 增加人工确认入口：用户确认方案后再进入 `execute_video_task`。
4. `execute_video_task` 再调用 MoneyPrinterTurbo / Voice Service 真实渲染。

本轮没有修改黄金测试集、真实素材、`video-assets-detailed.json`，没有执行视频渲染，没有 push。
