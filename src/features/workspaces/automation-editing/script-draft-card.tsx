'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** 按 1.3x 语速估算中文口播时长：≈7.8 字/秒 */
const CHARS_PER_SECOND_AT_1_3X = 7.8;

export type ScriptDraftCardProps = {
  styleName: string;
  keywords: string[];
  initialScript: string;
  charCount: number;
  estimatedDurationSec: number;
  isGenerating?: boolean;
  onRegenerate?: () => void;
  onConfirm?: (script: string) => void;
};

/**
 * 自动剪辑 —— 视频脚本草案卡片。
 *
 * 主视觉区展示【完整脚本文案】（可编辑），风格只作为小标签出现。
 * 提供：重新生成 / 确认使用。
 */
export function ScriptDraftCard({
  styleName,
  keywords,
  initialScript,
  charCount: initialCharCount,
  estimatedDurationSec: initialDurationSec,
  isGenerating = false,
  onRegenerate,
  onConfirm
}: ScriptDraftCardProps) {
  const [text, setText] = React.useState(initialScript);

  const charCount = text.length;
  const durationSec = Math.max(8, Math.round(charCount / CHARS_PER_SECOND_AT_1_3X));
  const changed = text !== initialScript;

  return (
    <div className='w-full max-w-2xl rounded-xl border bg-background p-4 text-foreground shadow-sm'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-semibold'>【视频脚本草案】</span>
          <span className='rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'>
            脚本风格：{styleName}
          </span>
        </div>
        <span className='text-xs text-muted-foreground'>
          {charCount} 字 · 预计约 {durationSec} 秒
          {changed ? `（已编辑，${initialCharCount} 字 → ${charCount} 字）` : ''}
        </span>
      </div>

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={7}
        disabled={isGenerating}
        className='min-h-[140px] w-full whitespace-pre-wrap border bg-background text-sm leading-6'
        placeholder='脚本文案将显示在这里，可直接修改…'
      />

      {keywords.length > 0 ? (
        <div className='mt-2 text-xs text-muted-foreground'>关键词：{keywords.join('、')}</div>
      ) : null}

      <div className='mt-3 flex flex-wrap items-center justify-end gap-2'>
        {onRegenerate ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={isGenerating}
            onClick={onRegenerate}
          >
            {isGenerating ? '正在重新生成…' : '重新生成'}
          </Button>
        ) : null}
        {onConfirm ? (
          <Button
            type='button'
            size='sm'
            disabled={isGenerating || text.trim().length === 0}
            onClick={() => onConfirm(text.trim())}
          >
            确认使用
          </Button>
        ) : null}
      </div>
    </div>
  );
}
