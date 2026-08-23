import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { createAutomationVideoAsset } from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ workspaceSlug: string }> };

const MAX_ASSET_SIZE = 200 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/png', { ext: 'png', fileType: 'image' }],
  ['image/jpeg', { ext: 'jpg', fileType: 'image' }],
  ['image/webp', { ext: 'webp', fileType: 'image' }],
  ['video/mp4', { ext: 'mp4', fileType: 'video' }],
  ['video/quicktime', { ext: 'mov', fileType: 'video' }],
  ['video/x-matroska', { ext: 'mkv', fileType: 'video' }],
  ['video/x-msvideo', { ext: 'avi', fileType: 'video' }],
  ['video/x-flv', { ext: 'flv', fileType: 'video' }]
]);

export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'assets:manage');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('asset');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file', message: '请选择素材文件' }, { status: 400 });
  }

  const type = ALLOWED_TYPES.get(file.type);
  if (!type) {
    return NextResponse.json(
      {
        error: 'invalid_type',
        message: '素材仅支持 png、jpg、jpeg、webp、mp4、mov、mkv、avi、flv'
      },
      { status: 400 }
    );
  }
  if (file.size > MAX_ASSET_SIZE) {
    return NextResponse.json(
      { error: 'file_too_large', message: '单个素材不能超过 200MB' },
      { status: 400 }
    );
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', 'automation-assets', workspaceSlug);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${type.ext}`;
  const diskPath = path.join(dir, filename);
  await writeFile(diskPath, Buffer.from(await file.arrayBuffer()));

  const asset = createAutomationVideoAsset({
    workspaceId: result.context.workspace.id,
    uploadedBy: result.context.user.id,
    name: file.name,
    fileUrl: `/uploads/automation-assets/${workspaceSlug}/${filename}`,
    fileType: type.fileType,
    mimeType: file.type,
    size: file.size
  });

  return NextResponse.json({ asset }, { status: 201 });
}
