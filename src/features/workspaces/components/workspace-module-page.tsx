import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { WorkspaceEmptyState } from './workspace-empty-state';

type Metric = {
  label: string;
  value: string | number;
  description?: string;
};

type Action = {
  label: string;
  icon?: keyof typeof Icons;
};

type WorkspaceModulePageProps = {
  title: string;
  description: string;
  primaryAction?: string;
  metrics?: Metric[];
  actions?: Action[];
  sections?: Array<{
    title: string;
    description: string;
    tags?: string[];
  }>;
  emptyTitle: string;
  emptyDescription: string;
};

export function WorkspaceModulePage({
  title,
  description,
  primaryAction,
  metrics = [],
  actions = [],
  sections = [],
  emptyTitle,
  emptyDescription
}: WorkspaceModulePageProps) {
  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='space-y-1'>
          <h2 className='text-xl font-semibold tracking-tight'>{title}</h2>
          <p className='max-w-3xl text-sm text-muted-foreground'>{description}</p>
        </div>
        {primaryAction && (
          <Button>
            <Icons.add className='size-4' />
            {primaryAction}
          </Button>
        )}
      </div>

      {metrics.length > 0 && (
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          {metrics.map((metric) => (
            <Card key={metric.label} size='sm'>
              <CardHeader>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className='text-2xl'>{metric.value}</CardTitle>
              </CardHeader>
              {metric.description && (
                <CardContent className='text-xs text-muted-foreground'>
                  {metric.description}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>快捷开始</CardTitle>
            <CardDescription>从当前模块的常用动作进入后续流程。</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            {actions.map((action) => {
              const Icon = action.icon ? Icons[action.icon] : Icons.arrowRight;
              return (
                <Button key={action.label} variant='outline' className='justify-start'>
                  <Icon className='size-4' />
                  {action.label}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {sections.length > 0 && (
        <div className='grid gap-3 lg:grid-cols-3'>
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              {section.tags && (
                <CardContent className='flex flex-wrap gap-2'>
                  {section.tags.map((tag) => (
                    <Badge key={tag} variant='outline'>
                      {tag}
                    </Badge>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <WorkspaceEmptyState title={emptyTitle} description={emptyDescription} />
    </div>
  );
}
