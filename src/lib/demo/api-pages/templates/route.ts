import { NextResponse } from 'next/server';
import { listTemplates, getTemplate, loadTemplateRegistry } from '@/lib/templates';

/**
 * 模板库 API
 * GET /api/templates          — 列出全部模板
 * GET /api/templates?id=xxx   — 查询单个模板
 * GET /api/templates?status=approved — 按状态过滤
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');

  try {
    if (id) {
      const t = await getTemplate(id);
      if (!t) {
        return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, template: t });
    }

    const { rootPath, registryPath, templates, registryExists, registryValid, error } =
      await loadTemplateRegistry();
    let filtered = templates;
    if (status && ['draft', 'testing', 'approved', 'disabled'].includes(status)) {
      filtered = templates.filter((t) => t.status === status);
    }

    return NextResponse.json({
      ok: registryValid,
      rootPath,
      registryPath,
      registryExists,
      registryValid,
      error,
      total: filtered.length,
      templates: filtered
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
