'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import type { PublicUser } from '@/lib/auth/types';

export default function ResetPasswordDialog({
  open,
  onOpenChange,
  target,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PublicUser | null;
  onSaved: () => void;
}) {
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setPassword('');
      setConfirm('');
      setError('');
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/system/employees/${target?.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.message ?? '重置失败');
        return;
      }
      toast.success('密码已重置，该员工旧会话已失效');
      onOpenChange(false);
      onSaved();
    } catch {
      setError('网络错误，操作失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置密码</DialogTitle>
          <DialogDescription>
            为 {target?.name}（{target?.username}）设置新登录密码。确认后该员工旧 session
            会立即失效。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor='rp-pwd'>新密码</Label>
            <Input
              id='rp-pwd'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete='new-password'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rp-confirm'>确认新密码</Label>
            <Input
              id='rp-confirm'
              type='password'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete='new-password'
            />
          </div>
          {error && <p className='text-sm text-destructive'>{error}</p>}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? (
                <>
                  <Icons.spinner className='animate-spin' />
                  重置中...
                </>
              ) : (
                '确认重置'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
