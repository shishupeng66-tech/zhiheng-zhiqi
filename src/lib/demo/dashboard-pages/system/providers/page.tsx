import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import SettingsCenterClient from '@/features/settings/components/settings-center-client';

export const metadata = {
  title: '系统管理 · 模型与接口中心'
};

/**
 * 模型与接口中心(原 /dashboard/system/settings,迁移到本路径)。
 * 仅超级管理员可进入,否则重定向至 /dashboard/forbidden。
 * 写操作由对应 API 在服务端再次校验(role === super_admin → 否则 403)。
 */
export default async function ProvidersCenterPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'super_admin') {
    redirect('/dashboard/forbidden');
  }
  return <SettingsCenterClient />;
}
