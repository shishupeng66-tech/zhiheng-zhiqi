import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { AiVideoPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function AiVideoRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <AiVideoPage />;
}
