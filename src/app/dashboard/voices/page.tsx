import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { ZhihengVoicePage } from '@/features/voices/zhiheng-voice-page';
import { hasWorkspacePermission, requireWorkspacePermission } from '@/lib/workspaces/service';

/**
 * 知衡语音一级功能页。
 *
 * 音色库（voice_catalog）是全局资源，本阶段沿用 enterprise-media 工作空间作为权限来源，
 * 以便复用既有 API 路径（/api/workspaces/enterprise-media/voices/...）与权限校验逻辑，不做任何改动。
 */
const VOICE_WORKSPACE_SLUG = 'enterprise-media';

export default async function VoicesTopLevelRoute() {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  // 业务音色管理（同步 / 启用切换）仅超级管理员或工作空间所有者可执行。
  const canManage = hasWorkspacePermission(
    result.context.user,
    result.context.membership,
    'voices:manage'
  );

  return (
    <PageContainer>
      <ZhihengVoicePage workspaceSlug={VOICE_WORKSPACE_SLUG} canManage={canManage} />
    </PageContainer>
  );
}
