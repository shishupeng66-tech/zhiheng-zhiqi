import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const AVATAR_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars');
const ALLOWED_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp']
]);

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file', message: '请选择头像图片' }, { status: 400 });
  }

  const ext = ALLOWED_TYPES.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: 'invalid_type', message: '头像仅支持 png、jpg、jpeg、webp 格式' },
      { status: 400 }
    );
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return NextResponse.json(
      { error: 'file_too_large', message: '头像图片不能超过 2MB' },
      { status: 400 }
    );
  }

  await mkdir(AVATAR_DIR, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  const diskPath = path.join(AVATAR_DIR, filename);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(diskPath, bytes);

  return NextResponse.json({ url: `/uploads/avatars/${filename}` }, { status: 201 });
}
