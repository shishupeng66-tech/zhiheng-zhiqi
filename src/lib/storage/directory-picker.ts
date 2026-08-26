/**
 * 数据存储 —— Windows 原生目录选择器桥接（directoryPicker）
 *
 * 背景：纯 Web 浏览器 API（showDirectoryPicker）只能拿到 FileSystemHandle，
 * 无法获得真实绝对路径（D:\xxx）。因此第一版使用「Windows localhost bridge」：
 * 服务端（Next.js Node runtime）调用 PowerShell -STA + System.Windows.Forms.FolderBrowserDialog，
 * 弹出 Windows 原生文件夹选择窗口，返回用户选择的真实绝对路径。
 *
 * 安全约束（硬性）：
 * - 不接受前端传入的 shell 命令 / 路径片段，全程固定脚本，杜绝 command injection
 * - 不拼接用户输入到 PowerShell
 * - 仅本机调用（调用方 API 路由做 super_admin + localhost 校验）
 *
 * 未来桌面版（Electron / Tauri launcher）可把 select() 实现替换为原生 dialog，
 * 页面组件无需重写 —— 本模块是唯一抽象边界。
 */
import { execFile } from 'node:child_process';

/** 统一选择结果 */
export interface DirectoryPickerResult {
  ok: boolean;
  /** 用户取消时 true（不得报错，不得清空原输入） */
  cancelled?: boolean;
  /** 选择的真实绝对路径 */
  path?: string;
  /** 失败原因（仅 ok=false 且非取消时） */
  error?: string;
}

/** 固定 PowerShell 脚本 —— 不含任何来自前端的输入，结构不可注入 */
const PICKER_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
  '$f.Description = "请选择企业数据目录"',
  '$f.ShowNewFolderButton = $true',
  'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
  '  Write-Output ("SELECTED:" + $f.SelectedPath)',
  '} else {',
  '  Write-Output "CANCELLED"',
  '}'
].join('; ');

/** 等待用户选择的超时（毫秒）—— FolderBrowserDialog 为模态阻塞，理论上不会超时，但防御性兜底 */
const PICKER_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 弹起 Windows 原生文件夹选择器并返回所选绝对路径。
 * 仅本机 / 服务端调用；调用方必须自行完成权限与来源校验。
 */
export async function selectDirectory(): Promise<DirectoryPickerResult> {
  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-STA', '-Command', PICKER_SCRIPT],
          {
            timeout: PICKER_TIMEOUT_MS,
            windowsHide: false, // 允许弹原生窗口
            maxBuffer: 1024 * 1024
          },
          (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
          }
        );
      }
    );

    const lines = (stdout || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const last = lines[lines.length - 1] ?? '';
    if (last === 'CANCELLED') {
      return { ok: false, cancelled: true };
    }
    if (last.startsWith('SELECTED:')) {
      const p = last.slice('SELECTED:'.length).trim();
      if (p) return { ok: true, path: p };
      return { ok: false, error: '选择结果为空' };
    }
    return { ok: false, error: `未识别的选择器输出: ${last || stderr || '(空)'}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 超时 / 进程异常等
    return { ok: false, error: `目录选择失败: ${msg}` };
  }
}

/** 校验是否本机回环地址（供 API 路由使用） */
export function isLocalHost(host?: string): boolean {
  if (!host) return false;
  const h = host.split(':')[0].toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

// 为未来桌面版预留的抽象签名（当前实现即本文件 selectDirectory）
export type DirectoryPicker = typeof selectDirectory;
