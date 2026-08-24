import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { applyModuleConfig, listModuleSettings } from '@/lib/settings/store';
import { syncVoiceServiceBridge } from '@/lib/settings/tts-bridge';
import { settingModules, type SettingModule } from '@/lib/db/schema';
import type { ProviderConfigInput } from '@/lib/settings/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ module: string }> };

function isModule(m: string): m is SettingModule {
  return (settingModules as readonly string[]).includes(m);
}

/**
 * GET /api/system/settings/[module]
 * 返回某模块设置（secret 脱敏）。仅超级管理员，否则 403。
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { module } = await params;
  if (!isModule(module)) {
    return NextResponse.json({ error: 'unknown_module' }, { status: 400 });
  }
  const data = await listModuleSettings(module);
  return NextResponse.json(data);
}

/**
 * PUT /api/system/settings/[module]
 * 保存某模块整体配置（写入即加密 secret）。仅超级管理员，否则 403。
 * voice 模块保存后自动同步桥接文件到 Voice Service。
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { module } = await params;
  if (!isModule(module)) {
    return NextResponse.json({ error: 'unknown_module' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: 'invalid_body', message: '期望 provider 数组' },
      { status: 400 }
    );
  }

  const providers = body as ProviderConfigInput[];
  for (const p of providers) {
    if (typeof p.provider !== 'string' || !Array.isArray(p.fields)) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'provider 需包含字符串 provider 与 fields 数组' },
        { status: 400 }
      );
    }
  }

  try {
    await applyModuleConfig(module, providers);
    if (module === 'voice') {
      syncVoiceServiceBridge();
    }
    const data = await listModuleSettings(module);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: 'internal', message: e instanceof Error ? e.message : '保存失败' },
      { status: 500 }
    );
  }
}
