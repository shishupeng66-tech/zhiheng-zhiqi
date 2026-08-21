import { Icons } from '@/components/icons';

type WorkspaceEmptyStateProps = {
  title: string;
  description: string;
};

export function WorkspaceEmptyState({ title, description }: WorkspaceEmptyStateProps) {
  return (
    <div className='flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center'>
      <Icons.workspace className='mb-3 size-8 text-muted-foreground' />
      <div className='text-sm font-medium'>{title}</div>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>{description}</p>
    </div>
  );
}
