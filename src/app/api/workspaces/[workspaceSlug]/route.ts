import { NextResponse } from 'next/server';
import { getWorkspaceModules } from '@/lib/workspaces/registry';
import { hasWorkspacePermission, requireWorkspaceAccess } from '@/lib/workspaces/service';

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspaceAccess(workspaceSlug);

  if (!result.ok) {
    return NextResponse.json({ message: '无权访问此工作空间' }, { status: 403 });
  }

  const { workspace, user, membership } = result.context;
  const modules = getWorkspaceModules(workspace.workspaceType, workspace.enabledModules).filter(
    (module) => hasWorkspacePermission(user, membership, module.requiredPermission)
  );

  return NextResponse.json({
    workspace,
    membership,
    modules
  });
}
