'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import type { AutomationVideoTaskStatus } from '@/lib/db/schema';
import type { AutomationVideoTaskRow } from '@/lib/workspaces/automation-editing';
import { toast } from 'sonner';

const statusLabels: Record<AutomationVideoTaskStatus, string> = {
  draft: '草稿',
  generating: '生成中',
  pending_review: '待审核',
  approved: '已通过',
  failed: '失败',
  deleted: '已删除'
};

const statusVariants: Record<
  AutomationVideoTaskStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'outline',
  generating: 'outline',
  pending_review: 'secondary',
  approved: 'default',
  failed: 'destructive',
  deleted: 'destructive'
};

function formatDate(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function AutomationEditingReviewPage({
  workspaceSlug,
  initialTasks
}: {
  workspaceSlug: string;
  initialTasks: AutomationVideoTaskRow[];
}) {
  const [tasks, setTasks] = React.useState(initialTasks);
  const [selectedTask, setSelectedTask] = React.useState<AutomationVideoTaskRow | null>(null);
  const [loadingId, setLoadingId] = React.useState('');

  async function reload() {
    const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/tasks`, {
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.tasks)) setTasks(data.tasks);
  }

  async function regenerate(taskId: string) {
    setLoadingId(taskId);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message ?? '重新生成失败');
        return;
      }
      toast.success('已重新提交生成任务');
      await reload();
    } finally {
      setLoadingId('');
    }
  }

  async function deleteTask(taskId: string) {
    setLoadingId(taskId);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/automation/tasks?taskId=${encodeURIComponent(taskId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message ?? '删除失败');
        return;
      }
      toast.success('任务已删除');
      setTasks((current) => current.filter((task) => task.id !== taskId));
      if (selectedTask?.id === taskId) setSelectedTask(null);
    } finally {
      setLoadingId('');
    }
  }

  return (
    <div className='space-y-5'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold tracking-tight'>任务审核</h2>
        <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
          一键生成后会创建真实生产任务，任务参数保存到本地数据库。当前阶段生成结果为自动化生产摘要，后续可接入真实
          AI 与剪辑引擎。
        </p>
      </div>

      {selectedTask ? (
        <Card>
          <CardHeader>
            <CardTitle>任务详情</CardTitle>
            <CardDescription>{selectedTask.title}</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 text-sm md:grid-cols-2'>
            <div className='rounded-lg border p-3'>
              <div className='font-medium'>视频需求</div>
              <p className='mt-1 text-muted-foreground'>{selectedTask.prompt}</p>
            </div>
            <div className='rounded-lg border p-3'>
              <div className='font-medium'>自动化生产摘要</div>
              <p className='mt-1 text-muted-foreground'>{selectedTask.resultSummary ?? '-'}</p>
            </div>
            {selectedTask.errorMessage ? (
              <div className='rounded-lg border border-destructive/40 bg-destructive/5 p-3 md:col-span-2'>
                <div className='font-medium text-destructive'>生成失败原因</div>
                <pre className='mt-1 whitespace-pre-wrap text-xs text-muted-foreground'>
                  {selectedTask.errorMessage}
                </pre>
              </div>
            ) : null}
            {Array.isArray(selectedTask.outputVideos) && selectedTask.outputVideos.length > 0 ? (
              <div className='rounded-lg border p-3 md:col-span-2'>
                <div className='mb-2 font-medium'>生成视频</div>
                <div className='grid gap-3 md:grid-cols-2'>
                  {selectedTask.outputVideos.map((_video, index) => (
                    <video
                      key={`${selectedTask.id}-${index}`}
                      controls
                      className='aspect-[9/16] max-h-[420px] rounded-md border bg-black'
                      src={`/api/workspaces/${workspaceSlug}/automation/tasks/${selectedTask.id}/outputs/${index}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>视频生产任务</CardTitle>
          <CardDescription>展示从“视频生产”页面创建的真实任务记录。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>视频名称</TableHead>
                <TableHead>规格</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建人</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className='text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='py-10 text-center text-muted-foreground'>
                    还没有视频生产任务，请先在“视频生产”页点击一键生成视频。
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className='font-medium'>{task.title}</div>
                      <div className='text-xs text-muted-foreground'>
                        {task.keywords.join('、') || 'AI 自动关键词'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{task.videoRatio}</div>
                      <div className='text-xs text-muted-foreground'>
                        {task.transitionMode} / {task.voiceMode}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[task.status]}>
                        {statusLabels[task.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{task.creatorName}</TableCell>
                    <TableCell>{formatDate(task.createdAt)}</TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-2'>
                        <Button variant='outline' size='sm' onClick={() => setSelectedTask(task)}>
                          <Icons.post className='size-3.5' />
                          查看
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={loadingId === task.id}
                          onClick={() => void regenerate(task.id)}
                        >
                          <Icons.sparkles className='size-3.5' />
                          重新生成
                        </Button>
                        <Button
                          variant='destructive'
                          size='sm'
                          disabled={loadingId === task.id}
                          onClick={() => void deleteTask(task.id)}
                        >
                          <Icons.trash className='size-3.5' />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
