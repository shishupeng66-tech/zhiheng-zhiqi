'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { FolderPickerButton } from './folder-picker-button';
import type { DirStatus } from '@/lib/storage';

interface StorageEntry {
  key: string;
  label: string;
  description: string;
  configured: boolean;
  effectivePath: string;
  inheritedFromRoot: boolean;
  probe: { status: DirStatus; label: string };
}

const STATUS_VARIANT: Record<DirStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  normal: 'default',
  readonly: 'destructive',
  missing: 'secondary',
  inaccessible: 'destructive',
  invalid: 'outline'
};

const isRoot = (key: string) => key === 'root';

function PathText({ p }: { p: string }) {
  const [full, setFull] = useState(false);
  const short = p.length > 64 ? p.slice(0, 64) + '…' : p;
  return (
    <span className='cursor-help font-mono text-xs' title={p} onClick={() => setFull((v) => !v)}>
      {full ? p : short}
    </span>
  );
}

export default function StorageSettingsClient() {
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // root 编辑
  const [rootPath, setRootPath] = useState('');
  const [rootSaving, setRootSaving] = useState(false);
  const [rootChecking, setRootChecking] = useState(false);
  const [rootProbe, setRootProbe] = useState<{
    path: string;
    probe: { status: DirStatus; label: string };
  } | null>(null);
  // 业务目录编辑
  const [editing, setEditing] = useState<StorageEntry | null>(null);
  const [editPath, setEditPath] = useState('');
  const [editChecking, setEditChecking] = useState(false);
  const [editProbe, setEditProbe] = useState<{
    path: string;
    probe: { status: DirStatus; label: string };
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/storage', { cache: 'no-store' });
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      const list: StorageEntry[] = data.entries ?? [];
      setEntries(list);
      const root = list.find((e: StorageEntry) => isRoot(e.key));
      if (root) setRootPath(root.effectivePath);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveRoot = useCallback(async () => {
    setRootSaving(true);
    try {
      const res = await fetch('/api/system/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', key: 'root', path: rootPath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '保存失败');
      setRootProbe({ path: data.effectivePath, probe: data.probe });
      if (data.probe.status === 'normal') toast.success('根目录已保存');
      else toast.error(`已保存，但目录状态：${data.probe.label}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setRootSaving(false);
    }
  }, [rootPath, load]);

  const checkRoot = useCallback(async () => {
    setRootChecking(true);
    try {
      const res = await fetch('/api/system/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', path: rootPath })
      });
      const data = await res.json();
      setRootProbe({ path: data.path, probe: data.probe });
      toast[data.probe.status === 'normal' ? 'success' : 'info'](`根目录检测：${data.probe.label}`);
    } finally {
      setRootChecking(false);
    }
  }, [rootPath]);

  const openEdit = useCallback((entry: StorageEntry) => {
    setEditing(entry);
    setEditPath(entry.effectivePath);
    setEditProbe(null);
  }, []);

  const checkEdit = useCallback(async () => {
    setEditChecking(true);
    try {
      const res = await fetch('/api/system/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', path: editPath })
      });
      const data = await res.json();
      setEditProbe({ path: data.path, probe: data.probe });
    } finally {
      setEditChecking(false);
    }
  }, [editPath]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/system/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', key: editing.key, path: editPath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '保存失败');
      setEditProbe({ path: data.effectivePath, probe: data.probe });
      if (data.probe.status === 'normal') toast.success('目录已保存');
      else toast.error(`已保存，但目录状态：${data.probe.label}`);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setEditSaving(false);
    }
  }, [editing, editPath, load]);

  const resetEdit = useCallback(async () => {
    if (!editing || isRoot(editing.key)) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/system/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', key: editing.key })
      });
      if (!res.ok) throw new Error('重置失败');
      toast.success('已恢复为继承根目录');
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重置失败');
    } finally {
      setEditSaving(false);
    }
  }, [editing, load]);

  if (loading) {
    return <div className='p-6 text-sm text-muted-foreground'>加载中…</div>;
  }

  const rootEntry = entries.find((e) => isRoot(e.key));
  const business = entries.filter((e) => !isRoot(e.key));

  return (
    <div className='space-y-4 p-4 md:p-6'>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold'>数据存储</h1>
        <p className='text-sm text-muted-foreground'>
          统一管理知衡智企所有业务文件资产（客户附件 / 产品资料 / 素材 / 视频 / 音频 /
          知识文件）的本地保存位置。仅超级管理员可访问；SQLite 数据库路径不在本页面管理范围。
        </p>
      </div>

      {/* 当前存储模式 */}
      <Alert>
        <AlertTitle>当前存储模式：本地存储</AlertTitle>
        <AlertDescription className='space-y-1'>
          <div>
            业务子目录默认继承根目录；每个业务目录可单独覆盖路径。支持 Windows 盘符（
            D:\...）、UNC/NAS（\\NAS01\...）与 POSIX（/srv/data）绝对路径。
          </div>
          <div className='text-xs text-muted-foreground'>
            本阶段仅本地路径配置，不含 OSS / COS / 云存储 / 自动搬迁现有文件。
          </div>
        </AlertDescription>
      </Alert>

      {/* 根目录配置 */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>默认数据根目录</CardTitle>
          <CardDescription>
            所有业务目录（customers / products / assets / videos / voices /
            knowledge）默认在此根目录下。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='space-y-1.5'>
            <Label className='text-sm'>根目录路径</Label>
            <div className='flex gap-2'>
              <Input
                value={rootPath}
                placeholder='例如 D:\知衡智企数据 或 \\NAS01\知衡智企'
                onChange={(e) => setRootPath(e.target.value)}
                className='font-mono'
              />
              <FolderPickerButton onSelect={(p) => setRootPath(p)} />
              <Button variant='outline' disabled={rootChecking} onClick={checkRoot}>
                {rootChecking ? '检测中…' : '检测'}
              </Button>
              <Button disabled={rootSaving || !rootPath.trim()} onClick={saveRoot}>
                {rootSaving ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
          {rootProbe ? (
            <div className='flex items-center gap-2 text-sm'>
              检测结果：
              <Badge variant={STATUS_VARIANT[rootProbe.probe.status]}>
                {rootProbe.probe.label}
              </Badge>
              <span className='font-mono text-xs text-muted-foreground'>{rootProbe.path}</span>
            </div>
          ) : rootEntry ? (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              当前生效：
              <Badge variant={STATUS_VARIANT[rootEntry.probe.status]}>
                {rootEntry.probe.label}
              </Badge>
              <span className='font-mono text-xs'>{rootEntry.effectivePath}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 业务数据目录 */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>业务数据目录</CardTitle>
          <CardDescription>
            每个模块的实际文件保存位置；未单独配置的目录自动继承根目录。
          </CardDescription>
        </CardHeader>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模块</TableHead>
                <TableHead>目录</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className='text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {business.map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell>
                    <div className='font-medium'>{entry.label}</div>
                    <div className='text-xs text-muted-foreground'>{entry.description}</div>
                  </TableCell>
                  <TableCell>
                    <PathText p={entry.effectivePath} />
                  </TableCell>
                  <TableCell>
                    {entry.inheritedFromRoot ? (
                      <Badge variant='outline'>继承根目录</Badge>
                    ) : (
                      <Badge variant='secondary'>自定义</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[entry.probe.status]}>{entry.probe.label}</Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button variant='outline' size='sm' onClick={() => openEdit(entry)}>
                      修改路径
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 编辑弹窗 */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改目录 · {editing?.label}</DialogTitle>
            <DialogDescription>
              {editing?.description} 支持盘符 / UNC / POSIX
              绝对路径，保存时自动创建目录并检测可写性。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label className='text-sm'>目录路径</Label>
              <div className='flex gap-2'>
                <Input
                  value={editPath}
                  onChange={(e) => setEditPath(e.target.value)}
                  className='font-mono'
                  placeholder='例如 D:\知衡智企数据\videos'
                />
                <FolderPickerButton onSelect={(p) => setEditPath(p)} size='sm' />
                <Button variant='outline' disabled={editChecking} onClick={checkEdit}>
                  {editChecking ? '检测中…' : '检测'}
                </Button>
              </div>
            </div>
            {editProbe ? (
              <div className='flex items-center gap-2 text-sm'>
                检测结果：
                <Badge variant={STATUS_VARIANT[editProbe.probe.status]}>
                  {editProbe.probe.label}
                </Badge>
              </div>
            ) : null}
            {!isRoot(editing?.key ?? '') && (
              <p className='text-xs text-muted-foreground'>
                留空并点击「恢复继承」可将该目录重置为继承根目录。
              </p>
            )}
          </div>
          <DialogFooter>
            {!isRoot(editing?.key ?? '') && (
              <Button variant='ghost' disabled={editSaving} onClick={resetEdit}>
                恢复继承
              </Button>
            )}
            <Button variant='outline' onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button disabled={editSaving || !editPath.trim()} onClick={saveEdit}>
              {editSaving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
