import { loadEnvConfig } from '@next/env';
import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from '../src/lib/db';
import { applyModuleConfig } from '../src/lib/settings/store';
import { writeVoiceServiceBridgeFromPlaintext } from '../src/lib/settings/tts-bridge';
import type { ProviderConfigInput, SettingFieldInput } from '../src/lib/settings/types';

/**
 * 迁移真实 TTS（豆包）配置到统一设置中心。
 *
 * 行为：
 * 1. 应用数据库迁移，确保 provider_profiles / provider_settings 表存在。
 * 2. 读取 .env.local 中的 DOUBAO_SPEECH_* 明文密钥。
 * 3. 加密写入统一设置（module=voice, provider=doubao），secret 入密文，绝不入库明文。
 * 4. 写出 gitignored 桥接文件 data/.voice-service-env（供 Python Voice Service 读取）。
 * 5. 迁移成功后，从 .env.local 删除已迁移的 DOUBAO_SPEECH_* 明文密钥
 *    （保留 SETTINGS_MASTER_KEY / VOLCENGINE_* 等）。
 *
 * 安全：Voice Service 通过增强后的 load_project_env() 优先读取桥接文件，主链不被破坏。
 */

const DOUBAO_KEYS: Array<{ env: string; key: string; secret: boolean }> = [
  { env: 'DOUBAO_SPEECH_API_KEY', key: 'DOUBAO_SPEECH_API_KEY', secret: true },
  { env: 'DOUBAO_SPEECH_RESOURCE_ID', key: 'DOUBAO_SPEECH_RESOURCE_ID', secret: false },
  { env: 'DOUBAO_SPEECH_ENDPOINT', key: 'DOUBAO_SPEECH_ENDPOINT', secret: false },
  { env: 'DOUBAO_SPEECH_DEFAULT_VOICE', key: 'DOUBAO_SPEECH_DEFAULT_VOICE', secret: false },
  { env: 'DOUBAO_SPEECH_APP_ID', key: 'DOUBAO_SPEECH_APP_ID', secret: false },
  { env: 'DOUBAO_SPEECH_APP_KEY', key: 'DOUBAO_SPEECH_APP_KEY', secret: false },
  { env: 'DOUBAO_SPEECH_WS_ENDPOINT', key: 'DOUBAO_SPEECH_WS_ENDPOINT', secret: false }
];

async function main() {
  loadEnvConfig(process.cwd());
  console.log('[migrate-tts] 正在应用数据库迁移...');
  runMigrations();

  const plainValues: Record<string, string> = {};
  const fields: SettingFieldInput[] = [];
  for (const d of DOUBAO_KEYS) {
    const v = process.env[d.env];
    if (v == null || v === '') continue;
    plainValues[d.key] = v;
    fields.push({ key: d.key, value: v, isSecret: d.secret, changed: true });
  }

  if (fields.length === 0) {
    console.log('[migrate-tts] 未检测到 DOUBAO_SPEECH_* 配置，跳过迁移。');
    process.exit(0);
  }

  const provider: ProviderConfigInput = {
    provider: 'doubao',
    enabled: true,
    isDefault: true,
    fields
  };
  await applyModuleConfig('voice', [provider]);
  console.log(`[migrate-tts] 已加密写入统一设置（voice/doubao），共 ${fields.length} 个字段。`);

  const bridge = writeVoiceServiceBridgeFromPlaintext(plainValues);
  console.log(`[migrate-tts] 已写出桥接文件：${bridge.path}`);
  console.log(`[migrate-tts] 桥接键：${bridge.keys.join(', ')}`);

  // 迁移成功：从 .env.local 删除已迁移的明文密钥（保留主密钥 / VOLCENGINE_* 等）。
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const migrated = new Set(DOUBAO_KEYS.map((d) => d.key));
    const kept = lines.filter((l) => {
      const t = l.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) return true;
      const k = t.split('=')[0].trim();
      return !migrated.has(k);
    });
    fs.writeFileSync(envPath, kept.join('\n'));
    console.log(
      '[migrate-tts] 已从 .env.local 删除已迁移的 DOUBAO_SPEECH_* 明文密钥（保留 SETTINGS_MASTER_KEY / VOLCENGINE_*）。'
    );
  }

  console.log('[migrate-tts] 完成。Voice Service 下一次启动将通过桥接文件读取 TTS 配置。');
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate-tts] 迁移失败：', err);
  process.exit(1);
});
