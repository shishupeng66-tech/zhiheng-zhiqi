import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { ProjectsPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function ProjectsRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'projects:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <ProjectsPage />;
}
