'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { WorkspaceModuleDefinition } from '@/lib/workspaces/registry';
import { cn } from '@/lib/utils';

type WorkspaceModuleNavProps = {
  workspaceSlug: string;
  modules: WorkspaceModuleDefinition[];
};

export function WorkspaceModuleNav({ workspaceSlug, modules }: WorkspaceModuleNavProps) {
  const pathname = usePathname();
  const basePath = `/dashboard/workspaces/${workspaceSlug}`;

  return (
    <nav className='flex gap-1 overflow-x-auto border-b' aria-label='工作空间模块'>
      {modules.map((module) => {
        const href = module.path ? `${basePath}/${module.path}` : basePath;
        const active = pathname === href;

        return (
          <Link
            key={module.key}
            href={href}
            className={cn(
              'relative flex h-10 shrink-0 items-center px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              active &&
                'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary'
            )}
          >
            {module.shortLabel ?? module.label}
          </Link>
        );
      })}
    </nav>
  );
}
