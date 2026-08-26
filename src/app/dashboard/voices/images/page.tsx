import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { Icons } from '@/components/icons';

const VOICE_WORKSPACE_SLUG = 'enterprise-media';

export const metadata = {
  title: '图片库'
};

export default async function ImageLibraryRoute() {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  return (
    <PageContainer pageTitle='图片库' pageDescription='管理企业图片资产，即将上线。'>
      <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center'>
        <div className='flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
          <Icons.photo className='size-8' />
        </div>
        <h3 className='mt-4 text-base font-medium'>图片库即将上线</h3>
        <p className='mt-1 max-w-sm text-sm text-muted-foreground'>
          图片库将支持品牌素材、AI 生成图片的统一存储与管理，敬请期待。
        </p>
        <div className='mt-4 flex items-center gap-1 text-xs text-muted-foreground'>
          <Icons.lock className='size-3' />
          功能开发中
        </div>
      </div>
    </PageContainer>
  );
}
