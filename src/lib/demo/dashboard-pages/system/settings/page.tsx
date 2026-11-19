import { redirect } from 'next/navigation';

/**
 * 旧入口 /dashboard/system/settings 永久重定向到 /dashboard/system/providers。
 * 保留此文件以避免历史链接 404;不再渲染任何内容。
 */
export default function SettingsPage(): never {
  redirect('/dashboard/system/providers');
}
