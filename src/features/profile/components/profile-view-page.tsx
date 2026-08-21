import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  manager: '管理员',
  employee: '员工'
};

/**
 * 个人资料页（本地版，替换原 Clerk <UserProfile>）。
 * 展示当前登录用户的本地账号信息；密码修改能力将在后续版本开放。
 */
export default async function ProfileViewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in');

  return (
    <div className='flex w-full flex-col p-4'>
      <Card>
        <CardHeader>
          <CardTitle>个人资料</CardTitle>
          <CardDescription>查看您的企业账号信息</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div>
            <span className='text-muted-foreground'>姓名：</span>
            {user.name}
          </div>
          <div>
            <span className='text-muted-foreground'>账号：</span>
            {user.username}
          </div>
          <div>
            <span className='text-muted-foreground'>工号：</span>
            {user.employeeNo}
          </div>
          <div>
            <span className='text-muted-foreground'>部门：</span>
            {user.department ?? '—'}
          </div>
          <div>
            <span className='text-muted-foreground'>岗位：</span>
            {user.position ?? '—'}
          </div>
          <div>
            <span className='text-muted-foreground'>角色：</span>
            {ROLE_LABEL[user.role] ?? user.role}
          </div>
          {user.mustChangePassword && (
            <p className='text-yellow-600 text-xs'>
              检测到您使用的是初始密码，请尽快修改（修改功能即将开放）。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
