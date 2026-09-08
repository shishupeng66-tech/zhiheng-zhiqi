# 朋友电脑测试清单（FRIEND-PC-TEST-CHECKLIST）

> 目的：在**没有开发环境**的普通 Windows 电脑上，验证知衡智企桌面版能否完整跑通「一键出剪映草稿」。
> 预计耗时：首次 30–40 分钟。

---

## 本机已实测通过（2026-09-06，安装版，非开发目录）

- Setup EXE 静默安装 → 安装目录 `C:\Users\Administrator\AppData\Local\Programs\zhiheng-zhiqi-desktop\`
- 安装版启动成功（开始菜单图标「知衡智企」）→ Next 生产 UI 就绪（127.0.0.1 随机端口）
- Environment Doctor：overall=READY（Worker / PJD / DB / Skill / 剪映全 READY，路径全部来自安装目录）
- Runtime Self Test：overall=PASS（electron / next_ui / backend / worker / database / jianying / llm / tts / validator 全 PASS）
- 黄金脚本（固定 7 句饮料文案，useLlm=false）：ok=true，validation.valid=true，subtitleTrack=36，textOverlayTrack=20，assembly=ok
- 已真实生成剪映草稿：`C:\Users\Administrator\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft\ZHIHENG-PRODUCT-E2E-V1-20260906-163955`（draft_content.json 288,451B + draft_meta_info.json 5,746B；另一份 162628 亦同源通过）
- 诊断包导出成功：`zhiheng-diagnostic-20260906-162644.zip`（10,112B，含 doctor/任务摘要/日志/指纹，无素材无密钥）

---

## 测试前（准备）

- [ ] 1. 确认电脑是 Windows 10 或 Windows 11
- [ ] 2. 确认已安装剪映（专业版/国际版均可，最好与验证版 11.3.0.14362 相同；版本不同也可用，会提示"未验证版本"）
- [ ] 3. 把 `知衡智企-Setup-0.1.0-fieldtest.exe` 复制到电脑（可放到桌面）
- [ ] 4.（可选）确认 SHA256 一致：在安装包所在文件夹打开 PowerShell，运行
      `Get-FileHash .\知衡智企-Setup-0.1.0-fieldtest.exe -Algorithm SHA256`
      对比交付信息中的 SHA256（当前：`F07D62C59B976EED30428944E3DFAA81126A5895C6EC429D8A699BE3E6EEF64F`）。

## 安装与首次启动

- [ ] 5. 双击安装包 → 按提示安装（程序会装到用户目录，无需管理员权限）
- [ ] 6. 从开始菜单或桌面快捷方式打开「知衡智企」
- [ ] 7. 打开后先看「环境诊断」页（Environment Doctor）：
      - Worker / PJD / 数据库 / Editing Skill 应为 READY
      - 剪映 应为 READY 或 UNVERIFIED_VERSION（显示实际版本号）
      - GitHub / Git / npm / PyPI / FFmpeg 应为 NOT_REQUIRED
- [ ] 8. 点「运行环境自检」（Runtime Self Test）→ 期待 DESKTOP_RUNTIME_READY（LLM/TTS 未配置时会标 WARN，属正常）

## 配置业务 API

- [ ] 9. 在「首次初始化 / 设置」里填写 LLM API（Base URL + API Key + 模型）与 TTS API（豆包语音 Key + Resource ID + 声音）
      —— 密钥只存本机（Windows 加密存储），不会进安装包
- [ ] 10. 重新自检，LLM / TTS 应为 READY

## 选择素材并生成

- [ ] 11. 选择测试素材目录（如 `D:\客户项目\素材`；首次会自动放入随包黄金测试素材，共 8 段）
- [ ] 12. 运行「固定黄金脚本」（饮料代加工报价 7 句，纯字幕+配音+包装，不使用 LLM 文案）
- [ ] 13. 等待生成完成 → 页面显示 Timeline / Validator / Preflight 均通过，产出剪映草稿（draft_content.json）
- [ ] 14. 打开剪映 → 项目草稿中出现新草稿 → 打开

## 剪映内检查

- [ ] 15. 字幕：7 句字幕、时间轴对齐、36 条词级时间戳与高亮（逐词高亮/分段）
- [ ] 16. 配音：音频轨道有 TTS 配音（时长与字幕匹配）
- [ ] 17. 素材：8 段视频素材按计划排列，有标签帧（如"饮料代加工报价"等）
- [ ] 18. 包装：标题钩子、强调字、信息墙等包装元素在画面中
- [ ] 19. 导出试看：可正常导出 MP4

## 验证 Skill 热更新（可选但推荐）

- [ ] 20. 打开 `%LOCALAPPDATA%\ZhihengZhiqi\Skills\editing\current\`（没有就新建），放一个修改过的 Editing Skill（改强调字风格等）
- [ ] 21. 回到知衡智企再跑一次黄金脚本 → 新草稿应体现修改（不需要重装/重新构建）

## 收尾

- [ ] 22. 在「诊断」页点「导出诊断包」→ 得到 `zhiheng-diagnostic-YYYYMMDD-HHmmss.zip`（不含客户素材和密钥）
- [ ] 23. 把诊断包发回开发（如需要排查）

---

## 出现问题时的速查

| 现象 | 处理 |
|---|---|
| 剪映检测 NOT_FOUND | 确认剪映已安装；装在非默认路径时在设置里手动填剪映安装目录 |
| Worker 自检失败 | 看诊断页 Worker 状态与日志；先重装一次安装包 |
| TTS 无声音 | 检查 TTS API 配置与网络；可先跑一次「短请求测试」 |
| LLM 连接失败 | 确认 Base URL / Key / 模型名；Ark 模型名要带日期后缀 |
| 生成草稿后剪映打不开 | 剪映版本不是 11.3.0.14362 时属 UNVERIFIED，先手工新建一个草稿测试剪映本身 |

## 重要：测试环境要求（禁止项）

- 不需要安装：Node.js / Bun / Python / Git / FFmpeg / npm
- 不需要访问：GitHub / npm / PyPI
- 安装包已内置全部运行时（Electron + Node + Worker + PJD）
- 唯一的外部依赖：LLM API 与 TTS API（业务接口，需网络）
