import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { Icons } from '@/components/icons';

const VOICE_WORKSPACE_SLUG = 'enterprise-media';

export const metadata = {
  title: '视频库'
};

export default async function VideoLibraryRoute() {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  return (
    <PageContainer pageTitle='视频库' pageDescription='管理企业视频素材，即将上线。'>
      <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center'>
        <div className='flex size-16 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400'>
          <Icons.video className='size-8' />
        </div>
        <h3 className='mt-4 text-base font-medium'>视频库即将上线</h3>
        <p className='mt-1 max-w-sm text-sm text-muted-foreground'>
          视频库将支持实拍素材库、AI 生成视频库和自动剪辑视频库的统一管理，敬请期待。
        </p>
        <div className='mt-4 flex items-center gap-1 text-xs text-muted-foreground'>
          <Icons.lock className='size-3' />
          功能开发中
        </div>
      </div>
    </PageContainer>
  );
}
