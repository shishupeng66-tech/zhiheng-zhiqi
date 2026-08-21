import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { VideoProductionOverviewPage } from '@/features/workspaces/video-production/overview-page';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

export default async function WorkspaceOverviewRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'workspace:view');

  if (!result.ok) return <WorkspaceAccessDenied />;

  return <VideoProductionOverviewPage workspaceSlug={workspaceSlug} />;
}
