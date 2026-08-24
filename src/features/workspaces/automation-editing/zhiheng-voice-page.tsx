'use client';

import * as React from 'react';
import type { VoiceCatalogRow } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { speechVoiceCatalog } from '@/lib/voice-service/speech-voice-catalog';
import { toast } from 'sonner';

const RECOMMENDED = new Set(speechVoiceCatalog.map((voice) => voice.providerVoiceId));

type FilterKey = 'all' | 'male' | 'female' | 'enabled';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'male', label: '男声' },
  { key: 'female', label: '女声' },
  { key: 'enabled', label: '已启用业务音色' }
];

export function ZhihengVoicePage({
  workspaceSlug,
  canManage
}: {
  workspaceSlug: string;
  canManage: boolean;
}) {
  const [voices, setVoices] = React.useState<VoiceCatalogRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [enabledCount, setEnabledCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<FilterKey>('all');
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState<string | null>(null);
  const [audioSrc, setAudioSrc] = React.useState('');
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const loadVoices = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/voices`);
      if (!res.ok) return;
      const payload = (await res.json()) as {
        voices?: VoiceCatalogRow[];
        total?: number;
        enabledCount?: number;
      };
      setVoices(payload.voices ?? []);
      setTotal(payload.total ?? 0);
      setEnabledCount(payload.enabledCount ?? 0);
    } catch {
      // 接口异常时保持空列表，由空状态提示处理。
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  React.useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  React.useEffect(() => {
    return () => {
      if (audioSrc) URL.revokeObjectURL(audioSrc);
    };
  }, [audioSrc]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return voices.filter((voice) => {
      if (filter === 'male' && voice.gender !== '男') return false;
      if (filter === 'female' && voice.gender !== '女') return false;
      if (filter === 'enabled' && !voice.enabledForProduction) return false;
      if (q) {
        const hay = [
          voice.displayName,
          voice.voiceType,
          voice.scene,
          (voice.tags ?? []).join(' '),
          (voice.dialects ?? []).join(' ')
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [voices, filter, search]);

  async function preview(voiceType: string) {
    setPreviewing(voiceType);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/voices/${encodeURIComponent(voiceType)}/preview`
      );
      if (!res.ok) {
        toast.error('试听生成失败，请稍后重试。');
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (audioSrc) URL.revokeObjectURL(audioSrc);
      setAudioSrc(url);
      audioRef.current?.load();
      await audioRef.current?.play().catch(() => undefined);
    } catch {
      toast.error('试听生成失败，请稍后重试。');
    } finally {
      setPreviewing(null);
    }
  }

  async function toggle(voiceType: string, next: boolean) {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/voices/${encodeURIComponent(voiceType)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabledForProduction: next })
        }
      );
      const payload = (await res.json()) as { voice?: VoiceCatalogRow; message?: string };
      if (!res.ok) {
        toast.error(payload.message ?? '操作失败');
        return;
      }
      setVoices((prev) =>
        prev.map((voice) => (voice.voiceType === voiceType ? (payload.voice ?? voice) : voice))
      );
      toast.success(next ? '已加入业务可用音色' : '已移出业务可用音色');
    } catch {
      toast.error('操作失败，请稍后重试。');
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/voices/sync`, { method: 'POST' });
      const payload = (await res.json().catch(() => ({}))) as {
        total?: number;
        inserted?: number;
        updated?: number;
        enabledCount?: number;
        message?: string;
      };
      if (!res.ok) {
        toast.error(payload.message ?? '同步失败');
        return;
      }
      toast.success(`同步完成：新增 ${payload.inserted ?? 0}，更新 ${payload.updated ?? 0}`);
      setSyncResult(
        `完整目录 ${payload.total ?? 0} 条 · 新增 ${payload.inserted ?? 0} · 更新 ${
          payload.updated ?? 0
        } · 已启用业务音色 ${payload.enabledCount ?? 0}`
      );
      await loadVoices();
    } catch {
      toast.error('同步失败，请稍后重试。');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='space-y-1'>
          <h2 className='text-xl font-semibold tracking-tight'>知衡语音</h2>
          <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
            企业可用配音音色库。数据来自豆包语音合成大模型
            2.0（seed-tts-2.0）官方完整音色目录，本地缓存、实时试听；管理员可筛选「业务可用音色」，仅这些音色会出现在视频生产下拉框。
          </p>
        </div>
        <div className='flex flex-col items-end gap-2'>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <Badge variant='secondary'>共 {loading ? '…' : total} 个音色</Badge>
            <Badge variant='outline'>已启用 {loading ? '…' : enabledCount} 个</Badge>
          </div>
          {canManage ? (
            <Button onClick={sync} disabled={syncing}>
              {syncing ? (
                <Icons.spinner className='size-4 animate-spin' />
              ) : (
                <Icons.sparkles className='size-4' />
              )}
              {syncing ? '同步中...' : '同步完整音色库'}
            </Button>
          ) : null}
        </div>
      </div>

      {syncResult ? (
        <div className='rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary'>
          {syncResult}
        </div>
      ) : null}

      {audioSrc ? (
        <div className='rounded-md border bg-muted/30 p-2'>
          <audio ref={audioRef} src={audioSrc} className='h-9 w-full' controls />
        </div>
      ) : null}

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <div className='relative w-full sm:max-w-xs'>
          <Icons.search className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='搜索音色名称 / ID / 场景 / 标签'
            className='h-9 pl-8 text-sm'
          />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type='button'
              onClick={() => setFilter(item.key)}
              className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
                filter === item.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className='flex items-center justify-center rounded-md border border-dashed py-16 text-sm text-muted-foreground'>
          <Icons.spinner className='mr-2 size-4 animate-spin' />
          加载音色库中...
        </div>
      ) : voices.length === 0 ? (
        <div className='flex flex-col items-center gap-2 rounded-md border border-dashed py-16 text-center'>
          <Icons.music className='size-8 text-muted-foreground' />
          <div className='text-sm font-medium'>音色库为空</div>
          <p className='max-w-sm text-xs text-muted-foreground'>
            {canManage
              ? '点击右上角「同步完整音色库」从官方目录拉取全部 194 个真实音色。'
              : '尚未同步音色目录，请联系超级管理员或工作空间所有者进行同步。'}
          </p>
        </div>
      ) : (
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {filtered.map((voice) => {
            const recommended = RECOMMENDED.has(voice.voiceType);
            return (
              <Card key={voice.voiceType} className='flex flex-col'>
                <CardHeader className='p-3 pb-2'>
                  <div className='flex items-start gap-3'>
                    <div className='flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
                      <Icons.music className='size-5' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2'>
                        <CardTitle className='truncate text-sm'>{voice.displayName}</CardTitle>
                        {recommended ? (
                          <Badge variant='secondary' className='shrink-0 gap-1 text-[10px]'>
                            <Icons.badgeCheck className='size-3' />
                            推荐
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription className='truncate font-mono text-[11px]'>
                        {voice.voiceType}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='flex flex-1 flex-col gap-2.5 p-3 pt-0'>
                  <div className='flex flex-wrap gap-1.5'>
                    {voice.gender ? <Badge variant='outline'>{voice.gender}</Badge> : null}
                    {voice.language ? <Badge variant='outline'>{voice.language}</Badge> : null}
                    {voice.scene ? <Badge variant='outline'>{voice.scene}</Badge> : null}
                    {(voice.tags ?? []).slice(0, 3).map((tag) => (
                      <Badge key={tag} variant='secondary' className='text-[10px]'>
                        {tag}
                      </Badge>
                    ))}
                    <Badge
                      variant={voice.enabledForProduction ? 'default' : 'outline'}
                      className='ml-auto text-[10px]'
                    >
                      {voice.enabledForProduction ? '业务可用' : '未启用'}
                    </Badge>
                  </div>

                  <div className='mt-auto flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 flex-1 text-xs'
                      onClick={() => void preview(voice.voiceType)}
                      disabled={previewing !== null}
                    >
                      {previewing === voice.voiceType ? (
                        <Icons.spinner className='size-3.5 animate-spin' />
                      ) : (
                        <Icons.music className='size-3.5' />
                      )}
                      试听
                    </Button>
                    {canManage ? (
                      voice.enabledForProduction ? (
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-8 text-xs text-muted-foreground'
                          onClick={() => void toggle(voice.voiceType, false)}
                        >
                          <Icons.circleX className='size-3.5' />
                          移出业务音色
                        </Button>
                      ) : (
                        <Button
                          variant='outline'
                          size='sm'
                          className='h-8 text-xs'
                          onClick={() => void toggle(voice.voiceType, true)}
                        >
                          <Icons.plusCircle className='size-3.5' />
                          加入业务音色
                        </Button>
                      )
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
