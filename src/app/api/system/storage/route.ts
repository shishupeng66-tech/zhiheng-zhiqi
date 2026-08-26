import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listStorageOverview, saveConfig, resetConfig, probeDir } from '@/lib/storage';
import { STORAGE_KEYS, type StorageKey } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isKey(k: string): k is StorageKey {
  return (STORAGE_KEYS as readonly string[]).includes(k);
}

/**
 * GET /api/system/storage
 * 返回全部业务目录（含 root）配置与真实检测状态。仅超级管理员，否则 403。
 */
export async function GET(_request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const entries = await listStorageOverview();
    return NextResponse.json({
      storageType: 'local',
      root: entries[0],
      entries
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'storage_read_failed', message: e instanceof Error ? e.message : '读取失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/system/storage
 * body: { action: 'save', key, path }  —— 保存/覆盖某目录（自动建目录 + 检测）
 *       { action: 'reset', key }        —— 重置某业务目录为继承根目录（root 不可重置）
 *       { action: 'check', path }       —— 仅检测（不保存、不创建）
 * 仅超级管理员，否则 403。
 */
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const key = String(body.key ?? '');

  try {
    if (action === 'check') {
      const p = String(body.path ?? '').trim();
      return NextResponse.json({ path: p, probe: probeDir(p) });
    }

    if (!isKey(key)) {
      return NextResponse.json({ error: 'unknown_key' }, { status: 400 });
    }

    if (action === 'save') {
      const rawPath = String(body.path ?? '');
      const result = await saveConfig(key, rawPath);
      return NextResponse.json({ key, ...result });
    }
    if (action === 'reset') {
      if (key === 'root') {
        return NextResponse.json({ error: 'root_not_resettable' }, { status: 400 });
      }
      await resetConfig(key);
      return NextResponse.json({ key, ok: true });
    }
    return NextResponse.json({ error: 'unsupported_action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: 'storage_write_failed', message: e instanceof Error ? e.message : '保存失败' },
      { status: 500 }
    );
  }
}
