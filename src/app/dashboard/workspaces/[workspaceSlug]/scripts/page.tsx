import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { ScriptsPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function ScriptsRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <ScriptsPage />;
}
