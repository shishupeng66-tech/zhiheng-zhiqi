import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import {
  listAutomationVideoAssets,
  listAutomationVideoTasks
} from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPath, probeDir, type DirProbe } from '@/lib/storage';
import { formatBytes } from '@/lib/utils';
import fs from 'node:fs/promises';
import path from 'node:path';

const VOICE_WORKSPACE_SLUG = 'enterprise-media';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.flv']);
const MAX_SCAN_FILES = 200;

export const metadata = {
  title: '视频库'
};

type LibraryVideo = {
  id: string;
  name: string;
  pathLabel: string;
  sourceLabel: string;
  extension: string;
  size: number | null;
  modifiedAt: string | null;
  statusLabel?: string;
};

async function scanVideos(rootDir: string, sourceLabel: string): Promise<LibraryVideo[]> {
  const out: LibraryVideo[] = [];

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
        id: fullPath,
        name: entry.name,
        pathLabel: path.relative(rootDir, fullPath) || entry.name,
        sourceLabel,
        extension: extension.replace('.', '').toUpperCase(),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  }

  await walk(rootDir);
  return out.sort(sortByModifiedAt);
}

async function getFileMeta(filePath: string) {
  try {
    if (!path.isAbsolute(filePath)) return null;
    const stat = await fs.stat(filePath);
    return {
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

function sortByModifiedAt(a: LibraryVideo, b: LibraryVideo) {
  return (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? '');
}

function extensionFromName(name: string) {
  const extension = path.extname(name).replace('.', '').toUpperCase();
  return extension || 'VIDEO';
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function probeBadgeVariant(status: DirProbe['status']) {
  return status === 'normal' ? 'default' : 'secondary';
}

function VideoRows({ videos }: { videos: LibraryVideo[] }) {
  return (
    <div className='overflow-hidden'>
      <div className='grid grid-cols-[minmax(0,1fr)_100px_120px] border-b bg-muted/50 px-4 py-3 text-sm font-medium lg:grid-cols-[minmax(0,1fr)_140px_100px_120px_180px]'>
        <div>视频</div>
        <div className='hidden lg:block'>来源</div>
        <div>格式</div>
        <div>大小</div>
        <div className='hidden lg:block'>更新时间</div>
      </div>
      {videos.map((video) => (
        <div
          key={video.id}
          className='grid grid-cols-[minmax(0,1fr)_100px_120px] items-center border-b px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(0,1fr)_140px_100px_120px_180px]'
        >
          <div className='min-w-0'>
            <div className='truncate font-medium'>{video.name}</div>
            <div className='truncate text-xs text-muted-foreground'>{video.pathLabel}</div>
          </div>
          <div className='hidden lg:block'>
            <Badge variant='outline'>{video.sourceLabel}</Badge>
          </div>
          <div>
            <Badge variant='outline'>{video.extension}</Badge>
          </div>
          <div className='text-muted-foreground'>
            {video.size === null ? '-' : formatBytes(video.size)}
          </div>
          <div className='hidden text-muted-foreground lg:block'>
            {formatDate(video.modifiedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className='flex flex-col items-center justify-center py-14 text-center'>
      <div className='flex size-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400'>
        <Icons.video className='size-7' />
      </div>
      <h3 className='mt-4 text-base font-medium'>{title}</h3>
      <p className='mt-1 max-w-xl text-sm text-muted-foreground'>{description}</p>
    </div>
  );
}

function VideoLibrarySection({
  title,
  description,
  directoryLabel,
  probe,
  unavailableText,
  emptyTitle,
  emptyDescription,
  videos
}: {
  title: string;
  description: string;
  directoryLabel: string;
  probe: DirProbe;
  unavailableText: string;
  emptyTitle: string;
  emptyDescription: string;
  videos: LibraryVideo[];
}) {
  return (
    <Card>
      <CardHeader className='border-b'>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Icons.video className='size-5 text-blue-500' />
              {title}
            </CardTitle>
            <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
            <p className='mt-2 text-xs text-muted-foreground'>
              当前目录：<span className='font-mono'>{directoryLabel}</span>
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline'>{videos.length} 个视频</Badge>
            <Badge variant={probeBadgeVariant(probe.status)}>{probe.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className='p-0'>
        {probe.status !== 'normal' ? (
          <EmptyState title={`${title}目录暂不可用`} description={unavailableText} />
        ) : videos.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <VideoRows videos={videos} />
        )}
      </CardContent>
    </Card>
  );
}

export default async function VideoLibraryRoute() {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  const [assetsDir, videosDir] = await Promise.all([getPath('assets'), getPath('videos')]);
  const [assetsProbe, videosProbe] = [probeDir(assetsDir), probeDir(videosDir)];
  const [assetDirVideos, outputDirVideos] = await Promise.all([
    assetsProbe.status === 'normal' ? scanVideos(assetsDir, '素材目录') : Promise.resolve([]),
    videosProbe.status === 'normal' ? scanVideos(videosDir, '成品目录') : Promise.resolve([])
  ]);

  const workspaceId = result.context.workspace.id;
  const uploadedAssets = listAutomationVideoAssets(workspaceId)
    .filter((asset) => asset.fileType === 'video')
    .map((asset) => ({
      id: `asset:${asset.id}`,
      name: asset.name,
      pathLabel: asset.fileUrl,
      sourceLabel: '上传素材',
      extension: extensionFromName(asset.name),
      size: asset.size,
      modifiedAt: asset.updatedAt.toISOString(),
      statusLabel: asset.status
    }));

  const tasks = listAutomationVideoTasks(workspaceId);
  const taskOutputVideos = (
    await Promise.all(
      tasks.flatMap((task) =>
        (Array.isArray(task.outputVideos) ? task.outputVideos : []).map(
          async (outputPath, index) => {
            const meta = await getFileMeta(outputPath);
            return {
              id: `task:${task.id}:${index}`,
              name: path.basename(outputPath) || `${task.title}-${index + 1}`,
              pathLabel: task.title,
              sourceLabel: '剪辑成品',
              extension: extensionFromName(outputPath),
              size: meta?.size ?? null,
              modifiedAt: meta?.modifiedAt ?? task.updatedAt.toISOString(),
              statusLabel: task.status
            } satisfies LibraryVideo;
          }
        )
      )
    )
  ).sort(sortByModifiedAt);

  const materialVideos = [...uploadedAssets, ...assetDirVideos].sort(sortByModifiedAt);
  const finishedVideos = [...taskOutputVideos, ...outputDirVideos].sort(sortByModifiedAt);

  return (
    <PageContainer
      pageTitle='视频库'
      pageDescription='分开管理企业素材视频和自动化剪辑生成的成品视频。'
    >
      <div className='space-y-6'>
        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>视频素材</CardTitle>
              <p className='text-sm text-muted-foreground'>
                专门存放企业实拍、产品、工厂、场景等可用于剪辑的视频素材。
              </p>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-semibold'>{materialVideos.length}</div>
              <p className='text-sm text-muted-foreground'>当前可用素材视频</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>自动剪辑成品库</CardTitle>
              <p className='text-sm text-muted-foreground'>
                汇总自动化剪辑空间生成的成片，便于复查、交付和后续管理。
              </p>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-semibold'>{finishedVideos.length}</div>
              <p className='text-sm text-muted-foreground'>当前剪辑成品视频</p>
            </CardContent>
          </Card>
        </div>

        <VideoLibrarySection
          title='视频素材'
          description='这里展示素材资源目录中的视频，以及自动化剪辑空间上传过的视频素材。'
          directoryLabel={assetsDir}
          probe={assetsProbe}
          unavailableText='请在“系统管理 / 数据存储”中把“素材资源”路径设置到真实目录。'
          emptyTitle='暂未发现视频素材'
          emptyDescription='把 MP4、MOV、MKV、AVI、WEBM 或 FLV 文件放入素材资源目录，或在自动化剪辑空间上传视频素材后会显示在这里。'
          videos={materialVideos}
        />

        <VideoLibrarySection
          title='自动剪辑成品库'
          description='这里展示自动化剪辑任务输出的成片，以及视频文件目录中的成品视频。'
          directoryLabel={videosDir}
          probe={videosProbe}
          unavailableText='请在“系统管理 / 数据存储”中把“视频文件”路径设置到真实目录。'
          emptyTitle='还没有自动剪辑成品'
          emptyDescription='完成一次自动化剪辑任务后，任务输出的视频会在这里汇总展示。也可以把已产出的成品视频放入视频文件目录。'
          videos={finishedVideos}
        />
      </div>
    </PageContainer>
  );
}
