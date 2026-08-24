import fs from 'node:fs';
import path from 'node:path';
import { getDefaultProviderConfig } from './store';

/**
 * 语音服务桥接（安全桥）。
 *
 * Python Voice Service 通过 load_project_env() 读取文本 env 文件，无法直接消费
 * 加密后的 SQLite 设置库。因此统一设置中心作为 voice 模块的唯一配置源，在保存后
 * 把需要的字段投影成一个 gitignored 的 .env 文件（data/.voice-service-env），
 * 由 Voice Service 优先加载（见 services/voice-service/app/main.py）。
 *
 * 该文件位于 data/ 下（已被 .gitignore 忽略），且权限 0600，不会进入 Git。
 */
const VOICE_BRIDGE_KEYS = [
  'DOUBAO_SPEECH_API_KEY',
  'DOUBAO_SPEECH_RESOURCE_ID',
  'DOUBAO_SPEECH_WS_ENDPOINT',
  'DOUBAO_SPEECH_DEFAULT_VOICE',
  'DOUBAO_SPEECH_APP_ID',
  'DOUBAO_SPEECH_APP_KEY',
  'DOUBAO_SPEECH_USER_ID'
];

function bridgePath(): string {
  const dbPath = process.env.DATABASE_PATH || process.env.SQLITE_DB_PATH || './data/zhiheng.db';
  const dir = path.dirname(path.resolve(dbPath));
  return path.join(dir, '.voice-service-env');
}

function writeBridge(values: Record<string, string | undefined>): {
  ok: boolean;
  path: string;
  keys: string[];
} {
  const lines: string[] = [];
  const keys: string[] = [];
  for (const k of VOICE_BRIDGE_KEYS) {
    const v = values[k];
    if (v == null || v === '') continue;
    lines.push(`${k}=${v}`);
    keys.push(k);
  }
  const outPath = bridgePath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + (lines.length ? '\n' : ''), { mode: 0o600 });
  return { ok: true, path: outPath, keys };
}

/** 保存 voice 模块配置后调用：依据 DB 中的明文配置写出桥接文件。 */
export async function syncVoiceServiceBridge(): Promise<{
  ok: boolean;
  path: string;
  keys: string[];
}> {
  const resolved = await getDefaultProviderConfig('voice');
  const config = resolved?.config ?? {};
  return writeBridge(config);
}

/** 迁移脚本调用：根据已知明文值直接写出桥接文件（尚未经过 DB 解密路径）。 */
export function writeVoiceServiceBridgeFromPlaintext(values: Record<string, string>): {
  ok: boolean;
  path: string;
  keys: string[];
} {
  return writeBridge(values);
}
