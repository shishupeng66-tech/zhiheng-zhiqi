import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { ReviewPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function ReviewRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'review:approve');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <ReviewPage />;
}
