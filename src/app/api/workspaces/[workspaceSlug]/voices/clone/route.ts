/**
 * Phase 3-A · 声音复刻
 *
 *   POST /api/workspaces/[workspaceSlug]/voices/clone
 *
 * 该接口负责：
 *   1. 接收 multipart/form-data：sample 文件 + displayName / language / referenceText 字段
 *   2. 落盘到 storage/voice-service/outputs/clone-samples/<ownerId>/<uuid>.<ext>
 *      （由 voice-service 端的 CLONE_SAMPLE_BASE_DIR 引用）
 *   3. 插入 voice_clones 行（status = training）
 *   4. 同步调用 voice-service /v1/voice/clone/train —— 调豆包 voice_clone HTTP
 *   5. 把结果回填到 voice_clones 行（status=ready / failed，custom_speaker_id、demoAudioPath）
 *
 * 权限：复用 scripts:manage（任何有脚本权限的角色，含 member/editor/owner/admin）
 * 限制：单文件 ≤ 10MB；audio 格式仅 wav/mp3/ogg/m4a/aac/pcm
 *
 * 实现注意：使用 Next.js 内置 request.formData()（≤10MB 体直接解析），避免 busboy 事件链兼容性问题。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { trainVoiceClone } from '@/lib/voice-service/client';
import { getDb } from '@/lib/db';
import { voiceClones, voiceCloneStatuses } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['wav', 'mp3', 'ogg', 'm4a', 'aac', 'pcm']);
const MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/pcm': 'pcm'
};

type Ctx = { params: Promise<{ workspaceSlug: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'scripts:manage');
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        message: result.reason === 'unauthenticated' ? '请先登录。' : '权限不足。'
      },
      {
        status: result.reason === 'unauthenticated' ? 401 : 403
      }
    );
  }
  const { user, workspace } = result.context;

  // 1) 解析 multipart（Next.js 内置，10MB 内可靠）
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'parse_failed', message: `multipart 解析失败：${msg}` },
      { status: 400 }
    );
  }

  const displayName = form.get('displayName');
  const language = form.get('language');
  const referenceText = form.get('referenceText');
  const sample = form.get('sample');

  if (
    typeof displayName !== 'string' ||
    typeof language !== 'string' ||
    typeof referenceText !== 'string'
  ) {
    return NextResponse.json(
      {
        error: 'missing_fields',
        message: '缺少必填字段 displayName / language / referenceText。'
      },
      { status: 400 }
    );
  }
  const trimmedName = displayName.trim().slice(0, 80);
  const trimmedLang = (language || 'cn').trim().slice(0, 8);
  const trimmedRef = referenceText.trim().slice(0, 2000);
  if (!trimmedName || !trimmedRef) {
    return NextResponse.json(
      { error: 'empty_fields', message: '音色名称和参考文本不能为空。' },
      { status: 400 }
    );
  }

  if (!(sample instanceof File)) {
    return NextResponse.json({ error: 'no_file', message: '请选择音频文件。' }, { status: 400 });
  }
  if (sample.size <= 0) {
    return NextResponse.json({ error: 'empty_file', message: '音频文件为空。' }, { status: 400 });
  }
  if (sample.size > MAX_SAMPLE_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: '训练素材不能超过 10MB。' },
      { status: 413 }
    );
  }

  // 2) 决定扩展名
  const fileMime = sample.type || '';
  const fileNameExt = path
    .extname(sample.name || '')
    .slice(1)
    .toLowerCase();
  const ext = MIME_TO_EXT[fileMime] || fileNameExt;
  if (!ALLOWED_FORMATS.has(ext)) {
    return NextResponse.json(
      {
        error: 'unsupported_format',
        message: `音频仅支持 wav / mp3 / ogg / m4a / aac / pcm（mime=${fileMime || 'unknown'} ext=${fileNameExt || 'unknown'}）`
      },
      { status: 415 }
    );
  }

  // 3) 落盘
  const repoRoot = process.cwd();
  const sampleBaseDir = path.join(
    repoRoot,
    'storage',
    'voice-service',
    'outputs',
    'clone-samples',
    user.id
  );
  try {
    await mkdir(sampleBaseDir, { recursive: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'mkdir_failed', message: `无法创建上传目录：${err}` },
      { status: 500 }
    );
  }
  const sampleId = randomUUID();
  const sampleDiskPath = path.join(sampleBaseDir, `${sampleId}.${ext}`);

  const arrayBuffer = await sample.arrayBuffer();
  await writeFile(sampleDiskPath, Buffer.from(arrayBuffer));

  // 4) 插入 voice_clones 行（status=training，custom_speaker_id 临时占位）
  const now = new Date();
  const recordId = randomUUID();
  const db = getDb();
  try {
    db.insert(voiceClones)
      .values({
        id: recordId,
        ownerId: user.id,
        workspaceId: workspace.id,
        customSpeakerId: `pending_${recordId}`,
        displayName: trimmedName,
        language: trimmedLang,
        status: 'training',
        referenceText: trimmedRef,
        samplePath: sampleDiskPath,
        sampleFormat: ext,
        sampleSizeBytes: sample.size,
        demoAudioPath: null,
        createdAt: now,
        updatedAt: now
      })
      .run();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'db_insert_failed',
        message: `voice_clones insert failed: ${err instanceof Error ? err.message : String(err)}`
      },
      { status: 500 }
    );
  }

  // 5) 调 voice-service POST /v1/voice/clone/train
  let trainResult;
  try {
    trainResult = await trainVoiceClone({
      owner_id: user.id,
      workspace_id: workspace.id,
      display_name: trimmedName,
      language: trimmedLang,
      text: trimmedRef,
      sample_format: ext,
      sample_path: sampleDiskPath
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      db.update(voiceClones)
        .set({
          status: 'failed',
          errorMessage: msg.slice(0, 500),
          updatedAt: new Date()
        })
        .where(eq(voiceClones.id, recordId))
        .run();
    } catch {
      /* ignore secondary error */
    }
    return NextResponse.json(
      { error: 'voice_service_failed', message: msg, id: recordId },
      { status: 502 }
    );
  }

  // 6) 把训练结果回填 voice_clones
  const finalStatus = voiceCloneStatuses.includes(trainResult.status as never)
    ? (trainResult.status as (typeof voiceCloneStatuses)[number])
    : 'failed';

  try {
    db.update(voiceClones)
      .set({
        customSpeakerId: trainResult.custom_speaker_id,
        status: finalStatus,
        errorMessage: trainResult.error_message ?? null,
        demoAudioPath: trainResult.demo_audio_path ?? null,
        updatedAt: new Date()
      })
      .where(eq(voiceClones.id, recordId))
      .run();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'db_update_failed',
        message: `voice_clones update failed: ${err instanceof Error ? err.message : String(err)}`
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: recordId,
    customSpeakerId: trainResult.custom_speaker_id,
    status: finalStatus,
    demoAudioPath: trainResult.demo_audio_path,
    errorMessage: trainResult.error_message,
    retryCount: trainResult.retry_count
  });
}
