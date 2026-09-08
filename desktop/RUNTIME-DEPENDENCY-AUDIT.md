# 知衡智企 桌面现场测试版 —— Runtime Dependency Audit

审计日期：2026-09-06
审计范围：`D:\知衡智企`（main 分支工作树，当前真实跑通的 Agent-native Editing 主链路）
+ 关联 worktree `D:\知衡智企-agent-pipeline`、`D:\知衡智企-pjd-adapter`（同仓库，仅作为开发分支参考）

审计结论先行：**FFMPEG_RUNTIME_REQUIRED = NO**；Git / GitHub / npm / PyPI / 系统 Python / 系统 Node 在客户运行时全部 NOT_REQUIRED。

---

## 1. 当前主链路（以真实跑通的 Agent-native Editing 为准）

```
Product UI
 → Agent（src/lib/workspaces/agent-auto-edit.ts：runAgentAutoEditPipeline）
 → workspace / material search（src/lib/agent/video-asset-index.ts → video-assets-detailed.json 索引）
 → LLM（src/lib/ai → DB provider_profiles → volcengine-ark 等业务 API，仅视觉包装规划/视频计划）
 → TTS（src/lib/voice-service/client.ts → VOICE_SERVICE_URL /v1/tts → 豆包 seed-tts-2.0 业务 API）
 → Video Plan（UnifiedTimelineV2）
 → Validator（src/engines/zhiheng-renderer/validator）
 → Preflight（automation-execution-preflight.ts → validateAutomationExecutionAssets）
 → JianYingAdapter（src/engines/jianying-adapter/adapter.ts）
 → Python Worker（src/engines/jianying-adapter/python-worker，python -m zhiheng_jianying_worker）
 → pyJianYingDraft（fork，commit fdd9c04fd44257222aa1af45fdd7c4ac029e652e）
 → 剪映草稿
```

黄金测试脚本：`scripts/golden-emphasis-rerun.ts`（固定饮料 7 句，useLlm=false，TTS_NATIVE 36 条字幕已验证）。

---

## 2. 逐项审计结果

| 依赖项 | 判定 | 说明 |
|---|---|---|
| Node.js | BUNDLE（Electron 自带） | Electron 33 内置 Node 20.18；客户机 PATH 无需 node.exe |
| Electron | BUNDLE | 桌面壳，安装包随附 |
| Next.js | BUNDLE | `next build`（standalone）→ runtime/next-server；客户机以 Electron 内置 Node 以 `ELECTRON_RUN_AS_NODE=1` 启动 server.js |
| better-sqlite3 | BUNDLE | v13.0.3 为 N-API 预编译（`prebuilds/win32-x64.node` 内含 napi 标记），Electron 与 Node 通用，无需 electron-rebuild |
| sharp（如被业务引用） | BUNDLE | N-API 预编译，Electron 兼容 |
| Python Worker | BUNDLE（自包含 EXE） | PyInstaller onefile → `zhiheng-editing-worker.exe`；客户机零 Python/pip/venv |
| pyJianYingDraft fork | BUNDLE + JIANJING_PROVIDED 无关 | 随包 bundled 目录 `runtime/pjd/pyJianYingDraft`（无 .git）；固定 commit `fdd9c04f`；运行期 SHA256 树指纹校验（构建期固化） |
| pymediainfo + MediaInfo.dll | BUNDLE | 打入 Worker EXE（--collect-all pymediainfo）；PJD VideoMaterial 时长探测用 |
| imageio / numpy / pillow / uiautomation / comtypes | BUNDLE | PJD 包导入链依赖，随 Worker EXE |
| SQLite / DB | BUNDLE | better-sqlite3 + drizzle migrate；DB 文件在 %LOCALAPPDATA%\ZhihengZhiqi\data\（与程序分离） |
| FFmpeg | **NOT_REQUIRED** | 见 §3 |
| ffprobe | **NOT_REQUIRED** | 见 §3 |
| Git | NOT_REQUIRED | PJD 校验改为构建期固化指纹 + 运行期本地 SHA256（pjd_source desktop 模式）；开发期仍用 Git |
| GitHub | NOT_REQUIRED | 客户运行时零 GitHub 访问；无 GitHub Release 依赖 |
| Bun | NOT_REQUIRED（仅开发构建） | 本机构建用 npm（bun 未装亦可）；客户机无需 bun |
| npm / npx | NOT_REQUIRED（仅开发构建） | 客户运行时零 npm registry 访问 |
| pip / PyPI | NOT_REQUIRED（仅开发构建） | Worker EXE 已内嵌全部 Python 依赖 |
| 外部 DLL（除 MediaInfo） | NOT_REQUIRED | 业务主链路不加载额外第三方 DLL |
| videoeditor.dll | JIANJING_PROVIDED | 桌面版 Jianying Runtime Resolver 从客户已装剪映解析，不重新分发（见 §5） |
| 字体 | SYSTEM | 剪映 PJD 文本对象使用系统字体（JianyingPro 运行时自带）；安装包不下载字体 |
| 系统 Runtime | SYSTEM | Windows 10/11 自带（无 VC++ Redist 额外要求，Electron 静态链接） |
| 环境变量 | BUNDLE | 桌面主进程统一装配（DATABASE_PATH / STORAGE_ROOT / ZHIJING_PYTHON / ZHIHENG_PJD_ROOT / ZHIHENG_PJD_FINGERPRINT / VOICE_SERVICE_URL 等） |
| 本地端口 | BUNDLE | Next 127.0.0.1 随机端口 + TTS 桥 127.0.0.1 随机端口 |
| LLM API | BUSINESS_API | 保留业务调用（provider_profiles 存 DB，密钥经设置页写入） |
| TTS API | BUSINESS_API | 保留豆包 seed-tts-2.0 业务调用（桌面 Node 直连；凭据 safeStorage） |
| 文件路径 | BUNDLE | runtime-paths.cjs 统一解析（%LOCALAPPDATA%\Programs\ZhihengZhiqi + %LOCALAPPDATA%\ZhihengZhiqi） |

