# 知衡智企 Template Pipeline（通用母版替换流水线）

> 把「人工剪映母版 → 可复用模板资产 → 按模板生成新视频」整条流程固化为通用流水线。
> **流水线是通用的，模板资产是每套模板自己的。**

## 一、流水线步骤（通用）

```
step1_decrypt.py  母版草稿解密（剪映 DLL staging + PJD codec）
step2_reverse.py  母版结构逆向（文字槽 / 视频槽 / 轨道）
step3_build_asset.py  生成模板资产（slot map + 约束 + 素材映射）
step4_fill.py  按资产替换（文字等字数 + 视频素材）→ 新草稿
step5_verify.py  结构 diff 验证（只允许文字与视频引用变化）
```

任意新母版草稿都走同一条流水线，**不需要改代码**，只需要提供：
1. 母版草稿目录（剪映导出的加密草稿）
2. 文字替换方案（新文案，等字数）
3. 素材映射方案（视频槽 → 素材库素材）

## 二、模板资产（每套模板自己的说明书）

模板资产 JSON 至少包含：
- `templateInfo`: 画幅 / 时长 / 轨道结构
- `textSlots`: 每个文字槽（segmentId / 原文 / 字数 / 角色 / 资源类型 / 时间点）
- `mediaSlots`: 每个视频槽（materialId / 时间段 / 原素材 / 语义）
- `replacementPlan`: 替换方案（text: segmentId→新文; media: materialId→素材）
- `constraintMode`: 约束策略（当前 EXACT_CHAR_COUNT）

## 三、Agent 调用方式（未来）

```
用户: "按 0828-饮品贴牌避坑 模板，剪一条 XX 饮料的视频"
Agent:
  1. 查模板库 → 找到该模板的 template-asset.json
  2. LLM 按 textSlots + constraint 生成新文案（等字数）
  3. 按 mediaSlots 语义从素材索引检索素材
  4. step4_fill.py 替换 → 新草稿
  5. step5_verify.py 验证 → 输出
```

## 四、已验证模板

| 模板ID | 模板名 | 画幅 | 时长 | 文字槽 | 视频槽 | 状态 |
|--------|--------|------|------|--------|--------|------|
| 0828-yinpin-tiepai-bikeng | 饮品贴牌避坑 | 9:16 (810x1440) | 53.6s | 36 | 17 | testing（人工验收通过） |

模板资产位置:
`D:\知衡智企数据库\知识库\06_Video_Editing_Skills\semantic-template-editing\templates\0828-饮品贴牌避坑\`

## 五、环境依赖（已验证）

- Python: `D:\剪映智剪测试\poc-venv\Scripts\python.exe`
- PJD fork: `D:\剪映智剪测试\pyJianYingDraft-fork-v0`
- 剪映安装: `D:\JianyingPro\11.3.0.14362`（DLL 带后缀，需 staging 硬链接）
- 剪映草稿根: `C:\Users\Administrator\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft`
- 素材库根: `D:\知衡智企数据库\知识库\30_素材资源\视频库\` + `video-assets-detailed.json` 索引

## 六、注意事项

1. 原母版草稿只读，每次生成新草稿 = 复制母版目录 + 替换 + 独立时间戳命名
2. 明文 draft_content.json 剪映可直接加载（已验证）
3. 文字替换必须等字数（styles/words 字数相同无需重算，避免视觉漂移）
4. 视频替换只改 path/duration/width/height，不动 transform/动画
5. 视觉验收必须人工（PENDING_USER_REVIEW → HUMAN_APPROVED）
