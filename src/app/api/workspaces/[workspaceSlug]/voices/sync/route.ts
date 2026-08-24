import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspacePermission } from '@/lib/workspaces/service';
import { upsertVoices, countVoices, countEnabledVoices } from '@/lib/voice-catalog';
import { speechVoiceCatalog } from '@/lib/voice-service/speech-voice-catalog';
import { voiceCatalogSource } from '@/lib/voice-catalog-source';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<Record<string, string>> };

/** 9 个推荐音色（产品侧 id 对应的 provider voice_type），首次同步默认启用。 */
const RECOMMENDED_VOICE_TYPES = speechVoiceCatalog.map((voice) => voice.providerVoiceId);

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
            : '权限不足，仅超级管理员或工作空间所有者可同步音色目录。'
      },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  // 从独立数据源（VoiceCatalogSource）拉取整份音色清单。
  let source;
  try {
    source = await voiceCatalogSource.fetchAll();
  } catch (error) {
    console.error('[voices:sync] 无法拉取音色目录', error);
    return NextResponse.json(
      {
        error: 'voice_service_unavailable',
        message: '无法连接语音服务，请确认本地 Voice Service 已启动。'
      },
      { status: 502 }
    );
  }

  // upsertVoices 会保留管理员已设置的 enabledForProduction，仅更新元信息。
  const { inserted, updated } = upsertVoices(source.rows, RECOMMENDED_VOICE_TYPES);

  return NextResponse.json({
    total: source.sourceTotal,
    fetched: source.fetched,
    deduped: source.deduped,
    inserted,
    updated,
    enabledByDefault: RECOMMENDED_VOICE_TYPES.length,
    catalogTotal: countVoices(),
    enabledCount: countEnabledVoices()
  });
}
