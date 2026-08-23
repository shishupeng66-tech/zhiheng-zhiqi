import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { AutomationEditingReviewPage } from '@/features/workspaces/automation-editing/review-page';
import { ReviewPage } from '@/features/workspaces/video-production/module-pages';
import { listAutomationVideoTasks } from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

export default async function ReviewRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'review:approve');
  if (!result.ok) return <WorkspaceAccessDenied />;
  if (result.context.workspace.workspaceType === 'enterprise-media') {
    return (
      <AutomationEditingReviewPage
        workspaceSlug={workspaceSlug}
        initialTasks={listAutomationVideoTasks(result.context.workspace.id)}
      />
    );
  }
  return <ReviewPage />;
}
