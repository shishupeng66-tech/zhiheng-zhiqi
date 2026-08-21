import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { MembersPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function MembersRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'members:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <MembersPage workspaceId={result.context.workspace.id} />;
}
