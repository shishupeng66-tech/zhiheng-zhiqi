import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { AnalyticsPage } from '@/features/workspaces/video-production/module-pages';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function AnalyticsRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'analytics:view');
  if (!result.ok) return <WorkspaceAccessDenied />;
  return <AnalyticsPage />;
}
