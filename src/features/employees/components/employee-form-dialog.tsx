'use client';

import * as React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import type { PublicUser } from '@/lib/auth/types';
import type { Role } from '@/lib/db/schema';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/constants/rbac';
import { cn } from '@/lib/utils';
import {
  WorkspaceAccessMultiselect,
  type EmployeeWorkspaceOption
} from './workspace-access-multiselect';

const DEPARTMENTS = [
  '管理层',
  '市场部',
  '运营部',
  '销售部',
  '客服部',
  '生产部',
  '技术部',
  '财务部',
  '人事行政',
  '其他'
];

const POSITIONS = [
  '总经理',
  '部门经理',
  '运营专员',
  '短视频运营',
  '市场专员',
  '销售经理',
  '销售专员',
  '客服',
  '生产主管',
  '生产人员',
  '技术人员',
  '财务',
  '人事',
  '行政',
  '其他'
];

const NO_SELECTION = '__none__';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type FormState = {
  name: string;
  username: string;
  employeeNo: string;
  password: string;
  role: Role;
  phone: string;
  department: string;
  position: string;
  avatar: string;
};

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '+';
}

function displaySelection(value: string, placeholder: string) {
  return value || placeholder;
}

export default function EmployeeFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PublicUser | null;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [form, setForm] = React.useState<FormState>({
    name: '',
    username: '',
    employeeNo: '',
    password: '',
    role: 'employee',
    phone: '',
    department: '',
    position: '',
    avatar: ''
  });
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [workspaceOptions, setWorkspaceOptions] = React.useState<EmployeeWorkspaceOption[]>([]);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = React.useState<string[]>([]);
  const [workspaceAccessLoading, setWorkspaceAccessLoading] = React.useState(false);

  // oxlint-disable react/set-state-in-effect
  React.useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? '',
        username: editing?.username ?? '',
        employeeNo: editing?.employeeNo ?? '',
        password: '',
        role: editing?.role ?? 'employee',
        phone: editing?.phone ?? '',
        department: editing?.department ?? '',
        position: editing?.position ?? '',
        avatar: editing?.avatar ?? ''
      });
      setAvatarFile(null);
      setAvatarPreview(editing?.avatar ?? '');
      setErrors({});
      setWorkspaceOptions([]);
      setSelectedWorkspaceIds([]);
    }
  }, [open, editing]);
  // oxlint-enable react/set-state-in-effect

  React.useEffect(() => {
    if (!open || !editing) return;

    let cancelled = false;
    const editingId = editing.id;
    async function loadWorkspaceAccess() {
      setWorkspaceAccessLoading(true);
      try {
        const res = await fetch(`/api/system/employees/${editingId}/workspaces`, {
          cache: 'no-store'
        });
        const body = (await res.json().catch(() => ({}))) as {
          workspaces?: EmployeeWorkspaceOption[];
          workspaceIds?: string[];
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          toast.error(body.message ?? '加载工作空间访问权限失败');
          return;
        }
        setWorkspaceOptions(Array.isArray(body.workspaces) ? body.workspaces : []);
        setSelectedWorkspaceIds(Array.isArray(body.workspaceIds) ? body.workspaceIds : []);
      } catch {
        if (!cancelled) toast.error('加载工作空间访问权限失败');
      } finally {
        if (!cancelled) setWorkspaceAccessLoading(false);
      }
    }

    void loadWorkspaceAccess();

    return () => {
      cancelled = true;
    };
  }, [open, editing]);

  React.useEffect(() => {
    return () => {
      if (avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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
    if (avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function removeAvatar() {
    if (avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview('');
    update('avatar', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function uploadAvatarIfNeeded() {
    if (!avatarFile) return form.avatar.trim() || null;
    const data = new FormData();
    data.set('avatar', avatarFile);
    const res = await fetch('/api/system/employees/avatar', {
      method: 'POST',
      body: data
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.url !== 'string') {
      throw new Error(body.message ?? '头像上传失败');
    }
    return body.url as string;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = '姓名不能为空';
    if (!form.username.trim()) errs.username = '登录账号不能为空';
    if (!form.employeeNo.trim()) errs.employeeNo = '工号不能为空';
    if (!isEdit && form.password.length < 6) errs.password = '初始密码至少 6 位';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const avatar = await uploadAvatarIfNeeded();
      if (isEdit && editing) {
        const res = await fetch(`/api/system/employees/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            username: form.username.trim(),
            employeeNo: form.employeeNo.trim(),
            phone: form.phone.trim() || null,
            department: form.department.trim() || null,
            position: form.position.trim() || null,
            avatar
          })
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(d.message ?? '保存失败');
          return;
        }
        if (form.role !== editing.role) {
          const rres = await fetch(`/api/system/employees/${editing.id}/role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: form.role })
          });
          const rd = await rres.json().catch(() => ({}));
          if (!rres.ok) {
            toast.error(rd.message ?? '角色调整失败');
            return;
          }
        }
        const workspaceRes = await fetch(`/api/system/employees/${editing.id}/workspaces`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceIds: selectedWorkspaceIds })
        });
        const workspaceBody = await workspaceRes.json().catch(() => ({}));
        if (!workspaceRes.ok) {
          toast.error(workspaceBody.message ?? '工作空间访问权限保存失败');
          return;
        }
        toast.success('已保存员工资料');
      } else {
        const res = await fetch('/api/system/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            username: form.username.trim(),
            employeeNo: form.employeeNo.trim(),
            password: form.password,
            role: form.role,
            phone: form.phone.trim() || null,
            department: form.department.trim() || null,
            position: form.position.trim() || null,
            avatar,
            status: 'active',
            mustChangePassword: true
          })
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(d.message ?? '创建失败');
          return;
        }
        toast.success('员工创建成功');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络错误，操作失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑员工' : '新建员工'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? '修改员工资料、账号、工号与角色。密码请通过列表操作菜单重置。'
              : '创建企业员工账号，初始密码将要求该员工首次登录时修改。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div className='flex flex-col items-center gap-2 sm:col-span-2'>
            <button
              type='button'
              className={cn(
                'group relative flex size-24 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-muted text-muted-foreground transition hover:border-primary hover:text-primary',
                avatarPreview && 'border-solid'
              )}
              onClick={() => fileInputRef.current?.click()}
              aria-label='上传头像'
            >
              <Avatar className='size-full'>
                {avatarPreview ? <AvatarImage src={avatarPreview} alt='员工头像预览' /> : null}
                <AvatarFallback className='text-3xl'>
                  {avatarPreview ? getInitial(form.name) : '+'}
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
            <Label htmlFor='emp-name'>
              姓名 <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='emp-name'
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className='text-xs text-destructive'>{errors.name}</p>}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='emp-username'>
              登录账号 <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='emp-username'
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
              aria-invalid={!!errors.username}
            />
            {errors.username && <p className='text-xs text-destructive'>{errors.username}</p>}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='emp-no'>
              工号 <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='emp-no'
              value={form.employeeNo}
              onChange={(e) => update('employeeNo', e.target.value)}
              aria-invalid={!!errors.employeeNo}
            />
            {errors.employeeNo && <p className='text-xs text-destructive'>{errors.employeeNo}</p>}
          </div>

          {!isEdit ? (
            <div className='space-y-2'>
              <Label htmlFor='emp-pwd'>
                初始密码 <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='emp-pwd'
                type='password'
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                autoComplete='new-password'
                aria-invalid={!!errors.password}
              />
              {errors.password && <p className='text-xs text-destructive'>{errors.password}</p>}
            </div>
          ) : null}

          <div className='space-y-2'>
            <Label htmlFor='emp-role'>角色</Label>
            <Select
              value={form.role}
              onValueChange={(v) => update('role', (v as Role) ?? 'employee')}
            >
              <SelectTrigger id='emp-role' className='w-full'>
                <span>{ROLE_LABELS[form.role]}</span>
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='emp-phone'>手机号</Label>
            <Input
              id='emp-phone'
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='emp-dept'>部门</Label>
            <Select
              value={form.department || NO_SELECTION}
              onValueChange={(v) => update('department', !v || v === NO_SELECTION ? '' : v)}
            >
              <SelectTrigger id='emp-dept' className='w-full'>
                <span className={form.department ? undefined : 'text-muted-foreground'}>
                  {displaySelection(form.department, '请选择部门')}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SELECTION}>请选择部门</SelectItem>
                {DEPARTMENTS.map((department) => (
                  <SelectItem key={department} value={department}>
                    {department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='emp-pos'>岗位</Label>
            <Select
              value={form.position || NO_SELECTION}
              onValueChange={(v) => update('position', !v || v === NO_SELECTION ? '' : v)}
            >
              <SelectTrigger id='emp-pos' className='w-full'>
                <span className={form.position ? undefined : 'text-muted-foreground'}>
                  {displaySelection(form.position, '请选择岗位')}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SELECTION}>请选择岗位</SelectItem>
                {POSITIONS.map((position) => (
                  <SelectItem key={position} value={position}>
                    {position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEdit ? (
            <div className='space-y-2 sm:col-span-2'>
              <WorkspaceAccessMultiselect
                workspaces={workspaceOptions}
                selectedIds={selectedWorkspaceIds}
                loading={workspaceAccessLoading}
                disabled={saving}
                onChange={setSelectedWorkspaceIds}
              />
            </div>
          ) : null}

          <DialogFooter className='sm:col-span-2'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? (
                <>
                  <Icons.spinner className='animate-spin' />
                  保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { DEPARTMENTS, POSITIONS };
