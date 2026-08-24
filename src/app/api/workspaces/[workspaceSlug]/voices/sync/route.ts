import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { upsertVoices, countVoices, countEnabledVoices } from '@/lib/voice-catalog';
import { speechVoiceCatalog } from '@/lib/voice-service/speech-voice-catalog';
import { getVoiceServiceUrl } from '@/lib/voice-service/client';
import type { NewVoiceCatalogRow, VoiceKind } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

/** 9 个推荐音色（产品侧 id 对应的 provider voice_type），首次同步默认启用。 */
const RECOMMENDED_VOICE_TYPES = speechVoiceCatalog.map((voice) => voice.providerVoiceId);

type RawVoice = {
  voice_type: string;
  name?: string;
  gender?: string;
  language?: string;
  dialects?: unknown;
  scene?: string;
  tags?: unknown;
  description?: string;
  resource_id?: string;
  voice_kind?: string;
  provider?: string;
  preview_url?: string;
  sort_order?: number;
};

export async function POST(_request: NextRequest, { params }: Ctx) {
  const workspaceSlug = (await params).workspaceSlug;
  const result = await requireWorkspacePermission(workspaceSlug, 'voices:manage');
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        message:
          result.reason === 'unauthenticated'
            ? '请先登录。'
            : '权限不足，仅超级管理员或工作空间所有者可同步完整音色库。'
      },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  // 完整遍历 Voice Service /v1/voices/all（支持分页），汇总 Total / fetched / deduped。
  const baseUrl = getVoiceServiceUrl();
  const allVoices: RawVoice[] = [];
  let total = 0;
  let fetched = 0;
  let deduped = 0;
  let hasMore = true;
  let page = 1;
  const pageSize = 200;

  try {
    while (hasMore) {
      const url = `${baseUrl}/v1/voices/all?page=${page}&page_size=${pageSize}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Voice Service /v1/voices/all HTTP ${res.status}`);
      const payload = (await res.json()) as {
        total?: number;
        fetched?: number;
        deduped?: number;
        has_more?: boolean;
        voices?: RawVoice[];
      };
      total = payload.total ?? total;
      fetched = payload.fetched ?? fetched;
      deduped = payload.deduped ?? deduped;
      const items = Array.isArray(payload.voices) ? payload.voices : [];
      allVoices.push(...items);
      hasMore = Boolean(payload.has_more);
      page += 1;
      if (page > 50) break; // 安全阀：最多 50 页（10000 条）
    }
  } catch (error) {
    console.error('[voices:sync] 无法拉取完整音色目录', error);
    return NextResponse.json(
      {
        error: 'voice_service_unavailable',
        message: '无法连接语音服务，请确认本地 Voice Service 已启动。'
      },
      { status: 502 }
    );
  }

  const now = new Date();
  const rows: NewVoiceCatalogRow[] = allVoices.map((voice) => {
    const voiceKind: VoiceKind =
      voice.voice_kind === 'cloned' || voice.voice_kind === 'enterprise'
        ? (voice.voice_kind as VoiceKind)
        : 'preset';
    return {
      voiceType: String(voice.voice_type),
      displayName: String(voice.name ?? voice.voice_type),
      gender: voice.gender ? String(voice.gender) : null,
      language: voice.language ? String(voice.language) : 'zh-cn',
      dialects: Array.isArray(voice.dialects) ? (voice.dialects as unknown[]).map(String) : [],
      scene: voice.scene ? String(voice.scene) : null,
      tags: Array.isArray(voice.tags) ? (voice.tags as unknown[]).map(String) : [],
      description: voice.description ? String(voice.description) : null,
      resourceId: voice.resource_id ? String(voice.resource_id) : 'seed-tts-2.0',
      voiceKind,
      provider: voice.provider ? String(voice.provider) : 'doubao',
      previewUrl: voice.preview_url ? String(voice.preview_url) : null,
      sortOrder: typeof voice.sort_order === 'number' ? voice.sort_order : 0,
      createdAt: now,
      updatedAt: now
    };
  });

  const { inserted, updated } = upsertVoices(rows, RECOMMENDED_VOICE_TYPES);

  return NextResponse.json({
    total,
    fetched,
    deduped,
    inserted,
    updated,
    enabledByDefault: RECOMMENDED_VOICE_TYPES.length,
    catalogTotal: countVoices(),
    enabledCount: countEnabledVoices()
  });
}
