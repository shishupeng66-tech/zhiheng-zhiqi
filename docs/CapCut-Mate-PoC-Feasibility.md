# CapCut Mate + 剪映专业版自动剪辑 PoC 可行性记录

日期：2026-08-31

## 1. CapCut Mate commit/version

- 仓库：`https://github.com/Hommy-master/capcut-mate`
- 安装路径：`D:\AI-Platform\capcut-mate`
- commit：`4a25879bb031fe95c1d69c3d4ce1c67ca3e19678`
- package version：`1.0.0`

## 2. 剪映专业版版本

- 剪映专业版：`11.3.0.14362`
- 实际运行入口：`D:\JianyingPro\11.3.0.14362\JianyingPro.exe`
- 机器上同时存在 CapCut 国际版：`9.3.0.3970`

## 3. 草稿目录

- 用户路径：`C:\Users\Administrator\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft`
- 实际落盘：`D:\JianyingPro\AppDataLocal\User Data\Projects\com.lveditor.draft`
- 说明：`C:\Users\Administrator\AppData\Local\JianyingPro` 是 junction，指向 `D:\JianyingPro\AppDataLocal`。
- 本次测试草稿：`20260831103402aee9d81c`

## 4. 服务启动方式

```powershell
cd D:\AI-Platform\capcut-mate
$env:DRAFT_URL='http://localhost:30000/openapi/capcut-mate/v1/get_draft'
$env:DOWNLOAD_URL='http://localhost:30000'
$env:DRAFT_SAVE_PATH='C:\Users\Administrator\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft'
$env:ENABLE_APIKEY='false'
uv run main.py
```

- 服务端口：`http://localhost:30000`
- API 文档：`http://localhost:30000/docs`

## 5. API 是否正常

- `create_draft`：成功，创建 1080x1920 竖屏草稿
- `get_draft`：成功
- `save_draft`：成功
- `add_videos`：成功，添加 10 秒竖屏测试视频
- `add_captions`：成功，分别添加 3 条关键词文字

## 6. get_text_animations 结果

- 免费入场动画：67
- 免费出场动画：51
- 免费循环动画：41
- 入场前 30 个：冲屏位移、卡拉OK、变色输入、右上弹入、右下擦开、向上擦除、向上滑动、向上翻转、向上重叠、向上露出、向下擦除、向下滑动、向下露出、向下飞入、向右擦除、向右滑动、向右缓入、向右集合、向右露出、向左擦除、向左滑动、向左露出、圆形扫描、复古打字机、居中打字、左上弹入、左移弹动、开幕、弹入、弹弓
- 出场前 30 个：右上弹出、右下擦除、向上擦除、向上溶解、向上滑动、向下擦除、向下滑动、向右擦除、向右滑动、向右缓出、向左擦除、向左滑动、向左解散、圆形扫描、居中打字、展开、左上弹出、左移弹动、弹出、弹弓、弹性伸缩、弹簧、打字机 I、打字机 II、打字机 III、扭曲模糊、拖尾、放大、放大 II、故障打字机
- 循环前 30 个：VHS、上弧、刷屏、发光模糊多行、吹泡泡、吹泡泡 II、呐喊、复古涂鸦、字体变换、弹幕滚动、彩虹、彩虹-情人节、彩虹-新年、彩虹-马卡龙、扫光、投影颤抖 II、折叠、拼贴纹理、描边粉笔、摇摆、摇荡、故障闪动、旋转、晃动、爆闪、环绕、翻转、色差故障、蓝黄滑动、超强晃动

## 7. get_text_effects 结果

- 免费花字：92
- 前 30 个：立体综艺花字、白色纹理描边花字、复古淡黄花字、白色发光字、黄色渐变立体白描边花字、白字红边立体字、美拉德立体文字、绿色立体通用花字、绿色镂空透明文字、绿色描边投影字、绿色透明纹理花字、书法墨环图案花字、金箔描边书法水墨花字、清新蓝色发光花字、潮酷 白色橙边、简约白色发光立体花字、超酷发光镂空花字、潮人必备、潮酷蓝色发光镂空花字、综艺 橙色、清新粉色发光灯箱感花字、炫彩发光跳色花字，、潮酷 橙色、潮酷黄色霓虹灯花字、红色镂空发光花字、潮酷蓝色霓虹灯发光花字、潮酷黄底白色发光立体花字、蓝色镂空发光花字、潮酷 白色粉边、暗黑潮酷黑色花字、超酷黄色发光花字

## 8. 实际测试关键词

- 自有工厂：1.2s - 2.6s
- OEM/ODM：4.0s - 5.3s
- 品质保证：7.0s - 8.4s

## 9. 实际使用花字

- 自有工厂：黄色渐变立体白描边花字
- OEM/ODM：白色发光字
- 品质保证：白色纹理描边花字

## 10. 实际使用入场/退场/循环动画

- 自有工厂：右上弹入 / 右上弹出 / 晃动
- OEM/ODM：变色输入 / 放大 / 扫光
- 品质保证：向上滑动 / 向下滑动 / 彩虹

## 11. 剪映是否正常打开草稿

- 剪映专业版已成功启动。
- 用户截图确认：草稿 `20260831103402aee9d81c` 已在剪映专业版中正常打开，未报损坏。
- 截图可见：预览区有 10 秒竖屏视频画面，时间线有 1 条视频轨和 3 条文字轨，三个关键词分别位于不同时间点。
- 用户确认：文字元素可以继续手工编辑。
- 说明：Codex Desktop 自身的窗口截图/可访问性采集失败，错误：`SetIsBorderRequired failed: 不支持此接口 (0x80004002)`；最终可见性由用户截图确认。

## 12. 花字是否真实显示

- 文件级确认：`draft_content.json` 中存在 3 个 `type=text_effect`，并且三条文本 content 的 `effectStyle.id` 分别写入。
- 剪映 UI 视觉确认：未完成，原因同上。

## 13. 动画是否真实播放

- 文件级确认：`draft_content.json` 中存在 3 组 `material_animations`，每组包含入场、出场、循环动画。
- 剪映 UI 播放确认：未完成，原因同上。

## 14. 遇到的问题

- 项目默认 `config.py` 硬编码 `C:\Users\1\...`，本实验副本已改成优先读取 `DRAFT_SAVE_PATH` 环境变量，默认解析当前用户 `LOCALAPPDATA`。
- 当前剪映数据目录通过 junction 从 C 盘指向 D 盘，真实落盘需按 D 盘目录理解。
- CapCut Mate 的 `save_draft` 只保存到项目输出目录，不主动导入剪映草稿目录；本次 PoC 手动复制生成草稿目录到剪映草稿库，并修正 meta。
- Codex Desktop 的 Windows 截图工具对剪映窗口采集失败；草稿打开状态改由用户提供截图确认。

## 15. 是否建议进入第二阶段

- 暂不建议直接进入自动导出阶段。
- 建议先完成剩余第一阶段验收：确认花字真实显示、动画真实播放。
- 文件级结果显示 CapCut Mate 具备写入视频、花字、关键词强调和文字动画的能力，具备继续验证价值。
