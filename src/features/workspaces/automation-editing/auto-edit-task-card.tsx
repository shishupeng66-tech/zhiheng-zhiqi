'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, Check, Film, Loader2, RotateCw } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AUTO_EDIT_STAGES,
  friendlyFailureReason,
  mapAutoEditStatus,
  type AutoEditStageKey
} from './task-status';
import { computeAutoEditStage, subscribeAutoEditProgress } from './task-progress';

export type AutoEditTaskCardProps = {
  workspaceSlug: string;
  taskId: string;
  title: string;
  /** 任务创建时间（epoch 毫秒），用于确定性推导当前阶段，刷新可还原。 */
  createdAt: number;
  /** 验收用：是否演示失败分支。真实接入后由后端决定，前端默认不传。 */
  forceFail?: boolean;
  ratioLabel?: string;
  durationLabel?: string;
  assetCount?: number;
  /** 本地剪映草稿路径，仅作为详情信息展示，不做文件管理。 */
  draftPath?: string;
};

export function AutoEditTaskCard({
  workspaceSlug,
  taskId,
  title,
  createdAt,
  forceFail = false,
  ratioLabel,
  durationLabel,
  assetCount,
  draftPath
}: AutoEditTaskCardProps) {
  const [startedAt, setStartedAt] = React.useState(createdAt);
  const [attemptForceFail, setAttemptForceFail] = React.useState(forceFail);
  const [stageKey, setStageKey] = React.useState<AutoEditStageKey>(
    computeAutoEditStage(startedAt, attemptForceFail).stageKey as AutoEditStageKey
  );
  const [terminal, setTerminal] = React.useState<AutoEditStageKey | null>(
    computeAutoEditStage(startedAt, attemptForceFail).terminal ?? null
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stop = subscribeAutoEditProgress({
      workspaceSlug,
      taskId,
      createdAt: startedAt,
      forceFail: attemptForceFail,
      onStage: (key) => {
        setStageKey(key as AutoEditStageKey);
        setTerminal(null);
      },
      onTerminal: (result, message) => {
        setTerminal(result);
        if (message) setErrorMessage(message);
      }
    });
    return stop;
  }, [workspaceSlug, taskId, startedAt, attemptForceFail]);

  async function handleRetry() {
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/automation/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
    } catch {
      // 即便请求失败也重新走一次本地进度，保证 UI 不卡死。
    }
    setErrorMessage(null);
    setTerminal(null);
    setAttemptForceFail(false);
    setStartedAt(Date.now());
  }

  const view = mapAutoEditStatus(terminal ?? stageKey);
  const currentIdx = AUTO_EDIT_STAGES.findIndex((stage) => stage.key === stageKey);
  const isFailed = terminal === 'failed';
  const isSuccessLike = terminal === 'completed' || terminal === 'ready_for_jianying';

  return (
    <Card size='sm' className='w-full max-w-[520px] border-border bg-card text-card-foreground'>
      <CardHeader className='flex-row items-center gap-2'>
        <span className='flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary'>
          <Film className='size-4' />
        </span>
        <CardTitle className='truncate'>{title}</CardTitle>
        <span className='ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'>
          自动剪辑任务
        </span>
      </CardHeader>

      <CardContent className='space-y-3'>
        {!terminal ? (
          <>
            <div className='flex items-center gap-2 text-sm font-medium'>
              {view.tone === 'active' ? (
                <Loader2 className='size-4 animate-spin text-primary' />
              ) : (
                <span className='size-2 rounded-full bg-muted-foreground/50' />
              )}
              <span>{view.label}</span>
            </div>

            <ol className='space-y-1.5'>
              {AUTO_EDIT_STAGES.map((stage, index) => {
                const done = isSuccessLike || (isFailed ? index < currentIdx : index < currentIdx);
                const active = !terminal && index === currentIdx;
                const failing = isFailed && index === currentIdx;
                return (
                  <li key={stage.key} className='flex items-center gap-2 text-xs'>
                    <span
                      className={cn(
                        'flex size-4 items-center justify-center rounded-full border',
                        done && 'border-primary bg-primary text-primary-foreground',
                        active && 'border-primary text-primary',
                        failing && 'border-destructive text-destructive',
                        !done &&
                          !active &&
                          !failing &&
                          'border-muted-foreground/30 text-muted-foreground/40'
                      )}
                    >
                      {done ? (
                        <Check className='size-2.5' />
                      ) : failing ? (
                        <AlertCircle className='size-3' />
                      ) : active ? (
                        <Loader2 className='size-2.5 animate-spin' />
                      ) : (
                        <span className='size-1 rounded-full bg-current' />
                      )}
                    </span>
                    <span
                      className={cn(
                        active && 'font-medium text-foreground',
                        failing && 'font-medium text-destructive',
                        !done && !active && !failing && 'text-muted-foreground/60'
                      )}
                    >
                      {stage.label}
                    </span>
                  </li>
                );
              })}
            </ol>

            <Progress value={view.progressPercent} />
          </>
        ) : isSuccessLike ? (
          <div className='space-y-3'>
            <div className='flex items-center gap-2 text-sm font-medium text-emerald-500'>
              <Check className='size-4' />
              <span>{view.label}</span>
            </div>
            <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs'>
              <dt className='text-muted-foreground'>草稿名称</dt>
              <dd className='truncate font-medium'>{title}</dd>
              {ratioLabel ? (
                <>
                  <dt className='text-muted-foreground'>画幅</dt>
                  <dd className='font-medium'>{ratioLabel}</dd>
                </>
              ) : null}
              {durationLabel ? (
                <>
                  <dt className='text-muted-foreground'>预计时长</dt>
                  <dd className='font-medium'>{durationLabel}</dd>
                </>
              ) : null}
              <dt className='text-muted-foreground'>素材</dt>
              <dd className='font-medium'>
                {typeof assetCount === 'number' && assetCount > 0
                  ? `已采用 ${assetCount} 个企业素材`
                  : '后台自动匹配企业素材库'}
              </dd>
            </dl>
            {draftPath ? (
              <p className='break-all rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground'>
                草稿已保存到本地：{draftPath}
              </p>
            ) : null}
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='flex items-center gap-2 text-sm font-medium text-destructive'>
              <AlertCircle className='size-4' />
              <span>生成失败</span>
            </div>
            <p className='text-xs text-muted-foreground'>{friendlyFailureReason(errorMessage)}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className='gap-2'>
        {isFailed ? (
          <button
            type='button'
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-1.5')}
            onClick={() => void handleRetry()}
          >
            <RotateCw className='size-3.5' />
            重试
          </button>
        ) : null}
        <Link
          href={`/dashboard/workspaces/${workspaceSlug}/review`}
          className={cn(
            buttonVariants({ variant: isFailed ? 'outline' : 'default', size: 'sm' }),
            'ml-auto'
          )}
        >
          前往任务审核
        </Link>
      </CardFooter>
    </Card>
  );
}
