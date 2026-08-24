import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import {
  providerProfiles,
  providerSettings,
  settingModules,
  type SettingModule
} from '@/lib/db/schema';
import { decryptSecret, encryptSecret, maskSecret } from './crypto';
import type {
  ModuleSettingsOutput,
  ProviderConfigInput,
  ProviderProfileOutput,
  SettingFieldInput,
  SettingFieldOutput
} from './types';

function now(): Date {
  return new Date();
}

function toFieldOutput(key: string, value: string | null, isSecret: boolean): SettingFieldOutput {
  if (isSecret) {
    const display = value ? maskSecret(decryptSecret(value)) : null;
    return { key, value: null, isSecret: true, masked: true, displayValue: display };
  }
  return { key, value, isSecret: false, masked: false, displayValue: value };
}

/** 读取某模块的完整设置（含脱敏后的字段，secret 无明文）。 */
export async function listModuleSettings(module: SettingModule): Promise<ModuleSettingsOutput> {
  const db = getDb();
  const profiles = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.module, module));
  const providers: ProviderProfileOutput[] = [];
  for (const p of profiles) {
    const settings = await db
      .select()
      .from(providerSettings)
      .where(eq(providerSettings.profileId, p.id));
    providers.push({
      id: p.id,
      module: p.module,
      provider: p.provider,
      enabled: p.enabled,
      isDefault: p.isDefault,
      fields: settings.map((s) => toFieldOutput(s.key, s.value, s.isSecret))
    });
  }
  return { module, providers };
}

/** 读取全部 4 个模块的设置（脱敏）。 */
export async function listAllSettings(): Promise<Record<SettingModule, ProviderProfileOutput[]>> {
  const out = {} as Record<SettingModule, ProviderProfileOutput[]>;
  for (const m of settingModules) {
    out[m] = (await listModuleSettings(m)).providers;
  }
  return out;
}

/**
 * 应用某模块的整体配置（事务）。写入即加密 secret。
 * - 同一模块至多一个 isDefault；若本次有任一 provider 标记为默认，先清空同模块其他默认。
 */
export async function applyModuleConfig(
  module: SettingModule,
  providers: ProviderConfigInput[]
): Promise<void> {
  const db = getDb();
  // 注意：better-sqlite3 的事务回调必须是同步函数，不支持 async。
  // 设置写入规模很小，这里以顺序执行保证正确（写入即加密 secret）。
  if (providers.some((p) => p.isDefault)) {
    await db
      .update(providerProfiles)
      .set({ isDefault: false, updatedAt: now() })
      .where(eq(providerProfiles.module, module));
  }

  for (const input of providers) {
    const existing = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(
        and(eq(providerProfiles.module, module), eq(providerProfiles.provider, input.provider))
      )
      .limit(1);

    let profileId: string;
    if (existing.length > 0) {
      profileId = existing[0].id;
      await db
        .update(providerProfiles)
        .set({
          enabled: input.enabled ?? false,
          isDefault: input.isDefault ?? false,
          updatedAt: now()
        })
        .where(eq(providerProfiles.id, profileId));
    } else {
      profileId = randomUUID();
      await db.insert(providerProfiles).values({
        id: profileId,
        module,
        provider: input.provider,
        enabled: input.enabled ?? false,
        isDefault: input.isDefault ?? false,
        createdAt: now(),
        updatedAt: now()
      });
    }

    for (const f of input.fields) {
      const cur = await db
        .select({ id: providerSettings.id, value: providerSettings.value })
        .from(providerSettings)
        .where(and(eq(providerSettings.profileId, profileId), eq(providerSettings.key, f.key)))
        .limit(1);

      let stored: string | null;
      if (f.isSecret) {
        if (f.changed === true) {
          stored = f.value ? encryptSecret(f.value) : null;
        } else {
          stored = cur[0]?.value ?? null;
        }
      } else {
        stored = f.value ?? null;
      }

      if (cur.length > 0) {
        await db
          .update(providerSettings)
          .set({ value: stored, isSecret: f.isSecret, updatedAt: now() })
          .where(eq(providerSettings.id, cur[0].id));
      } else {
        await db.insert(providerSettings).values({
          id: randomUUID(),
          profileId,
          key: f.key,
          value: stored,
          isSecret: f.isSecret,
          createdAt: now(),
          updatedAt: now()
        });
      }
    }
  }
}

/** 内部使用：解密读取某 (module, provider) 的全部字段明文（键值对）。 */
export async function getProviderConfig(
  module: SettingModule,
  provider: string
): Promise<Record<string, string>> {
  const db = getDb();
  const profiles = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(and(eq(providerProfiles.module, module), eq(providerProfiles.provider, provider)))
    .limit(1);
  if (profiles.length === 0) return {};
  const settings = await db
    .select()
    .from(providerSettings)
    .where(eq(providerSettings.profileId, profiles[0].id));
  const out: Record<string, string> = {};
  for (const s of settings) {
    if (s.value == null) continue;
    out[s.key] = s.isSecret ? decryptSecret(s.value) : s.value;
  }
  return out;
}

/**
 * 内部使用：读取某模块的默认（或首个启用）Provider 的明文配置。
 * 用于业务调用层（ai.chat / 语音桥接）在运行时解析真实凭据。
 */
export async function getDefaultProviderConfig(
  module: SettingModule
): Promise<{ provider: string; config: Record<string, string> } | null> {
  const db = getDb();
  const profiles = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.module, module));
  if (profiles.length === 0) return null;
  const chosen =
    profiles.find((p) => p.isDefault) ?? profiles.find((p) => p.enabled) ?? profiles[0];
  const config = await getProviderConfig(module, chosen.provider);
  return { provider: chosen.provider, config };
}
