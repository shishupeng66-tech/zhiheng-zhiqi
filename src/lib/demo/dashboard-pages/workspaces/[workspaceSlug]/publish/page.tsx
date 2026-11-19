import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { PublishPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function PublishRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'publish:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <PublishPage />;
}
