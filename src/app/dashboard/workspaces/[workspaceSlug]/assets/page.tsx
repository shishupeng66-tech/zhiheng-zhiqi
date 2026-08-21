import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { AssetsPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function AssetsRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'assets:view');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <AssetsPage />;
}
