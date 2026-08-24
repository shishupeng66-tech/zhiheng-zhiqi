import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDefaultProviderConfig, listAllSettings } from '@/lib/settings/store';
import { getVideoEngineStatus } from '@/lib/settings/video-engine';
import {
  testLlmConnection,
  testMaterialConnection,
  testVoiceConnection,
  testVideoEngineConnection
} from '@/lib/settings/test';
import type { LlmProviderConfig } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/system/settings
 * 返回全部 4 个模块的设置（secret 已脱敏）+ 视频引擎运行时状态。
 * 仅超级管理员可访问，否则 403。GET 绝不返回 secret 明文。
 */
export async function GET(_request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const modules = await listAllSettings();
  const videoEngine = await getVideoEngineStatus();
  return NextResponse.json({ modules, videoEngine });
}

/**
 * POST /api/system/settings
 * 统一连接测试入口：{ action: 'test', module, provider?, config? }
 * 返回结构仅含 ok / message / latencyMs，绝不返回任何 secret。
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

  if (body.action !== 'test') {
    return NextResponse.json({ error: 'unsupported_action' }, { status: 400 });
  }

  const module = String(body.module ?? '');
  try {
    if (module === 'llm') {
      const cfg = (body.config as Partial<LlmProviderConfig>) ?? {};
      let baseUrl = String(cfg.baseUrl ?? '');
      let apiKey = String(cfg.apiKey ?? '');
      let model = String(cfg.model ?? '');
      let provider = String(cfg.provider ?? 'openai-compatible');
      // secret 未提供时，回退到库中已保存的默认 LLM 配置（避免要求用户重新输入密钥）
      if (!apiKey || !baseUrl || !model) {
        const def = await getDefaultProviderConfig('llm');
        if (def) {
          apiKey = apiKey || def.config['api_key'] || '';
          baseUrl = baseUrl || def.config['base_url'] || '';
          model = model || def.config['model'] || '';
          provider = provider || def.provider;
        }
      }
      const result = await testLlmConnection({
        provider,
        baseUrl,
        apiKey,
        model,
        enabled: Boolean(cfg.enabled),
        isDefault: Boolean(cfg.isDefault)
      });
      return NextResponse.json(result);
    }
    if (module === 'voice') {
      const result = await testVoiceConnection();
      return NextResponse.json(result);
    }
    if (module === 'material') {
      let apiKey = String(body.apiKey ?? '');
      const provider = String(body.provider ?? '');
      if (!apiKey) {
        const def = await getDefaultProviderConfig('material');
        if (def) apiKey = def.config['api_key'] || '';
      }
      const result = await testMaterialConnection(provider, apiKey);
      return NextResponse.json(result);
    }
    if (module === 'video_engine') {
      const result = await testVideoEngineConnection();
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'unknown_module' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : '测试失败', latencyMs: 0 },
      { status: 200 }
    );
  }
}
