import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import StorageSettingsClient from '@/features/storage/components/storage-settings-client';

export const metadata = {
  title: '系统管理 · 数据存储'
};

/**
 * 数据存储设置（服务端强校验）。
 * 仅超级管理员可进入，否则重定向至 /dashboard/forbidden。
 * 写操作由 API 在服务端再次校验（role === super_admin → 否则 403）。
 */
export default async function StoragePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'super_admin') {
    redirect('/dashboard/forbidden');
  }
  return <StorageSettingsClient />;
}
