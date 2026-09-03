'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type EmployeeWorkspaceOption = {
  id: string;
  name: string;
};

type WorkspaceAccessMultiselectProps = {
  workspaces: EmployeeWorkspaceOption[];
  selectedIds: string[];
  loading?: boolean;
  disabled?: boolean;
  onChange: (selectedIds: string[]) => void;
};

function getSummary(workspaces: EmployeeWorkspaceOption[], selectedIds: string[]) {
  if (selectedIds.length === 0) return '未选择工作空间';
  const selectedNames = workspaces
    .filter((workspace) => selectedIds.includes(workspace.id))
    .map((workspace) => workspace.name);

  if (selectedNames.length === 0) return `已选择 ${selectedIds.length} 个工作空间`;
  if (selectedNames.length <= 2) return selectedNames.join('、');
  return `已选择 ${selectedNames.length} 个工作空间`;
}

export function WorkspaceAccessMultiselect({
  workspaces,
  selectedIds,
  loading = false,
  disabled = false,
  onChange
}: WorkspaceAccessMultiselectProps) {
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleWorkspace(workspaceId: string) {
    if (selectedSet.has(workspaceId)) {
      onChange(selectedIds.filter((id) => id !== workspaceId));
      return;
    }
    onChange([...selectedIds, workspaceId]);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            className='h-auto min-h-10 w-full justify-between gap-3 px-3 py-2 text-left'
            disabled={disabled}
          />
        }
      >
        <span className='grid min-w-0 flex-1 gap-0.5'>
          <span className='text-sm font-medium'>工作空间访问权限</span>
          <span className='truncate text-xs font-normal text-muted-foreground'>
            {loading ? '正在加载工作空间...' : getSummary(workspaces, selectedIds)}
          </span>
        </span>
        {loading ? (
          <Loader2 className='size-4 shrink-0 animate-spin text-muted-foreground' />
        ) : (
          <ChevronsUpDown className='size-4 shrink-0 text-muted-foreground' />
        )}
      </PopoverTrigger>
      <PopoverContent align='start' className='w-[var(--anchor-width)] p-2'>
        <div className='px-1 pb-2 text-sm font-medium'>工作空间访问权限</div>
        {loading ? (
          <div className='flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground'>
            <Loader2 className='size-4 animate-spin' />
            正在加载
          </div>
        ) : workspaces.length === 0 ? (
          <div className='px-2 py-3 text-sm text-muted-foreground'>暂无可用工作空间</div>
        ) : (
          <ScrollArea className='max-h-56'>
            <div className='grid gap-1 pr-2'>
              {workspaces.map((workspace) => {
                const checked = selectedSet.has(workspace.id);
                return (
                  <button
                    key={workspace.id}
                    type='button'
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                      checked && 'bg-accent/70'
                    )}
                    onClick={() => toggleWorkspace(workspace.id)}
                  >
                    <Checkbox checked={checked} aria-label={workspace.name} />
                    <span className='min-w-0 flex-1 truncate'>{workspace.name}</span>
                    {checked ? <Check className='size-4 shrink-0 text-primary' /> : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
