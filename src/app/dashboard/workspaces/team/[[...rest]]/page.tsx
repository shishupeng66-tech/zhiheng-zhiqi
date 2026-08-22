import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { teamInfoContent } from '@/config/infoconfig';

/**
 * 团队管理页（本地版，替换原 Clerk <OrganizationProfile>）。
 * 成员与角色管理由「员工管理」模块承担，团队 / 组织配置页后续开放。
 */
export default function TeamPage() {
  return (
    <PageContainer
      pageTitle='团队管理'
      pageDescription='管理当前工作空间的团队成员、角色、安全设置等。'
      infoContent={teamInfoContent}
    >
      <Card>
        <CardHeader>
          <CardTitle>团队管理</CardTitle>
          <CardDescription>功能建设中</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            团队成员与角色管理将在后续版本开放，当前由系统管理员在「员工管理」中统一维护。
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
