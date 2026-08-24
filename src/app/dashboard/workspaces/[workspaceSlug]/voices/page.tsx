import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { ZhihengVoicePage } from '@/features/workspaces/automation-editing/zhiheng-voice-page';
import { hasWorkspacePermission, requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function VoicesRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  // 业务音色管理（同步 / 启用切换）仅超级管理员或工作空间所有者可执行。
  const canManage = hasWorkspacePermission(
    result.context.user,
    result.context.membership,
    'voices:manage'
  );

  return <ZhihengVoicePage workspaceSlug={workspaceSlug} canManage={canManage} />;
}
