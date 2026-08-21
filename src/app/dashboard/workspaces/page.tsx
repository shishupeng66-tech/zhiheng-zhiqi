import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { workspacesInfoContent } from '@/config/infoconfig';

/**
 * 工作空间页（本地版，替换原 Clerk <OrganizationList>）。
 * 完整「工作空间 / 多租户」逻辑尚未实现（user_workspaces 表已预留），先以占位说明呈现。
 */
export default function WorkspacesPage() {
  return (
    <PageContainer
      pageTitle='工作空间'
      pageDescription='管理你的工作空间并在它们之间切换'
      infoContent={workspacesInfoContent}
    >
      <Card>
        <CardHeader>
          <CardTitle>工作空间</CardTitle>
          <CardDescription>功能建设中</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            工作空间管理将在后续版本开放。当前为单企业本地部署，所有成员共用同一工作空间。
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
