import type { NewVoiceCatalogRow, VoiceKind } from '@/lib/db/schema';
import { getVoiceServiceUrl } from '@/lib/voice-service/client';

export type CatalogSourceResult = {
  rows: NewVoiceCatalogRow[];
  /** 数据源声明的音色总数（来自 Voice Service 的 total 字段）。 */
  sourceTotal: number;
  /** 本次从数据源实际拉取到的条目数。 */
  fetched: number;
  /** 数据源侧去重后的条目数。 */
  deduped: number;
};

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

/**
 * VoiceCatalogSource —— 同步层的独立数据源抽象。
 *
 * 当前实现从本地 Voice Service（/v1/voices/all）拉取，该服务背后是项目内维护的
 * 官方音色 manifest（volcengine_seed_tts_voices.py），并非运行时直连第三方接口。
 *
 * 未来若官方提供稳定的运行时音色列表接口，只需替换 fetchAll 的实现，
 * 页面 / API / 数据库 schema 均无需改动。
 */
export const voiceCatalogSource = {
  async fetchAll(): Promise<CatalogSourceResult> {
    const baseUrl = getVoiceServiceUrl();
    const allVoices: RawVoice[] = [];
    let total = 0;
    let fetched = 0;
    let deduped = 0;
    let hasMore = true;
    let page = 1;
    const pageSize = 200;

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
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    return { rows, sourceTotal: total, fetched, deduped };
  }
};
