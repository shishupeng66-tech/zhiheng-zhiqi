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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import type { PublicUser } from '@/lib/auth/types';
import type { Role } from '@/lib/db/schema';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/constants/rbac';

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
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

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
      setErrors({});
    }
  }, [open, editing]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = '姓名不能为空';
    if (!isEdit) {
      if (!form.username.trim()) errs.username = '登录账号不能为空';
      if (!form.employeeNo.trim()) errs.employeeNo = '工号不能为空';
      if (form.password.length < 6) errs.password = '初始密码至少 6 位';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      if (isEdit && editing) {
        const res = await fetch(`/api/system/employees/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            department: form.department.trim() || null,
            position: form.position.trim() || null,
            avatar: form.avatar.trim() || null
          })
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.message ?? '保存失败');
          return;
        }
        // 角色变更走独立安全接口（含「不可降级自己 / 至少保留一个超管」护栏）
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
            avatar: form.avatar.trim() || null,
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
    } catch {
      toast.error('网络错误，操作失败');
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
              ? '修改员工资料与角色。'
              : '创建企业员工账号，初始密码将要求该员工首次登录时修改。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div className='space-y-2 sm:col-span-1'>
            <Label htmlFor='emp-name'>
              姓名 <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='emp-name'
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className='text-destructive text-xs'>{errors.name}</p>}
          </div>

          {!isEdit && (
            <>
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
                {errors.username && <p className='text-destructive text-xs'>{errors.username}</p>}
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
                {errors.employeeNo && (
                  <p className='text-destructive text-xs'>{errors.employeeNo}</p>
                )}
              </div>
              <div className='space-y-2 sm:col-span-2'>
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
                {errors.password && <p className='text-destructive text-xs'>{errors.password}</p>}
              </div>
            </>
          )}

          <div className='space-y-2'>
            <Label htmlFor='emp-role'>角色</Label>
            <Select
              value={form.role}
              onValueChange={(v) => update('role', (v as Role) ?? 'employee')}
            >
              <SelectTrigger id='emp-role'>
                <SelectValue />
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
            <Input
              id='emp-dept'
              value={form.department}
              onChange={(e) => update('department', e.target.value)}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='emp-pos'>岗位</Label>
            <Input
              id='emp-pos'
              value={form.position}
              onChange={(e) => update('position', e.target.value)}
            />
          </div>

          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='emp-avatar'>头像 URL</Label>
            <Input
              id='emp-avatar'
              value={form.avatar}
              onChange={(e) => update('avatar', e.target.value)}
              placeholder='https://…'
            />
          </div>

          <DialogFooter className='sm:col-span-2'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? (
                <>
                  <Icons.spinner className='animate-spin' />
                  保存中…
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
