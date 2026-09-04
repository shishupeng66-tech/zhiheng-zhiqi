'use client';

import * as React from 'react';
import { ChevronDown, Film, Loader2 } from 'lucide-react';

export type MaterialPreviewSegment = {
  order: number;
  fileName: string;
  scriptText: string;
  sourceStart: number | null;
  sourceEnd: number | null;
  durationSec: number;
  matchLevel: string;
  matchScore: number;
};

export type MaterialPreviewCardProps = {
  total: number;
  segments: MaterialPreviewSegment[];
  isGenerating?: boolean;
};

function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

function matchLabel(level: string, score: number): string {
  const lv = (level ?? '').toLowerCase();
  if (lv.includes('high')) return '高匹配';
  if (lv.includes('medium') || lv.includes('mid')) return '中匹配';
  if (lv.includes('low')) return '低匹配';
  if (score >= 0.7) return '高匹配';
  if (score >= 0.4) return '中匹配';
  return '待复核';
}

function matchTone(level: string, score: number): string {
  const lv = (level ?? '').toLowerCase();
  if (lv.includes('high') || score >= 0.7)
    return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (lv.includes('medium') || lv.includes('mid') || score >= 0.4)
    return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
}

/**
 * 自动剪辑 —— 已匹配素材卡片。
 *
 * 展示「已匹配素材：X 段」与可展开明细（素材名称 / 对应脚本句子 / 使用片段 / 匹配程度）。
 * 只展示用户可读信息，不暴露内部 assetId / 绝对路径 / JSON。
 */
export function MaterialPreviewCard({
  total,
  segments,
  isGenerating = false
}: MaterialPreviewCardProps) {
  const [open, setOpen] = React.useState(true);

  if (isGenerating) {
    return (
      <div className='flex w-full max-w-2xl items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground'>
        <Loader2 className='size-4 animate-spin' />
        正在匹配企业素材…
      </div>
    );
  }

  return (
    <div className='w-full max-w-2xl rounded-xl border bg-background text-foreground shadow-sm'>
      <button
        type='button'
        className='flex w-full items-center justify-between gap-2 px-4 py-3 text-left'
        onClick={() => setOpen((v) => !v)}
      >
        <span className='flex items-center gap-2 text-sm font-semibold'>
          <Film className='size-4' />
          已匹配素材：{total} 段
        </span>
        <ChevronDown
          className={
            open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'
          }
        />
      </button>

      {open ? (
        <div className='max-h-72 overflow-y-auto border-t px-4 py-2'>
          {segments.length === 0 ? (
            <div className='py-3 text-sm text-muted-foreground'>
              没有匹配到可用素材，可重新生成脚本或更换风格后重试。
            </div>
          ) : (
            <ol className='space-y-3 py-2'>
              {segments.map((seg) => (
                <li key={seg.order} className='flex gap-3'>
                  <div className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground'>
                    {seg.order}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center justify-between gap-1'>
                      <span className='truncate text-sm font-medium'>{seg.fileName}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${matchTone(
                          seg.matchLevel,
                          seg.matchScore
                        )}`}
                      >
                        {matchLabel(seg.matchLevel, seg.matchScore)}
                      </span>
                    </div>
                    {seg.scriptText ? (
                      <div className='mt-0.5 line-clamp-2 text-xs text-muted-foreground'>
                        对应脚本：{seg.scriptText}
                      </div>
                    ) : null}
                    <div className='mt-0.5 text-xs text-muted-foreground'>
                      使用片段：{fmtTime(seg.sourceStart)}–{fmtTime(seg.sourceEnd)}（约{' '}
                      {seg.durationSec}s）
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
