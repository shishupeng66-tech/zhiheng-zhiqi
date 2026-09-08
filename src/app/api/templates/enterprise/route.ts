import { NextResponse } from 'next/server';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { listTemplateAssets } from '@/lib/templates/template-asset-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** 常见标准画幅（按宽高比匹配，容差 2%） */
const STANDARD_RATIOS: Array<{ key: string; w: number; h: number }> = [
  { key: '9:16', w: 9, h: 16 },
  { key: '16:9', w: 16, h: 9 },
  { key: '1:1', w: 1, h: 1 },
  { key: '3:4', w: 3, h: 4 },
  { key: '4:3', w: 4, h: 3 }
];

function canvasLabel(w: number, h: number): string {
  if (!w || !h) return '';
  const ratio = w / h;
  for (const s of STANDARD_RATIOS) {
    const target = s.w / s.h;
    if (Math.abs(ratio - target) / target < 0.02) return s.key;
  }
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

/**
 * 企业模板库 API（前端模板库页面 / 工作台模板选择的唯一数据源）
 * GET /api/templates/enterprise?workspace=<workspaceSlug>
 *
 * 数据来自用户数据存储配置的「模板库」根目录（resolveWorkspaceAsset(templateRoot)），
 * 即 <模板库>\企业模板\<templateId>\template-asset.json，由 template-parser 蒸馏产出。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('workspace') || 'enterprise-media';

  const ws = await getWorkspaceBySlug(slug);
  if (!ws) {
    return NextResponse.json({ ok: false, error: 'WORKSPACE_NOT_FOUND' }, { status: 404 });
  }

  const loaded = await listTemplateAssets(ws.id);
  const templates = loaded
    .filter((l) => l.ok && l.asset)
    .map((l) => {
      const a = l.asset!;
      const canvasRaw = a.templateInfo?.canvas as
        | string
        | { ratio?: string; width?: number; height?: number }
        | null
        | undefined;
      let canvas = '';
      if (typeof canvasRaw === 'string') {
        canvas = canvasRaw;
      } else if (canvasRaw?.ratio) {
        canvas = canvasRaw.ratio;
      } else if (canvasRaw?.width && canvasRaw?.height) {
        canvas = canvasLabel(canvasRaw.width, canvasRaw.height);
      }
      return {
        templateId: a.templateId,
        // 显示名 = 模板库目录里的文件夹名（用户在资源管理器改名后前端即跟随）
        displayName: a.templateId,
        templateName: a.templateName,
        status: a.status,
        canvas,
        durationSec: a.templateInfo?.durationSec ?? 0,
        textSlotCount: a.textSlots?.length ?? 0,
        mediaSlotCount: a.mediaSlots?.length ?? 0,
        assetPath: l.path
      };
    });

  return NextResponse.json({ ok: true, total: templates.length, templates });
}
