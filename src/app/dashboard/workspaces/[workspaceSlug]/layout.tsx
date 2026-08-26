import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { WorkspaceHeaderProvider } from '@/features/workspaces/components/workspace-header-actions';
import { WorkspaceShell } from '@/features/workspaces/components/workspace-shell';
import { getWorkspaceModules } from '@/lib/workspaces/registry';
import { hasWorkspacePermission, requireWorkspaceAccess } from '@/lib/workspaces/service';

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
};

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspaceAccess(workspaceSlug);

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return (
        <WorkspaceAccessDenied
          title='工作空间不存在'
          description='请确认访问地址是否正确，或返回工作空间中心重新进入。'
        />
      );
    }
    if (result.reason === 'inactive') {
      return (
        <WorkspaceAccessDenied
          title='工作空间已停用'
          description='该工作空间当前不可访问，请联系企业管理员。'
        />
      );
    }
    return <WorkspaceAccessDenied />;
  }

  const { workspace, user, membership, effectiveRole } = result.context;
  const modules = getWorkspaceModules(workspace.workspaceType, workspace.enabledModules).filter(
    (module) => hasWorkspacePermission(user, membership, module.requiredPermission)
  );

  return (
    <WorkspaceHeaderProvider>
      <WorkspaceShell workspace={workspace} role={effectiveRole} modules={modules}>
        {children}
      </WorkspaceShell>
    </WorkspaceHeaderProvider>
  );
}
