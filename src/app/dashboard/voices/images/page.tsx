import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { WorkspaceAccessDenied } from '@/features/workspaces/components/workspace-access-denied';
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
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.avif',
  '.bmp',
  '.tiff'
]);
const MAX_SCAN_FILES = 200;

// 确保每次请求都重新扫描文件系统，不使用 Next.js 全路由缓存
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '图片库'
};

type SearchParams = {
  category?: string | string[];
};

type LibraryImage = {
  id: string;
  name: string;
  pathLabel: string;
  extension: string;
  size: number | null;
  modifiedAt: string | null;
};

type ImageCategory = {
  id: string;
  name: string;
  description: string;
  directoryLabel: string;
  images: LibraryImage[];
  totalSize: number;
  latestAt: string | null;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sortByModifiedAt(a: LibraryImage, b: LibraryImage) {
  return (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? '');
}

function extensionFromName(name: string) {
  const extension = path.extname(name).replace('.', '').toUpperCase();
  return extension || 'IMAGE';
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function probeBadgeVariant(status: DirProbe['status']) {
  return status === 'normal' ? 'default' : 'secondary';
}

function sumImageSize(images: LibraryImage[]) {
  return images.reduce((total, image) => total + (image.size ?? 0), 0);
}

function latestImageDate(images: LibraryImage[]) {
  return images.reduce<string | null>((latest, image) => {
    if (!image.modifiedAt) return latest;
    if (!latest || image.modifiedAt > latest) return image.modifiedAt;
    return latest;
  }, null);
}

async function scanImages(rootDir: string): Promise<LibraryImage[]> {
  const out: LibraryImage[] = [];

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
      if (!IMAGE_EXTENSIONS.has(extension)) continue;

      const stat = await fs.stat(fullPath);
      const relativePath = path.relative(rootDir, fullPath) || entry.name;
      out.push({
        id: fullPath,
        name: entry.name,
        pathLabel: relativePath,
        extension: extension.replace('.', '').toUpperCase(),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  }

  await walk(rootDir);
  return out.sort(sortByModifiedAt);
}

function viewHref(category?: string) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const query = params.toString();
  return `/dashboard/voices/images${query ? `?${query}` : ''}`;
}

function ImageRows({ images }: { images: LibraryImage[] }) {
  return (
    <div className='overflow-hidden'>
      <div className='grid grid-cols-[minmax(0,1fr)_100px_120px] border-b bg-muted/50 px-4 py-3 text-sm font-medium lg:grid-cols-[minmax(0,1fr)_100px_120px_180px]'>
        <div>图片</div>
        <div>格式</div>
        <div>大小</div>
        <div className='hidden lg:block'>更新时间</div>
      </div>
      {images.map((image) => (
        <div
          key={image.id}
          className='grid grid-cols-[minmax(0,1fr)_100px_120px] items-center border-b px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(0,1fr)_100px_120px_180px]'
        >
          <div className='min-w-0'>
            <div className='truncate font-medium'>{image.name}</div>
            <div className='truncate text-xs text-muted-foreground'>{image.pathLabel}</div>
          </div>
          <div>
            <Badge variant='outline'>{image.extension}</Badge>
          </div>
          <div className='text-muted-foreground'>
            {image.size === null ? '-' : formatBytes(image.size)}
          </div>
          <div className='hidden text-muted-foreground lg:block'>
            {formatDate(image.modifiedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className='flex flex-col items-center justify-center py-14 text-center'>
      <div className='flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
        <Icons.photo className='size-7' />
      </div>
      <h3 className='mt-4 text-base font-medium'>{title}</h3>
      <p className='mt-1 max-w-xl text-sm text-muted-foreground'>{description}</p>
    </div>
  );
}

async function listImageCategories(imagesDir: string): Promise<ImageCategory[]> {
  const categories: ImageCategory[] = [];
  const entries = await fs.readdir(imagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directoryPath = path.join(imagesDir, entry.name);
    const images = await scanImages(directoryPath);
    categories.push({
      id: entry.name,
      name: entry.name,
      description: '本地图片分类目录',
      directoryLabel: directoryPath,
      images,
      totalSize: sumImageSize(images),
      latestAt: latestImageDate(images)
    });
  }

  const rootImages = (await scanImages(imagesDir)).filter(
    (image) => !image.pathLabel.includes(path.sep)
  );
  if (rootImages.length > 0) {
    categories.unshift({
      id: 'uncategorized',
      name: '未分类图片',
      description: '直接放在图片库根目录下的图片',
      directoryLabel: imagesDir,
      images: rootImages,
      totalSize: sumImageSize(rootImages),
      latestAt: latestImageDate(rootImages)
    });
  }

  return categories.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function ImageCategoryGrid({ categories }: { categories: ImageCategory[] }) {
  if (categories.length === 0) {
    return (
      <EmptyState
        title='还没有图片分类'
        description='请在图片库目录下按场景建立文件夹，例如“产品图”“工厂实拍”“包装设计”“品牌素材”，每个文件夹会自动成为一个图片分类。'
      />
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
      {categories.map((category) => (
        <Link key={category.id} href={viewHref(category.id)}>
          <Card className='h-full transition-colors hover:bg-muted/40'>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div className='flex items-center gap-3'>
                  <div className='flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                    <Icons.photo className='size-5' />
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
                  <div className='text-2xl font-semibold'>{category.images.length}</div>
                  <div className='text-muted-foreground'>图片素材</div>
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

export default async function ImageLibraryRoute({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const result = await requireWorkspacePermission(VOICE_WORKSPACE_SLUG, 'scripts:manage');
  if (!result.ok) return <WorkspaceAccessDenied />;

  const params = (await searchParams) ?? {};
  const selectedCategoryId = firstParam(params.category) ?? null;

  const imagesDir = await getPath('images');
  const imagesProbe = probeDir(imagesDir);

  const categories = imagesProbe.status === 'normal' ? await listImageCategories(imagesDir) : [];
  const selectedCategory = selectedCategoryId
    ? categories.find((category) => category.id === selectedCategoryId)
    : null;

  const totalCount = categories.reduce((total, category) => total + category.images.length, 0);

  return (
    <PageContainer
      pageTitle='图片库'
      pageDescription='企业图片素材统一管理，按本地文件夹自动分类；路径可在“系统管理 / 数据存储”中设置。'
    >
      <div className='space-y-6'>
        <Card>
          <CardHeader className='border-b'>
            <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
              <div>
                <CardTitle className='flex items-center gap-2'>
                  <Icons.photo className='size-5 text-emerald-500' />
                  {selectedCategory ? selectedCategory.name : '图片素材库'}
                </CardTitle>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {selectedCategory
                    ? '当前分类下的图片素材。'
                    : '按本地图片库目录的一级文件夹自动分类，每一种图片素材都有独立入口。'}
                </p>
                <p className='mt-2 text-xs text-muted-foreground'>
                  当前目录：
                  <span className='font-mono'>{selectedCategory?.directoryLabel ?? imagesDir}</span>
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {selectedCategory ? (
                  <Link href={viewHref()} className={buttonVariants({ variant: 'outline' })}>
                    返回分类
                  </Link>
                ) : null}
                <Badge variant='outline'>
                  {selectedCategory
                    ? `${selectedCategory.images.length} 张图片`
                    : `${categories.length} 个分类 · ${totalCount} 张图片`}
                </Badge>
                <Badge variant={probeBadgeVariant(imagesProbe.status)}>{imagesProbe.label}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className={selectedCategory ? 'p-0' : 'p-4'}>
            {imagesProbe.status !== 'normal' ? (
              <EmptyState
                title='图片库目录暂不可用'
                description='请在“系统管理 / 数据存储”中把“素材图片库”路径设置到真实目录。'
              />
            ) : selectedCategory ? (
              selectedCategory.images.length === 0 ? (
                <EmptyState
                  title='该分类下还没有图片'
                  description='把图片素材放入这个分类文件夹后，刷新页面即可显示。'
                />
              ) : (
                <ImageRows images={selectedCategory.images} />
              )
            ) : (
              <ImageCategoryGrid categories={categories} />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
