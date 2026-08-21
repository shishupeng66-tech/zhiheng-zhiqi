'use server';

import { requireWorkspacePermission } from './service';
import type { WorkspacePermission } from './permissions';

export async function assertWorkspaceActionPermission(
  workspaceSlug: string,
  permission: WorkspacePermission
) {
  const result = await requireWorkspacePermission(workspaceSlug, permission);
  if (!result.ok) {
    throw new Error('无权访问此工作空间');
  }
  return result.context;
}
