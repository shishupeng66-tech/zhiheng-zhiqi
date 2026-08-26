'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * FolderPickerButton —— Windows 原生文件夹选择按钮（统一组件）。
 *
 * 所有目录配置（root / customers / products / assets / videos / voices / knowledge）
 * 共用本组件：点击 → 调 /api/system/storage/select-directory → 服务端弹 Windows
 * FolderBrowserDialog → 返回真实绝对路径 → 通过 onSelect 回填输入框。
 *
 * 行为约定：
 * - 选择成功：onSelect(真实绝对路径)，【不自动保存】，用户仍可「检测 / 保存」
 * - 用户取消：toast 提示，不清空原输入，不报错
 * - 未选择任何路径：不触发 onSelect
 *
 * 未来桌面版（Electron / Tauri）只需替换底层实现，本组件与页面无需改动。
 */
export function FolderPickerButton({
  onSelect,
  disabled,
  variant = 'outline',
  size = 'default'
}: {
  onSelect: (path: string) => void;
  disabled?: boolean;
  variant?: 'outline' | 'secondary' | 'ghost' | 'default';
  size?: 'default' | 'sm' | 'lg';
}) {
  const [picking, setPicking] = useState(false);

  const handleClick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const res = await fetch('/api/system/storage/select-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || data.error || '无法打开文件夹选择器');
        return;
      }
      if (data.ok && data.path) {
        onSelect(String(data.path));
        toast.success(`已选择：${data.path}`);
      } else if (data.cancelled) {
        toast.info('已取消选择');
      } else {
        toast.error(data.error || '未选择目录');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '目录选择失败');
    } finally {
      setPicking(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleClick} disabled={disabled || picking}>
      {picking ? '选择中…' : '选择文件夹'}
    </Button>
  );
}
