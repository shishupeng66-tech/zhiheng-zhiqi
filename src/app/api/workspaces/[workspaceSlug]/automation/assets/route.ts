import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import Busboy from 'busboy';
import { createAutomationVideoAsset } from '@/lib/workspaces/automation-editing';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

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
  ['video/x-flv', { ext: 'flv', fileType: 'video' }],
  ['audio/aac', { ext: 'aac', fileType: 'audio' }],
  ['audio/flac', { ext: 'flac', fileType: 'audio' }],
  ['audio/m4a', { ext: 'm4a', fileType: 'audio' }],
  ['audio/mp4', { ext: 'm4a', fileType: 'audio' }],
  ['audio/mpeg', { ext: 'mp3', fileType: 'audio' }],
  ['audio/ogg', { ext: 'ogg', fileType: 'audio' }],
  ['audio/wav', { ext: 'wav', fileType: 'audio' }],
  ['audio/x-wav', { ext: 'wav', fileType: 'audio' }]
]);

type ParsedFile = {
  fieldname: string;
  filename: string;
  mimeType: string;
  size: number;
  diskPath: string;
  fileUrl: string;
};

/**
 * 使用 busboy 流式解析 multipart/form-data 请求，避免将整个 body 读入内存。
 * 同时解决 Next.js 默认 10MB body 克隆限制导致的大文件上传失败问题。
 */
function parseMultipartForm(
  request: NextRequest,
  workspaceSlug: string,
  uploadDir: string
): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers.get('content-type') ?? '';
    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);

    // 提前校验 content-length，避免无效请求
    if (contentLength > MAX_ASSET_SIZE + 1024 * 1024) {
      reject(new Error('单个素材不能超过 200MB'));
      return;
    }

    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: {
        fileSize: MAX_ASSET_SIZE,
        files: 1,
        fields: 10
      }
    });

    let foundFile: ParsedFile | null = null;
    let hasError = false;
    let pendingFiles = 0;
    let busboyFinished = false;

    // 等待 busboy 解析完成 + 文件写入完成后再 resolve
    function tryResolve() {
      if (hasError) return;
      if (busboyFinished && pendingFiles === 0) {
        if (!foundFile) {
          reject(new Error('请选择素材文件'));
          return;
        }
        resolve(foundFile);
      }
    }

    busboy.on(
      'file',
      (
        fieldname: string,
        stream: NodeJS.ReadableStream,
        info: { filename: string; encoding: string; mimeType: string }
      ) => {
        if (fieldname !== 'asset') {
          stream.resume();
          return;
        }

        const type = ALLOWED_TYPES.get(info.mimeType);
        if (!type) {
          hasError = true;
          stream.resume();
          reject(
            new Error(
              `素材仅支持 png、jpg、jpeg、webp、mp4、mov、mkv、avi、flv、mp3、wav、m4a、aac、flac、ogg（当前类型：${info.mimeType}）`
            )
          );
          return;
        }

        const fileId = randomUUID();
        const diskFilename = `${fileId}.${type.ext}`;
        const diskPath = path.join(uploadDir, diskFilename);
        const fileUrl = `/uploads/automation-assets/${workspaceSlug}/${diskFilename}`;

        const writeStream = createWriteStream(diskPath);
        let fileSize = 0;
        pendingFiles++;

        stream.on('data', (chunk: Buffer) => {
          fileSize += chunk.length;
          if (fileSize > MAX_ASSET_SIZE) {
            hasError = true;
            writeStream.close();
            reject(new Error('单个素材不能超过 200MB'));
          }
        });

        stream.pipe(writeStream);

        writeStream.on('finish', () => {
          pendingFiles--;
          if (!hasError) {
            foundFile = {
              fieldname,
              filename: info.filename,
              mimeType: info.mimeType,
              size: fileSize,
              diskPath,
              fileUrl
            };
          }
          tryResolve();
        });

        writeStream.on('error', (err) => {
          hasError = true;
          pendingFiles--;
          reject(err);
        });
      }
    );

    busboy.on('finish', () => {
      busboyFinished = true;
      tryResolve();
    });

    const body = request.body;
    if (!body) {
      reject(new Error('请求体为空'));
      return;
    }

    // 将 Web ReadableStream 转换为 Node.js Readable 并 pipe 到 busboy
    const nodeStream = Readable.fromWeb(body as any);

    nodeStream.on('error', (err: Error) => {
      hasError = true;
      reject(err);
    });

    nodeStream.pipe(busboy);

    busboy.on('error', (err) => {
      hasError = true;
      reject(err);
    });
  });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { workspaceSlug } = await params;
    const result = await requireWorkspacePermission(workspaceSlug, 'assets:manage');
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.reason,
          message: result.reason === 'unauthenticated' ? '请先登录' : '没有权限上传素材'
        },
        { status: result.reason === 'unauthenticated' ? 401 : 403 }
      );
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'automation-assets', workspaceSlug);
    await mkdir(dir, { recursive: true });

    const parsed = await parseMultipartForm(request, workspaceSlug, dir);

    const typeInfo = ALLOWED_TYPES.get(parsed.mimeType);
    if (!typeInfo) {
      return NextResponse.json(
        {
          error: 'invalid_type',
          message:
            '素材仅支持 png、jpg、jpeg、webp、mp4、mov、mkv、avi、flv、mp3、wav、m4a、aac、flac、ogg'
        },
        { status: 400 }
      );
    }

    const asset = createAutomationVideoAsset({
      workspaceId: result.context.workspace.id,
      uploadedBy: result.context.user.id,
      name: parsed.filename,
      fileUrl: parsed.fileUrl,
      fileType: typeInfo.fileType,
      mimeType: parsed.mimeType,
      size: parsed.size
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error('[automation-assets] upload error:', error);
    const message = error instanceof Error ? error.message : '上传失败，请稍后重试';
    let errorCode = 'internal_error';
    let status = 500;
    if (message.includes('请选择素材文件')) {
      errorCode = 'missing_file';
      status = 400;
    } else if (message.includes('仅支持')) {
      errorCode = 'invalid_type';
      status = 400;
    } else if (message.includes('不能超过')) {
      errorCode = 'file_too_large';
      status = 400;
    }
    return NextResponse.json({ error: errorCode, message }, { status });
  }
}