---

## 3. FFmpeg 专项审计（全仓搜索）

搜索：`ffmpeg|ffprobe|fluent-ffmpeg|FFMPEG_PATH|FFPROBE_PATH`（大小写不敏感，50 处命中）。

命中分类结论：

| 类别 | 位置 | 判定 |
|---|---|---|
| 旧视频合成路线（moneyprinterturbo / zhiheng-renderer 渲染链路） | `src/engines/moneyprinterturbo/**`、`src/engines/zhiheng-renderer/**` | 历史代码/旧路线，桌面版不走；不打包 |
| 开发期脚本 | `scripts/**`（ffprobe 探测等） | 开发工具；不进入客户运行时 |
| Template-first 实验（729 库） | 外部 `D:\剪映草稿模板` | 非主路线，不打包 |
| voice-service（FastAPI）VAD/时长 | `services/voice-service/app/utils.py`（ffmpeg silencedetect + ffprobe 时长） | **开发期代理**；桌面版改为：TTS 时长取自 TTS_NATIVE 词时间戳 + 纯 Node MP3 帧解析；speech_segments=null（TTS_NATIVE 为主通道，已验证 36 条不退化） |
| 测试/夹具 | `tests/**` | 不进入运行时 |
| 仅 metadata 读取 | 素材索引（video-assets-detailed.json） | 索引为构建期生成 JSON，运行时只读 JSON，不需要 ffprobe |

结论：
- 正式主链路（Agent → Timeline → Validator → Preflight → PJD → 剪映草稿）**零 FFmpeg 调用**。
- 素材时长/分辨率/FPS 全部来自 `video-assets-detailed.json`（构建期索引）与 PJD 的 pymediainfo（MediaInfo.dll，随 EXE）。
- 唯一曾依赖 FFmpeg 的 voice-service VAD 已被桌面 TTS 桥替代（TTS_NATIVE 主通道）。
- **FFMPEG_RUNTIME_REQUIRED = NO，且已从客户 Runtime 移除**（安装包内不含任何 ffmpeg.exe / ffprobe.exe）。

## 4. Git / GitHub 专项审计

- 开发期：Git 用于三个 worktree 分支开发（本轮不 commit / 不 push）。
- 客户运行时：全仓运行时路径无 `git` 子进程需求；原 `pjd_source.py` 的 git 校验（git rev-parse / git status / git remote）在桌面模式切换为：
  - 构建期：将 fork 源码（无 .git）拷贝入安装包，计算确定性 SHA256 树指纹 → desktop-runtime-manifest.json（pjdSHA256）
  - 运行期：Worker 桌面模式按 `ZHIHENG_PJD_FINGERPRINT` 对 bundled 目录重算指纹比对，并校验实际导入的 pyJianYingDraft 模块位于 bundled 目录内
  - `repositoryRemote = "bundled@fdd9c04f"`，无 GitHub 访问

## 5. videoeditor.dll

- 判定：JIANJING_PROVIDED。
- 桌面实现：`desktop/main/jianying-resolver.cjs` 自动检测剪映安装目录（D:\JianyingPro、Program Files 等）→ 版本目录 → `videoeditor.dll` 绝对路径；状态 READY / NOT_FOUND / UNVERIFIED_VERSION / MISSING_COMPONENT。
- 不把剪映内部二进制写入安装包。

## 6. 剪映版本 Profile

- 当前 VERIFIED：`11.3.0.14362`（本机真实验证）。
- 其他版本允许检测，UI 明示 UNVERIFIED_VERSION，不静默声称兼容。

## 7. 密钥与凭据

- 不硬编码进 JS / asar / config.json / Git。
- LLM：provider_profiles（本地 SQLite），设置页写入。
- TTS：Windows safeStorage（DPAPI）加密 → `%LOCALAPPDATA%\ZhihengZhiqi\config\secure-config.json`。
- 开发机 .env.local / data/.voice-service-env 的测试凭据不复制进安装包；内部测试迁移走显式开关 `ZHIHENG_ALLOW_DEV_SECRET_IMPORT=1`。

## 8. 本机环境事实

- 本机开发工具：node v22.23.2、npm 10.9.8、Python 3.11.15（poc-venv，已验证 worker 环境）、无 bun、无系统 ffmpeg（仅剪映自带 stripped 版与 imageio-ffmpeg 构建期工具）。
- 剪映：D:\JianyingPro\11.3.0.14362（VERIFIED）。
- PJD fork：D:\剪映智剪测试\pyJianYingDraft-fork-v0，HEAD=fdd9c04fd44257222aa1af45fdd7c4ac029e652e。
