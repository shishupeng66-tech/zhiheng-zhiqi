import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { WorkspaceEmptyState } from '../components/workspace-empty-state';

type VideoProductionOverviewPageProps = {
  workspaceSlug: string;
};

const todayStats = [
  { label: '待生成', value: 0, description: '等待进入 AI 视频流程' },
  { label: '渲染中', value: 0, description: '自动成片任务' },
  { label: '待审核', value: 0, description: '需要负责人确认' },
  { label: '待发布', value: 0, description: '审核通过待排期' }
];

const quickStarts = [
  { label: '上传素材', href: 'assets', icon: Icons.upload },
  { label: '创建选题', href: 'topics', icon: Icons.add },
  { label: '生成脚本', href: 'scripts', icon: Icons.post },
  { label: 'AI 视频生产', href: 'ai-video', icon: Icons.sparkles }
];

export function VideoProductionOverviewPage({ workspaceSlug }: VideoProductionOverviewPageProps) {
  const basePath = `/dashboard/workspaces/${workspaceSlug}`;

  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 rounded-lg border bg-card p-5 md:flex-row md:items-start md:justify-between'>
        <div className='space-y-2'>
          <h2 className='text-xl font-semibold tracking-tight'>短视频生产</h2>
          <p className='max-w-5xl text-sm text-muted-foreground'>
            从企业素材和知识出发，完成选题、脚本、AI 成片、审核、发布与内容复盘。
          </p>
        </div>
        <Link className={buttonVariants()} href={`${basePath}/projects`}>
          <Icons.add className='size-4' />
          新建视频项目
        </Link>
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] 2xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.65fr)]'>
        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>今日工作</h3>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            {todayStats.map((item) => (
              <Card key={item.label} size='sm'>
                <CardHeader>
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className='text-2xl'>{item.value}</CardTitle>
                </CardHeader>
                <CardContent className='text-xs text-muted-foreground'>
                  {item.description}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>最近项目</CardTitle>
              <CardDescription>
                视频生产任务会在这里显示名称、选题、状态和更新时间。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WorkspaceEmptyState
                title='还没有视频项目'
                description='从上传素材或新建视频项目开始。'
              />
            </CardContent>
          </Card>
        </section>

        <aside className='grid gap-4 lg:grid-cols-2 xl:grid-cols-1'>
          <Card>
            <CardHeader>
              <CardTitle>快捷开始</CardTitle>
              <CardDescription>从常用入口进入短视频生产流程。</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2'>
              {quickStarts.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    className={buttonVariants({ variant: 'outline', className: 'justify-start' })}
                    href={`${basePath}/${item.href}`}
                  >
                    <Icon className='size-4' />
                    {item.label}
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>素材概览</CardTitle>
              <CardDescription>等待接入素材理解与标签分析。</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>视频素材</span>
                <span className='font-medium'>0</span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>图片素材</span>
                <span className='font-medium'>0</span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>已分析素材</span>
                <span className='font-medium'>0</span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>待打标签</span>
                <span className='font-medium'>0</span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
