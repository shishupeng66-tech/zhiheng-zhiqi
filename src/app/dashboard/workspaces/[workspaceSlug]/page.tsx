import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { AiContentProductGeneratorPage } from '@/features/workspaces/ai-content/product-generator-page';
import { AutomationEditingOverviewPage } from '@/features/workspaces/automation-editing/overview-page';
import { VideoProductionOverviewPage } from '@/features/workspaces/video-production/overview-page';
import { getDefaultProviderConfig } from '@/lib/settings/store';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

export default async function WorkspaceOverviewRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'workspace:view');

  if (!result.ok) return <WorkspaceAccessDenied />;
  if (result.context.workspace.workspaceType === 'enterprise-media') {
    return <AutomationEditingOverviewPage workspaceSlug={workspaceSlug} />;
  }
  if (result.context.workspace.workspaceType === 'ai-content') {
    const configuredModel = await getDefaultProviderConfig('llm');
    return (
      <AiContentProductGeneratorPage
        workspaceSlug={workspaceSlug}
        configuredModelName={configuredModel?.config.model}
      />
    );
  }

  return <VideoProductionOverviewPage workspaceSlug={workspaceSlug} />;
}
