import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import EmployeesClient from '@/features/employees/components/employees-client';

export const metadata = {
  title: '系统管理 · 员工管理'
};

/**
 * 员工管理页面（服务端强校验）。
 * 仅超级管理员可进入，否则重定向至 /dashboard/forbidden。
 * 所有写操作的权限也由对应 API 在服务端再次校验（role === super_admin → 否则 403）。
 */
export default async function EmployeesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'super_admin') {
    redirect('/dashboard/forbidden');
  }
  return <EmployeesClient currentUserId={user.id} />;
}
