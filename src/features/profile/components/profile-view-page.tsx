'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { useCurrentUser } from '@/components/auth/user-provider';
import { roleLabel, statusLabel } from '@/constants/rbac';
import { cn } from '@/lib/utils';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '+';
}

function safeInternalRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export default function ProfileViewPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [avatar, setAvatar] = React.useState('');
  const [avatarPreview, setAvatarPreview] = React.useState('');
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [profileSaving, setProfileSaving] = React.useState(false);

  const [currentPwd, setCurrentPwd] = React.useState('');
  const [newPwd, setNewPwd] = React.useState('');
  const [confirmPwd, setConfirmPwd] = React.useState('');
  const [pwdSaving, setPwdSaving] = React.useState(false);
  const [pwdError, setPwdError] = React.useState('');

  React.useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setPhone(user.phone ?? '');
      setAvatar(user.avatar ?? '');
      setAvatarPreview(user.avatar ?? '');
      setAvatarFile(null);
    }
  }, [user]);

  React.useEffect(() => {
    return () => {
      if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  if (!user) return null;

  function chooseAvatar(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      toast.error('头像仅支持 png、jpg、jpeg、webp 格式');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error('头像图片不能超过 2MB');
      return;
    }
    if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function removeAvatar() {
    if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatar('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadAvatarIfNeeded() {
    if (!avatarFile) return avatar.trim() || null;
    const data = new FormData();
    data.set('avatar', avatarFile);
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: data });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.url !== 'string') {
      throw new Error(body.message ?? '头像上传失败');
    }
    return body.url as string;
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('姓名不能为空');
      return;
    }
    setProfileSaving(true);
    try {
      const nextAvatar = await uploadAvatarIfNeeded();
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          avatar: nextAvatar
        })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.message ?? '保存失败');
        return;
      }
      setAvatar(nextAvatar ?? '');
      setAvatarFile(null);
      setAvatarPreview(nextAvatar ?? '');
      toast.success('个人资料已更新');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络错误，保存失败');
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
      toast.success('密码修改成功');
      router.push(safeInternalRedirect(searchParams.get('redirect_url') ?? d.redirectTo));
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
          检测到您仍在使用初始密码，请先在下方修改密码。
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>
            查看您的企业账号信息。账号、工号、部门、岗位、角色由系统管理员维护。
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2'>
          <InfoRow label='姓名' value={user.name} />
          <InfoRow label='账号' value={user.username} />
          <InfoRow label='工号' value={user.employeeNo} />
          <InfoRow label='部门' value={user.department ?? '-'} />
          <InfoRow label='岗位' value={user.position ?? '-'} />
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
            <div className='flex flex-col items-center gap-2 sm:col-span-2'>
              <button
                type='button'
                className={cn(
                  'flex size-24 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-muted text-muted-foreground transition hover:border-primary hover:text-primary',
                  avatarPreview && 'border-solid'
                )}
                onClick={() => fileInputRef.current?.click()}
                aria-label='上传头像'
              >
                <Avatar className='size-full'>
                  {avatarPreview ? <AvatarImage src={avatarPreview} alt='头像预览' /> : null}
                  <AvatarFallback className='text-3xl'>
                    {avatarPreview ? getInitial(name) : '+'}
                  </AvatarFallback>
                </Avatar>
              </button>
              <input
                ref={fileInputRef}
                type='file'
                className='hidden'
                accept='image/png,image/jpeg,image/webp'
                onChange={(event) => chooseAvatar(event.target.files?.[0])}
              />
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarPreview ? '更换头像' : '上传头像'}
                </Button>
                {avatarPreview ? (
                  <Button type='button' variant='ghost' size='sm' onClick={removeAvatar}>
                    移除头像
                  </Button>
                ) : null}
              </div>
            </div>

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
            <div className='sm:col-span-2'>
              <Button type='submit' disabled={profileSaving}>
                {profileSaving ? (
                  <>
                    <Icons.spinner className='animate-spin' />
                    保存中...
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
            修改密码后，当前会话保持有效，其他设备上的登录会话会失效。
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
                    修改中...
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
