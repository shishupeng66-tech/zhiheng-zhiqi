'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { SUPPORTED_LANGUAGES, type MyCloneEntry, type CloneLanguageKey } from '../types';

interface MyVoicesProps {
  entries: MyCloneEntry[];
  onReload: () => void;
  loading?: boolean;
}

/**
 * 「我的声音资产」列表
 *
 * 数据源：父组件的本地 in-memory state（即时乐观更新）+ 点击「刷新」重新拉取。
 * 后端 GET 路由在 Phase 3-B 不实现，列表默认纯前端 mock。
 */
export function MyVoices({ entries, onReload, loading }: MyVoicesProps) {
  return (
    <section className='space-y-3'>
      <div className='flex items-end justify-between'>
        <div>
          <h2 className='text-base font-semibold'>我的声音</h2>
          <p className='text-muted-foreground text-xs'>
            你创建的克隆音色会出现在这里。点击 ▶ 可试听训练完成的示例。
          </p>
        </div>
        <Button variant='ghost' size='sm' onClick={onReload} disabled={loading}>
          <Icons.spinner className={cn('size-4', loading && 'animate-spin')} />
          刷新
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className='divide-y rounded-xl border bg-card'>
          {entries.map((entry) => (
            <li key={entry.id} className='flex items-center gap-4 px-4 py-3'>
              <div className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg'>
                <Icons.sparkles className='size-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium'>{entry.displayName}</p>
                <p className='text-muted-foreground text-xs'>
                  {labelOf(entry.language)} · 创建于{' '}
                  {new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </p>
                {entry.errorMessage && (
                  <p className='text-destructive mt-1 truncate text-xs'>{entry.errorMessage}</p>
                )}
              </div>
              <StatusBadge status={entry.status} />
              {entry.status === 'ready' && entry.demoAudioUrl && (
                <audio
                  src={entry.demoAudioUrl}
                  controls
                  className='h-8 max-w-44'
                  preload='metadata'
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className='rounded-xl border bg-muted/20 px-6 py-10 text-center'>
      <div className='bg-background mx-auto flex size-10 items-center justify-center rounded-full border'>
        <Icons.sparkles className='text-muted-foreground size-5' />
      </div>
      <p className='mt-3 text-sm font-medium'>还没有创建过声音</p>
      <p className='text-muted-foreground mx-auto mt-1 max-w-sm text-xs'>
        完成上面的上传 / 录音 / 文本填写后，点击「创建声音」即可训练你的第一个克隆音色。
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: MyCloneEntry['status'] }) {
  if (status === 'ready') {
    return (
      <Badge className='bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'>训练完成</Badge>
    );
  }
  if (status === 'failed') {
    return <Badge variant='destructive'>失败</Badge>;
  }
  if (status === 'training' || status === 'pending') {
    return (
      <Badge variant='secondary' className='gap-1'>
        <Icons.spinner className='size-3 animate-spin' />
        训练中
      </Badge>
    );
  }
  return <Badge variant='outline'>未知</Badge>;
}

function labelOf(key: CloneLanguageKey) {
  return SUPPORTED_LANGUAGES.find((l) => l.key === key)?.label ?? key;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
