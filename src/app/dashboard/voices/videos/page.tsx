import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPath, probeDir } from '@/lib/storage';
import { formatBytes } from '@/lib/utils';
import fs from 'node:fs/promises';
import path from 'node:path';

const VOICE_WORKSPACE_SLUG = 'enterprise-media';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);
const MAX_SCAN_FILES = 200;

export const metadata = {
  title: '视频库'
};

type VideoFile = {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  extension: string;
};

async function scanVideos(rootDir: string): Promise<VideoFile[]> {
  const out: VideoFile[] = [];

  async function walk(dir: string) {
    if (out.length >= MAX_SCAN_FILES) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= MAX_SCAN_FILES) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) continue;
      const stat = await fs.stat(fullPath);
      out.push({
        name: entry.name,
        relativePath: path.relative(rootDir, fullPath),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        extension: extension.replace('.', '').toUpperCase()
      });
    }
  }

  await walk(rootDir);
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export default async function VideoLibraryRoute() {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  const videoDir = await getPath('videos');
  const probe = probeDir(videoDir);
  const videos = probe.status === 'normal' ? await scanVideos(videoDir) : [];

  return (
    <PageContainer pageTitle='视频库' pageDescription='管理企业视频素材和自动化剪辑成品。'>
      <div className='space-y-4'>
        <Card>
          <CardHeader className='border-b'>
            <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
              <div>
                <CardTitle className='flex items-center gap-2'>
                  <Icons.video className='size-5 text-blue-500' />
                  本地视频文件
                </CardTitle>
                <p className='mt-1 text-sm text-muted-foreground'>
                  当前扫描目录：<span className='font-mono'>{videoDir}</span>
                </p>
              </div>
              <Badge variant={probe.status === 'normal' ? 'default' : 'secondary'}>
                {probe.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className='p-0'>
            {probe.status !== 'normal' ? (
              <div className='flex flex-col items-center justify-center py-16 text-center'>
                <div className='flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground'>
                  <Icons.video className='size-7' />
                </div>
                <h3 className='mt-4 text-base font-medium'>视频目录暂不可用</h3>
                <p className='mt-1 max-w-xl text-sm text-muted-foreground'>
                  请在“系统管理 / 数据存储”中把“视频文件”路径设置到真实目录。
                </p>
              </div>
            ) : videos.length === 0 ? (
              <div className='flex flex-col items-center justify-center py-16 text-center'>
                <div className='flex size-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400'>
                  <Icons.video className='size-7' />
                </div>
                <h3 className='mt-4 text-base font-medium'>暂未发现视频文件</h3>
                <p className='mt-1 max-w-xl text-sm text-muted-foreground'>
                  目录已经连接成功。把 MP4、MOV、MKV、AVI 或 WEBM
                  文件放入该目录后，刷新页面即可显示。
                </p>
              </div>
            ) : (
              <div className='overflow-hidden'>
                <div className='grid grid-cols-[minmax(0,1fr)_120px_140px] border-b bg-muted/50 px-4 py-3 text-sm font-medium md:grid-cols-[minmax(0,1fr)_120px_140px_180px]'>
                  <div>文件</div>
                  <div>格式</div>
                  <div>大小</div>
                  <div className='hidden md:block'>修改时间</div>
                </div>
                {videos.map((video) => (
                  <div
                    key={video.relativePath}
                    className='grid grid-cols-[minmax(0,1fr)_120px_140px] items-center border-b px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_140px_180px]'
                  >
                    <div className='min-w-0'>
                      <div className='truncate font-medium'>{video.name}</div>
                      <div className='truncate text-xs text-muted-foreground'>
                        {video.relativePath}
                      </div>
                    </div>
                    <div>
                      <Badge variant='outline'>{video.extension}</Badge>
                    </div>
                    <div className='text-muted-foreground'>{formatBytes(video.size)}</div>
                    <div className='hidden text-muted-foreground md:block'>
                      {new Date(video.modifiedAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
