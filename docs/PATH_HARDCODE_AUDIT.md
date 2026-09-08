# PATH_HARDCODE_AUDIT — 知衡智企系统资产路径硬编码审计

生成时间：2026-09-06
审计范围：`D:\知衡智企\src\`（开发版）
审计目标：识别所有硬编码绝对路径 / process.cwd() 相对路径，分类并标注迁移状态。

---

## 分类定义

- **MIGRATED** — 已通过 `resolveSystemAsset()` / `resolveWorkspaceAsset()` 统一解析
- **NEEDS_MIGRATION** — 业务相关路径，未来应迁移到统一 Resolver
- **DEV_ONLY** — 注释、示例、诊断输出中的路径，不影响运行时
- **TEST_ONLY** — 测试代码 / fixtures 中的路径
- **DO_NOT_TOUCH** — Runtime 内部路径、剪映相关路径、已有 env override 的路径

---

## MIGRATED（已迁移，5 处）

| # | 文件 | 路径/模式 | 迁移方式 |
|---|------|-----------|----------|
| 1 | `src/lib/agent/skill-loader.ts` | `skills/video-editing` (cwd相对) | `resolveSystemAsset('editingSkillRoot')` + legacy fallback |
| 2 | `src/lib/workspaces/visual-resource-registry.ts` | 视觉资源库/模板库/校准/索引 | `resolveVisualResourceRegistryRoot()` 等 wrapper → `resolveSystemAsset()` |
| 3 | `src/engines/zhiheng-renderer/packaging-asset-resolver.ts` | `process.cwd()/assets` (01_音效库等) | `PackagingAssetResolver.create()` → `resolveSystemAsset('visualResourceRegistryRoot')` + legacy fallback |
| 4 | `src/engines/zhiheng-renderer/renderer.ts:320` | `new PackagingAssetResolver()` | 改为 `await PackagingAssetResolver.create()` |
| 5 | `src/lib/system-assets/defaults.ts` | 所有 `D:\知衡智企数据库\...` 默认值 | **这是默认路径的唯一合法位置**，集中管理 |

---

## NEEDS_MIGRATION（待迁移，4 处）

| # | 文件 | 路径/模式 | 说明 | 建议 key |
|---|------|-----------|------|----------|
| 1 | `src/lib/workspaces/moneyprinter-engine.ts:77` | `C:\Python312\python.exe` | Legacy moneyprinter engine，非 Agent-native 主链路 | runtime internal，未来可走 RuntimeAssetKey |
| 2 | `src/app/api/workspaces/[slug]/automation/assets/route.ts:200` | `process.cwd()/public/uploads/automation-assets` | Workspace 素材上传目录 | `resolveWorkspaceAsset(wsId, 'materialRoot')` 派生 |
| 3 | `src/app/api/profile/avatar/route.ts:10` + `src/app/api/system/employees/avatar/route.ts:10` | `process.cwd()/public/uploads/avatars` | 用户/员工头像目录 | Workspace asset 或 runtime internal |
| 4 | `src/app/dashboard/voices/videos/page.tsx:494` | `process.cwd()/public/...` | 语音视频文件路径 | Workspace asset |

---

## DEV_ONLY（开发期/注释/诊断，5 处）

| # | 文件 | 说明 |
|---|------|------|
| 1 | `src/app/api/system/storage/select-directory/route.ts:18` | 注释中的示例路径 `"D:\\企业资料\\客户资料"` |
| 2 | `src/engines/jianying-adapter/python-worker/.../pjd_source.py:17` | 注释中的 PJD 仓库路径 |
| 3 | `src/engines/jianying-adapter/python-worker/.../pjd_bridge.py:4` | 注释中的参考脚本路径 |
| 4 | `src/app/api/desktop/selftest/route.ts:172` | 诊断输出中的 `cwd=${process.cwd()}` |
| 5 | `src/app/api/desktop/runtime/route.ts:54` | 诊断输出中的 cwd 变量 |

---

## TEST_ONLY（测试代码，2 处）

| # | 文件 | 说明 |
|---|------|------|
| 1 | `src/engines/jianying-adapter/python-worker/tests/test_pjd_source.py:4` | 测试中的 PJD fork 路径 |
| 2 | `src/engines/jianying-adapter/contract.ts:164` | `__fixtures__` 测试夹具目录 |

---

## DO_NOT_TOUCH（Runtime 内部 / 剪映 / 已有 env override，12 处）

| # | 文件 | 路径/模式 | 原因 |
|---|------|-----------|------|
| 1 | `src/app/api/desktop/selftest/route.ts:75` | `D:\JianyingPro`, `C:\Program Files\JianyingPro` | 剪映安装路径检测，Runtime Resolver 职责 |
| 2 | `src/lib/workspaces/jianying-assembly.ts:82,87` | 剪映草稿目录 | 已有 `ZHIHENG_JIANYING_DRAFT_ROOT` env override |
| 3 | `src/lib/storage/index.ts:34` | `STORAGE_ROOT \|\| cwd/data` | Workspace 数据根，已有 env override |
| 4 | `src/lib/settings/video-engine.ts:10` | `engines/moneyprinterturbo` | Legacy engine 目录 |
| 5 | `src/lib/service-manager/auto-start.ts:70,85,87` | `scripts/`, `logs/` | Runtime 内部服务管理 |
| 6 | `src/engines/zhiheng-renderer/renderer.ts:102` | `tmp/zhiheng-renderer` | Renderer 临时工作目录 |
| 7 | `src/engines/zhiheng-renderer/environment.ts:94` | `bin/ffmpeg` | FFmpeg 捆绑目录（主链路不调用 FFmpeg） |
| 8 | `src/engines/jianying-adapter/resource-map-data.ts:36` | resource-map 数据 | 已有 `ZHIHENG_RESOURCE_MAP` env override |
| 9 | `src/engines/jianying-adapter/worker-client.ts:99` | `python-worker` 目录 | 已有 `ZHIHENG_WORKER_ROOT` env override |
| 10 | `src/app/api/desktop/diagnostics/route.ts:52` | runtime manifest 路径 | Desktop runtime 内部 |
| 11 | `src/app/api/workspaces/[slug]/voices/clone/route.ts:138` | `repoRoot = process.cwd()` | 语音克隆 runtime 内部 |
| 12 | `src/lib/workspaces/moneyprinter-engine.ts:50` | `repoRoot = process.cwd()` | Legacy engine runtime 内部 |

---

## 统计

| 分类 | 数量 |
|------|------|
| MIGRATED | 5 |
| NEEDS_MIGRATION | 4 |
| DEV_ONLY | 5 |
| TEST_ONLY | 2 |
| DO_NOT_TOUCH | 12 |
| **合计** | **28** |

---

## 迁移优先级建议

1. **高**：workspace asset 相关（automation-assets、avatars、voices videos）— 影响客户数据隔离
2. **中**：moneyprinter-engine Python 路径 — legacy engine，非主链路
3. **低**：其余均为 runtime internal 或 dev-only，无需迁移
