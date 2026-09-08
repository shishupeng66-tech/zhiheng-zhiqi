'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { TEMPLATE_STATUS_LABEL, TEMPLATE_STATUS_VARIANT } from '@/lib/templates/types';

interface EnterpriseTemplate {
  templateId: string;
  /** 模板库目录里的文件夹名（用户改名后即跟随） */
  displayName: string;
  /** asset 内登记的中文名（如自动命名产物），作为副标题展示 */
  templateName: string;
  status: string;
  canvas: string;
  durationSec: number;
  textSlotCount: number;
  mediaSlotCount: number;
  assetPath: string;
}

interface EnterpriseTemplatesResponse {
  ok: boolean;
  total?: number;
  templates?: EnterpriseTemplate[];
  error?: string;
}

function durationLabel(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

/**
 * 剪映模板库页面（原「风格库」改造）
 *
 * 数据源：用户数据存储配置的「模板库」根目录（企业模板资产 template-asset.json）。
 * 风格知识（内容类型/镜头策略/节奏策略等）归属 styleKnowledgeRoot + Editing Skill，
 * 由 Agent 调用，不在此页面展示。
 */
export function AutomationEditingTemplateLibraryPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? 'enterprise-media';

  const [templates, setTemplates] = useState<EnterpriseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EnterpriseTemplate | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/templates/enterprise?workspace=${encodeURIComponent(workspaceSlug)}`,
          { cache: 'no-store' }
        );
        const data = (await res.json()) as EnterpriseTemplatesResponse;
        if (cancelled) return;
        if (data.ok) {
          setTemplates(data.templates || []);
        } else {
          setError(data.error || '加载失败');
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  const approvedCount = templates.filter((t) => t.status === 'approved').length;
  const testingCount = templates.filter((t) => t.status === 'testing').length;

  return (
    <div className='space-y-5'>
      {/* 页头 */}
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold tracking-tight'>剪映模板库</h2>
        <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
          管理已经制作、测试和验收的剪映模板。Agent
          在有高匹配模板时优先复用模板，没有合适模板时继续使用自主剪辑流程。
        </p>
      </div>

      {/* 统计条 */}
      {!loading && !error && templates.length > 0 && (
        <div className='flex flex-wrap items-center gap-3 text-sm'>
          <Badge variant='outline'>共 {templates.length} 个模板</Badge>
          <Badge variant='default'>已验收 {approvedCount}</Badge>
          <Badge variant='secondary'>测试中 {testingCount}</Badge>
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Icons.spinner className='h-4 w-4 animate-spin' />
          加载模板库…
        </div>
      )}

      {/* 错误 */}
      {error && (
        <Card className='border-red-500/30'>
          <CardContent className='pt-5 text-sm text-red-400'>
            模板库加载失败：{error}
            <p className='mt-1 text-xs text-muted-foreground'>
              请到 系统管理 → 数据存储 确认「模板库」路径已正确配置。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 空状态 */}
      {!loading && !error && templates.length === 0 && (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 py-12 text-center'>
            <Icons.page className='h-10 w-10 text-muted-foreground/50' />
            <div className='space-y-1'>
              <p className='font-medium'>还没有可用的剪映模板</p>
              <p className='max-w-md text-sm text-muted-foreground'>
                将经过测试和验收的剪映草稿加入模板库后，可供 Agent 在自动剪辑时调用。
              </p>
              <p className='text-xs text-muted-foreground'>
                让知衡助手「把 XX 剪映草稿解析成模板」即可自动蒸馏入库。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 模板卡片网格 */}
      {!loading && !error && templates.length > 0 && (
        <div className='grid gap-4 xl:grid-cols-2'>
          {templates.map((t) => (
            <Card
              key={t.templateId}
              className='cursor-pointer transition-colors hover:border-primary/50'
              onClick={() => setSelected(t)}
            >
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0 flex-1'>
                    <CardTitle className='text-base break-all'>{t.displayName}</CardTitle>
                    <CardDescription className='mt-1.5 line-clamp-2 leading-5'>
                      {t.templateName && t.templateName !== t.displayName
                        ? `${t.templateName} · ${t.templateId}`
                        : t.templateId}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      TEMPLATE_STATUS_VARIANT[t.status as keyof typeof TEMPLATE_STATUS_VARIANT] ??
                      'outline'
                    }
                    className='shrink-0'
                  >
                    {TEMPLATE_STATUS_LABEL[t.status as keyof typeof TEMPLATE_STATUS_LABEL] ??
                      t.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-2 gap-2 text-xs sm:grid-cols-4'>
                  <InfoCell label='画幅' value={t.canvas || '—'} />
                  <InfoCell label='时长' value={durationLabel(t.durationSec)} />
                  <InfoCell
                    label='素材槽'
                    value={t.mediaSlotCount != null ? `${t.mediaSlotCount}` : '—'}
                  />
                  <InfoCell
                    label='文字槽'
                    value={t.textSlotCount != null ? `${t.textSlotCount}` : '—'}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 风格知识说明 */}
      <div className='rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground'>
        <p className='font-medium text-foreground/80'>风格知识归属说明</p>
        <p className='mt-1'>
          内容类型、脚本结构、镜头策略、节奏规则、包装策略等风格知识由 Agent 从
          <code className='mx-1 rounded bg-muted px-1 py-0.5 font-mono'>styleKnowledgeRoot</code>和
          <code className='mx-1 rounded bg-muted px-1 py-0.5 font-mono'>editingSkillRoot</code>
          读取，不在模板库页面展示。模板库仅管理可程序化复用的剪映草稿模板。
        </p>
      </div>

      {/* 模板详情抽屉 */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
          {selected && (
            <div className='space-y-5'>
              <SheetHeader>
                <div className='flex items-start justify-between gap-3'>
                  <SheetTitle className='text-lg break-all'>{selected.displayName}</SheetTitle>
                  <Badge
                    variant={
                      TEMPLATE_STATUS_VARIANT[
                        selected.status as keyof typeof TEMPLATE_STATUS_VARIANT
                      ] ?? 'outline'
                    }
                  >
                    {TEMPLATE_STATUS_LABEL[selected.status as keyof typeof TEMPLATE_STATUS_LABEL] ??
                      selected.status}
                  </Badge>
                </div>
                <SheetDescription className='mt-2 leading-6'>
                  {selected.templateName && selected.templateName !== selected.displayName
                    ? `${selected.templateName} · 由剪映人工母版蒸馏的企业模板资产。`
                    : '由剪映人工母版蒸馏的企业模板资产。'}
                </SheetDescription>
              </SheetHeader>

              <div className='space-y-3 text-sm'>
                <DetailRow label='模板 ID' value={selected.templateId} mono />
                <DetailRow label='模板名称' value={selected.templateName || '—'} />
                <DetailRow label='画幅' value={selected.canvas || '—'} />
                <DetailRow label='原生时长' value={durationLabel(selected.durationSec)} />
                <DetailRow label='素材槽' value={`${selected.mediaSlotCount}`} />
                <DetailRow label='文字槽' value={`${selected.textSlotCount}`} />
                <DetailRow label='资产路径' value={selected.assetPath} mono />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md bg-muted/30 p-2'>
      <div className='text-[10px] uppercase tracking-wide text-muted-foreground'>{label}</div>
      <div className='mt-0.5 font-medium'>{value}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className='flex items-start justify-between gap-4 border-b pb-2'>
      <span className='shrink-0 text-xs text-muted-foreground'>{label}</span>
      <span className={`text-right text-xs ${mono ? 'break-all font-mono' : ''}`}>{value}</span>
    </div>
  );
}
