'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { useCurrentUser } from '@/components/auth/user-provider';
import { roleLabel, statusLabel } from '@/constants/rbac';

export default function ProfileViewPage() {
  const user = useCurrentUser();
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [avatar, setAvatar] = React.useState('');
  const [profileSaving, setProfileSaving] = React.useState(false);

  const [currentPwd, setCurrentPwd] = React.useState('');
  const [newPwd, setNewPwd] = React.useState('');
  const [confirmPwd, setConfirmPwd] = React.useState('');
  const [pwdSaving, setPwdSaving] = React.useState(false);
  const [pwdError, setPwdError] = React.useState('');

  // 仅在切换登录用户时用服务端上下文初始化可编辑字段
  React.useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setPhone(user.phone ?? '');
      setAvatar(user.avatar ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('姓名不能为空');
      return;
    }
    setProfileSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          avatar: avatar.trim() || null
        })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.message ?? '保存失败');
        return;
      }
      toast.success('个人资料已更新');
      // 重新拉取服务端用户上下文，刷新只读展示
      router.refresh();
    } catch {
      toast.error('网络错误，保存失败');
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError('');
    if (newPwd.length < 6) {
      setPwdError('新密码至少 6 位');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwdError(d.message ?? '修改失败');
        return;
      }
      toast.success('密码修改成功，即将跳转登录页');
      // 服务端已使本人全部会话失效 → 强制重新登录
      router.push('/auth/sign-in');
      router.refresh();
    } catch {
      setPwdError('网络错误，修改失败');
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div className='flex w-full flex-col gap-4 p-4'>
      {user.mustChangePassword && (
        <div className='flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300'>
          <Icons.warning className='size-4 shrink-0' />
          检测到您仍使用初始密码，请尽快在下方「修改密码」中设置新密码。
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>
            查看您的企业账号信息（账号、工号、部门、岗位、角色等由系统管理员维护，不可自助修改）
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2'>
          <InfoRow label='姓名' value={user.name} />
          <InfoRow label='账号' value={user.username} />
          <InfoRow label='工号' value={user.employeeNo} />
          <InfoRow label='部门' value={user.department ?? '—'} />
          <InfoRow label='岗位' value={user.position ?? '—'} />
          <InfoRow
            label='角色'
            value={
              <Badge
                variant={
                  user.role === 'super_admin'
                    ? 'default'
                    : user.role === 'manager'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {roleLabel(user.role)}
              </Badge>
            }
          />
          <InfoRow
            label='状态'
            value={
              user.status === 'active' ? (
                <span className='text-emerald-600'>{statusLabel(user.status)}</span>
              ) : (
                <span className='text-muted-foreground'>{statusLabel(user.status)}</span>
              )
            }
          />
          <InfoRow
            label='首次改密'
            value={
              user.mustChangePassword ? (
                <span className='text-amber-600'>待修改</span>
              ) : (
                <span className='text-muted-foreground'>已设置</span>
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>编辑资料</CardTitle>
          <CardDescription>可修改姓名、手机号与头像。其余字段请联系系统管理员。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='profile-name'>姓名</Label>
              <Input id='profile-name' value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='profile-phone'>手机号</Label>
              <Input
                id='profile-phone'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder='选填'
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='profile-avatar'>头像 URL</Label>
              <Input
                id='profile-avatar'
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder='https://…（选填）'
              />
            </div>
            <div className='sm:col-span-2'>
              <Button type='submit' disabled={profileSaving}>
                {profileSaving ? (
                  <>
                    <Icons.spinner className='animate-spin' />
                    保存中…
                  </>
                ) : (
                  '保存修改'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>
            修改密码后，您在其他设备上的登录会话将立即失效，需使用新密码重新登录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='cur-pwd'>当前密码</Label>
              <Input
                id='cur-pwd'
                type='password'
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                autoComplete='current-password'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='new-pwd'>新密码</Label>
              <Input
                id='new-pwd'
                type='password'
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoComplete='new-password'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='confirm-pwd'>确认新密码</Label>
              <Input
                id='confirm-pwd'
                type='password'
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete='new-password'
              />
            </div>
            {pwdError && <p className='text-destructive text-sm sm:col-span-2'>{pwdError}</p>}
            <div className='sm:col-span-2'>
              <Button type='submit' disabled={pwdSaving}>
                {pwdSaving ? (
                  <>
                    <Icons.spinner className='animate-spin' />
                    修改中…
                  </>
                ) : (
                  '修改密码'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-4 border-b py-1.5 sm:block sm:border-none'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-medium'>{value}</span>
    </div>
  );
}
