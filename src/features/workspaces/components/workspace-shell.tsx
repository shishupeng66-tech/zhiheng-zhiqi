import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { Workspace, WorkspaceMemberRole } from '@/lib/db/schema';
import type { WorkspaceModuleDefinition } from '@/lib/workspaces/registry';
import { workspaceRoleLabels } from '@/lib/workspaces/permissions';
import { WorkspaceModuleNav } from './workspace-module-nav';

type WorkspaceShellProps = {
  workspace: Workspace;
  role: WorkspaceMemberRole | 'enterprise_admin';
  modules: WorkspaceModuleDefinition[];
  children: React.ReactNode;
};

export function WorkspaceShell({ workspace, role, modules, children }: WorkspaceShellProps) {
  const roleLabel = role === 'enterprise_admin' ? '企业管理员' : workspaceRoleLabels[role];
  const statusLabel = workspace.status === 'active' ? '运行中' : '停用';

  return (
    <div className='flex min-h-full flex-col'>
      <div className='border-b bg-background'>
        <div className='w-full px-5 py-3 md:px-8 lg:px-10'>
          <Link
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2' })}
            href='/dashboard/workspaces'
          >
            <Icons.chevronLeft className='size-4' />
            返回工作空间
          </Link>

          <div className='mt-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
            <div className='flex items-start gap-4'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15'>
                <Icons.video className='size-5' />
              </div>
              <div className='space-y-1.5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h1 className='text-xl font-semibold tracking-tight'>{workspace.name}</h1>
                  <Badge variant='secondary'>{roleLabel}</Badge>
                  <Badge variant='outline'>{statusLabel}</Badge>
                </div>
                <p className='max-w-5xl text-sm leading-5 text-muted-foreground'>
                  {workspace.description}
                </p>
              </div>
            </div>
            <Badge variant='outline' className='w-fit'>
              企业内部工作空间
            </Badge>
          </div>
        </div>
        <div className='w-full px-5 md:px-8 lg:px-10'>
          <WorkspaceModuleNav workspaceSlug={workspace.slug} modules={modules} />
        </div>
      </div>

      <div className='w-full flex-1 px-5 py-4 md:px-8 lg:px-10'>{children}</div>
    </div>
  );
}
