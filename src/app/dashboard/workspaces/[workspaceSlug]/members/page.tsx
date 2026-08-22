import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { WorkspaceMembersClient } from '@/features/workspaces/components/workspace-members-client';
import {
  listWorkspaceMemberCandidates,
  listWorkspaceMembers,
  requireWorkspacePermission
} from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function MembersRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'members:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  const workspaceId = result.context.workspace.id;
  return (
    <WorkspaceMembersClient
      workspaceSlug={workspaceSlug}
      initialMembers={listWorkspaceMembers(workspaceId)}
      initialCandidates={listWorkspaceMemberCandidates(workspaceId)}
    />
  );
}
