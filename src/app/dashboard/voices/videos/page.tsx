import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
import {
  listAutomationVideoAssets,
  listAutomationVideoTasks
} from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPath, probeDir, type DirProbe } from '@/lib/storage';
import { cn, formatBytes } from '@/lib/utils';
import fs from 'node:fs/promises';
import path from 'node:path';

const VOICE_WORKSPACE_SLUG = 'enterprise-media';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.flv']);
const MAX_SCAN_FILES = 200;

// 确保每次请求都重新扫描文件系统，不使用 Next.js 全路由缓存
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '视频库'
};

type VideoLibraryView = 'materials' | 'outputs';

type SearchParams = {
  view?: string | string[];
  category?: string | string[];
};

type LibraryVideo = {
  id: string;
  name: string;
  pathLabel: string;
  sourceLabel: string;
  extension: string;
  size: number | null;
  modifiedAt: string | null;
};

type MaterialCategory = {
  id: string;
  name: string;
  description: string;
  directoryLabel: string;
  videos: LibraryVideo[];
  totalSize: number;
  latestAt: string | null;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function sumVideoSize(videos: LibraryVideo[]) {
  return videos.reduce((total, video) => total + (video.size ?? 0), 0);
}

function latestVideoDate(videos: LibraryVideo[]) {
  return videos.reduce<string | null>((latest, video) => {
    if (!video.modifiedAt) return latest;
    if (!latest || video.modifiedAt > latest) return video.modifiedAt;
    return latest;
  }, null);
}

async function scanVideos(
  rootDir: string,
  sourceLabel: string,
  pathPrefix?: string
): Promise<LibraryVideo[]> {
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
      const relativePath = path.relative(rootDir, fullPath) || entry.name;
      out.push({
        id: fullPath,
        name: entry.name,
        pathLabel: pathPrefix ? path.join(pathPrefix, relativePath) : relativePath,
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

async function listMaterialCategories(
  assetsDir: string,
  uploadedAssets: LibraryVideo[]
): Promise<MaterialCategory[]> {
  const categories: MaterialCategory[] = [];
  const entries = await fs.readdir(assetsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directoryPath = path.join(assetsDir, entry.name);
    const videos = await scanVideos(directoryPath, '素材目录', entry.name);
    categories.push({
      id: entry.name,
      name: entry.name,
      description: '本地素材分类目录',
      directoryLabel: directoryPath,
      videos,
      totalSize: sumVideoSize(videos),
      latestAt: latestVideoDate(videos)
    });
  }

  const rootVideos = (await scanVideos(assetsDir, '素材目录')).filter(
    (video) => !video.pathLabel.includes(path.sep)
  );
  if (rootVideos.length > 0) {
    categories.unshift({
      id: 'uncategorized',
      name: '未分类素材',
      description: '直接放在素材资源根目录下的视频',
      directoryLabel: assetsDir,
      videos: rootVideos,
      totalSize: sumVideoSize(rootVideos),
      latestAt: latestVideoDate(rootVideos)
    });
  }

  if (uploadedAssets.length > 0) {
    categories.unshift({
      id: 'uploaded-assets',
      name: '上传素材',
      description: '自动化剪辑空间上传过的视频素材',
      directoryLabel: '系统上传记录',
      videos: uploadedAssets,
      totalSize: sumVideoSize(uploadedAssets),
      latestAt: latestVideoDate(uploadedAssets)
    });
  }

  return categories.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function viewHref(view: VideoLibraryView, category?: string) {
  const params = new URLSearchParams({ view });
  if (category) params.set('category', category);
  return `/dashboard/voices/videos?${params.toString()}`;
}

function ViewSwitch({
  activeView,
  materialCount,
  outputCount
}: {
  activeView: VideoLibraryView;
  materialCount: number;
  outputCount: number;
}) {
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Link
        href={viewHref('materials')}
        className={cn(
          buttonVariants({ variant: activeView === 'materials' ? 'default' : 'outline' }),
          'h-9'
        )}
      >
        <Icons.video className='size-4' />
        视频素材库
        <Badge variant={activeView === 'materials' ? 'secondary' : 'outline'}>
          {materialCount}
        </Badge>
      </Link>
      <Link
        href={viewHref('outputs')}
        className={cn(
          buttonVariants({ variant: activeView === 'outputs' ? 'default' : 'outline' }),
          'h-9'
        )}
      >
        <Icons.library className='size-4' />
        自动剪辑成品库
        <Badge variant={activeView === 'outputs' ? 'secondary' : 'outline'}>{outputCount}</Badge>
      </Link>
    </div>
  );
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

function MaterialCategoryGrid({ categories }: { categories: MaterialCategory[] }) {
  if (categories.length === 0) {
    return (
      <EmptyState
        title='还没有素材分类'
        description='请在素材资源目录下按场景建立文件夹，例如“真人口播”“样品陈列”“研发操作”“工厂环境”，每个文件夹会自动成为一个素材分类。'
      />
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
      {categories.map((category) => (
        <Link key={category.id} href={viewHref('materials', category.id)}>
          <Card className='h-full transition-colors hover:bg-muted/40'>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div className='flex items-center gap-3'>
                  <div className='flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400'>
                    <Icons.workspace className='size-5' />
                  </div>
                  <div>
                    <CardTitle className='text-base'>{category.name}</CardTitle>
                    <p className='mt-1 text-xs text-muted-foreground'>{category.description}</p>
                  </div>
                </div>
                <Icons.chevronRight className='mt-1 size-4 text-muted-foreground' />
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='grid grid-cols-2 gap-3 text-sm'>
                <div>
                  <div className='text-2xl font-semibold'>{category.videos.length}</div>
                  <div className='text-muted-foreground'>素材视频</div>
                </div>
                <div>
                  <div className='text-2xl font-semibold'>{formatBytes(category.totalSize)}</div>
                  <div className='text-muted-foreground'>占用空间</div>
                </div>
              </div>
              <div className='truncate text-xs text-muted-foreground'>
                {category.directoryLabel}
              </div>
              <div className='text-xs text-muted-foreground'>
                最近更新：{formatDate(category.latestAt)}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function MaterialLibrary({
  assetsDir,
  assetsProbe,
  categories,
  selectedCategoryId
}: {
  assetsDir: string;
  assetsProbe: DirProbe;
  categories: MaterialCategory[];
  selectedCategoryId: string | null;
}) {
  const selectedCategory = selectedCategoryId
    ? categories.find((category) => category.id === selectedCategoryId)
    : null;

  return (
    <Card>
      <CardHeader className='border-b'>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Icons.video className='size-5 text-blue-500' />
              {selectedCategory ? selectedCategory.name : '视频素材库'}
            </CardTitle>
            <p className='mt-1 text-sm text-muted-foreground'>
              {selectedCategory
                ? '当前分类下的视频素材。'
                : '按本地素材资源目录的一级文件夹自动分类，每一种素材都有独立入口。'}
            </p>
            <p className='mt-2 text-xs text-muted-foreground'>
              当前目录：
              <span className='font-mono'>{selectedCategory?.directoryLabel ?? assetsDir}</span>
            </p>
          </div>
          <div className='flex items-center gap-2'>
            {selectedCategory ? (
              <Link href={viewHref('materials')} className={buttonVariants({ variant: 'outline' })}>
                返回分类
              </Link>
            ) : null}
            <Badge variant='outline'>
              {selectedCategory
                ? `${selectedCategory.videos.length} 个视频`
                : `${categories.length} 个分类`}
            </Badge>
            <Badge variant={probeBadgeVariant(assetsProbe.status)}>{assetsProbe.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={selectedCategory ? 'p-0' : 'p-4'}>
        {assetsProbe.status !== 'normal' ? (
          <EmptyState
            title='素材资源目录暂不可用'
            description='请在“系统管理 / 数据存储”中把“素材资源”路径设置到真实目录。'
          />
        ) : selectedCategory ? (
          selectedCategory.videos.length === 0 ? (
            <EmptyState
              title='该分类下还没有视频'
              description='把素材视频放入这个分类文件夹后，刷新页面即可显示。'
            />
          ) : (
            <VideoRows videos={selectedCategory.videos} />
          )
        ) : (
          <MaterialCategoryGrid categories={categories} />
        )}
      </CardContent>
    </Card>
  );
}

function OutputLibrary({
  videosDir,
  videosProbe,
  finishedVideos
}: {
  videosDir: string;
  videosProbe: DirProbe;
  finishedVideos: LibraryVideo[];
}) {
  return (
    <Card>
      <CardHeader className='border-b'>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Icons.library className='size-5 text-blue-500' />
              自动剪辑成品库
            </CardTitle>
            <p className='mt-1 text-sm text-muted-foreground'>
              专门展示自动化剪辑空间生成的成品视频，便于复查、交付和后续管理。
            </p>
            <p className='mt-2 text-xs text-muted-foreground'>
              当前目录：<span className='font-mono'>{videosDir}</span>
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline'>{finishedVideos.length} 个视频</Badge>
            <Badge variant={probeBadgeVariant(videosProbe.status)}>{videosProbe.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className='p-0'>
        {videosProbe.status !== 'normal' ? (
          <EmptyState
            title='视频文件目录暂不可用'
            description='请在“系统管理 / 数据存储”中把“视频文件”路径设置到真实目录。'
          />
        ) : finishedVideos.length === 0 ? (
          <EmptyState
            title='还没有自动剪辑成品'
            description='完成一次自动化剪辑任务后，任务输出的视频会在这里汇总展示。也可以把已产出的成品视频放入视频文件目录。'
          />
        ) : (
          <VideoRows videos={finishedVideos} />
        )}
      </CardContent>
    </Card>
  );
}

export default async function VideoLibraryRoute({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  const params = (await searchParams) ?? {};
  const activeView: VideoLibraryView =
    firstParam(params.view) === 'outputs' ? 'outputs' : 'materials';
  const selectedCategoryId = firstParam(params.category) ?? null;

  const [assetsDir, videosDir] = await Promise.all([getPath('assets'), getPath('videos')]);
  const [assetsProbe, videosProbe] = [probeDir(assetsDir), probeDir(videosDir)];

  const workspaceId = result.context.workspace.id;

  // 上传素材：先从 DB 读取，再逐个检查真实文件是否存在，过滤掉已被人工删除的
  const uploadedAssetsRaw = listAutomationVideoAssets(workspaceId).filter(
    (asset) => asset.fileType === 'video'
  );
  const uploadedAssets = (
    await Promise.all(
      uploadedAssetsRaw.map(async (asset) => {
        // fileUrl 格式：/uploads/automation-assets/{slug}/{filename}
        // 对应磁盘路径：public/uploads/automation-assets/{slug}/{filename}
        const diskPath = path.join(process.cwd(), 'public', asset.fileUrl);
        try {
          const stat = await fs.stat(diskPath);
          return {
            id: `asset:${asset.id}`,
            name: asset.name,
            pathLabel: asset.fileUrl,
            sourceLabel: '上传素材',
            extension: extensionFromName(asset.name),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString()
          } as LibraryVideo;
        } catch {
          // 文件不存在或不可读 → 从视频库中过滤掉（DB 记录保留）
          return null;
        }
      })
    )
  ).filter((item): item is LibraryVideo => item !== null);

  const materialCategories =
    assetsProbe.status === 'normal' ? await listMaterialCategories(assetsDir, uploadedAssets) : [];

  const outputDirVideos =
    videosProbe.status === 'normal' ? await scanVideos(videosDir, '成品目录') : [];

  const tasks = listAutomationVideoTasks(workspaceId);
  const taskOutputVideos = (
    await Promise.all(
      tasks.flatMap((task) =>
        (Array.isArray(task.outputVideos) ? task.outputVideos : []).map(
          async (outputPath, index) => {
            const meta = await getFileMeta(outputPath);
            // 文件不存在 → 从视频库过滤掉（任务记录本身保留在任务历史中）
            if (!meta) return null;
            return {
              id: `task:${task.id}:${index}`,
              name: path.basename(outputPath) || `${task.title}-${index + 1}`,
              pathLabel: task.title,
              sourceLabel: '剪辑成品',
              extension: extensionFromName(outputPath),
              size: meta.size,
              modifiedAt: meta.modifiedAt
            } as LibraryVideo;
          }
        )
      )
    )
  )
    .filter((item): item is LibraryVideo => item !== null)
    .sort(sortByModifiedAt);

  const materialCount = materialCategories.reduce(
    (total, category) => total + category.videos.length,
    0
  );
  const finishedVideos = [...taskOutputVideos, ...outputDirVideos].sort(sortByModifiedAt);

  return (
    <PageContainer
      pageTitle='视频库'
      pageDescription='视频素材和自动剪辑成品分开管理；素材按本地文件夹场景分类。'
    >
      <div className='space-y-6'>
        <ViewSwitch
          activeView={activeView}
          materialCount={materialCount}
          outputCount={finishedVideos.length}
        />

        {activeView === 'materials' ? (
          <MaterialLibrary
            assetsDir={assetsDir}
            assetsProbe={assetsProbe}
            categories={materialCategories}
            selectedCategoryId={selectedCategoryId}
          />
        ) : (
          <OutputLibrary
            videosDir={videosDir}
            videosProbe={videosProbe}
            finishedVideos={finishedVideos}
          />
        )}
      </div>
    </PageContainer>
  );
}
