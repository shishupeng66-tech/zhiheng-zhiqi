import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { voiceCatalog, type NewVoiceCatalogRow, type VoiceCatalogRow } from '@/lib/db/schema';

/**
 * 知衡语音 —— 本地音色库（voice_catalog）数据访问层。
 * 仅服务端使用，所有读写都走本地 SQLite，绝不直接依赖公网。
 */

export type VoiceListFilters = {
  search?: string;
  gender?: string;
  enabledOnly?: boolean;
  scene?: string;
  language?: string;
};

export function listVoices(filters: VoiceListFilters = {}): VoiceCatalogRow[] {
  const db = getDb();
  const conditions: Array<ReturnType<typeof eq>> = [];

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        like(voiceCatalog.displayName, term),
        like(voiceCatalog.voiceType, term),
        like(voiceCatalog.scene, term)
      )!
    );
  }
  if (filters.gender) conditions.push(eq(voiceCatalog.gender, filters.gender));
  if (filters.enabledOnly) conditions.push(eq(voiceCatalog.enabledForProduction, true));
  if (filters.scene) conditions.push(eq(voiceCatalog.scene, filters.scene));
  if (filters.language) conditions.push(eq(voiceCatalog.language, filters.language));

  return db
    .select()
    .from(voiceCatalog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(voiceCatalog.enabledForProduction), voiceCatalog.sortOrder)
    .all();
}

export function getVoice(voiceType: string): VoiceCatalogRow | null {
  return (
    getDb().select().from(voiceCatalog).where(eq(voiceCatalog.voiceType, voiceType)).get() ?? null
  );
}

export function countVoices(): number {
  const row = getDb()
    .select({ value: sql<number>`count(*)` })
    .from(voiceCatalog)
    .get();
  return row?.value ?? 0;
}

export function countEnabledVoices(): number {
  const row = getDb()
    .select({ value: sql<number>`count(*)` })
    .from(voiceCatalog)
    .where(eq(voiceCatalog.enabledForProduction, true))
    .get();
  return row?.value ?? 0;
}

export function setVoiceEnabled(voiceType: string, enabled: boolean): VoiceCatalogRow | null {
  const db = getDb();
  const existing = db
    .select()
    .from(voiceCatalog)
    .where(eq(voiceCatalog.voiceType, voiceType))
    .get();
  if (!existing) return null;
  const updated = db
    .update(voiceCatalog)
    .set({ enabledForProduction: enabled, updatedAt: new Date() })
    .where(eq(voiceCatalog.voiceType, voiceType))
    .returning()
    .get();
  return updated ?? null;
}

/**
 * 将同步得到的完整音色清单 upsert 进本地库。
 * - firstSync（库为空）时，对 9 个推荐音色默认启用 enabledForProduction。
 * - 非首次同步：保留管理员手动设置的 enabledForProduction，仅更新元信息。
 * 整批在单个事务中完成，保证原子性。
 */
export function upsertVoices(
  voices: NewVoiceCatalogRow[],
  recommendedVoiceTypes: string[]
): { inserted: number; updated: number } {
  const db = getDb();
  const existingMap = new Map(
    db
      .select()
      .from(voiceCatalog)
      .all()
      .map((row) => [row.voiceType, row])
  );
  const firstSync = existingMap.size === 0;
  const recommended = new Set(recommendedVoiceTypes);

  let inserted = 0;
  let updated = 0;

  db.transaction((tx) => {
    for (const voice of voices) {
      const existing = existingMap.get(voice.voiceType);
      if (existing) {
        tx.update(voiceCatalog)
          .set({
            displayName: voice.displayName,
            gender: voice.gender,
            language: voice.language,
            dialects: voice.dialects,
            scene: voice.scene,
            tags: voice.tags,
            description: voice.description,
            resourceId: voice.resourceId,
            voiceKind: voice.voiceKind,
            provider: voice.provider,
            previewUrl: voice.previewUrl,
            sortOrder: voice.sortOrder,
            updatedAt: new Date()
          })
          .where(eq(voiceCatalog.voiceType, voice.voiceType))
          .run();
        updated += 1;
      } else {
        tx.insert(voiceCatalog)
          .values({
            ...voice,
            enabledForProduction: firstSync && recommended.has(voice.voiceType),
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .run();
        inserted += 1;
      }
    }
  });

  return { inserted, updated };
}
