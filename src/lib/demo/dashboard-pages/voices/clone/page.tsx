/**
 * Phase 3-B 声音复刻页面入口
 *
 * 路由：/dashboard/voices/clone
 *
 * 权限：复用「音色库」同款权限（scripts:manage）。
 * 与 Phase 3-A 冒烟页相同的最小鉴权合约，方便 super_admin / 团队负责人快速进入。
 */
import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { VoiceClonePage } from '@/features/voices/clone/voice-clone-page';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

const VOICE_WORKSPACE_SLUG = 'enterprise-media';

export const metadata = {
  title: '声音复刻'
};

export default async function VoiceCloneRoute() {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  return (
    <PageContainer>
      <VoiceClonePage workspaceSlug={VOICE_WORKSPACE_SLUG} />
    </PageContainer>
  );
}
