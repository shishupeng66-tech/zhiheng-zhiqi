'use client';

import * as React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import { roleLabel, statusLabel } from '@/constants/rbac';
import type { PublicUser } from '@/lib/auth/types';
import type { Role, Status } from '@/lib/db/schema';
import EmployeeFormDialog from './employee-form-dialog';
import ResetPasswordDialog from './reset-password-dialog';

const ROLE_BADGE: Record<Role, 'default' | 'secondary' | 'outline'> = {
  super_admin: 'default',
  manager: 'secondary',
  employee: 'outline'
};

const roleFilterLabels: Record<string, string> = {
  all: '全部角色',
  super_admin: '超级管理员',
  manager: '管理者',
  employee: '员工'
};

const statusFilterLabels: Record<string, string> = {
  all: '全部状态',
  active: '启用',
  disabled: '停用'
};

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '员';
}

function EmployeeAvatar({ user }: { user: PublicUser }) {
  return (
    <Avatar className='size-8'>
      {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
      <AvatarFallback>{getInitial(user.name)}</AvatarFallback>
    </Avatar>
  );
}

export default function EmployeesClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = React.useState<PublicUser[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PublicUser | null>(null);
  const [resetTarget, setResetTarget] = React.useState<PublicUser | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/system/employees?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 403) {
          toast.error('无权限访问员工数据');
          return;
        }
        toast.error('加载员工列表失败');
        return;
      }
      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      toast.error('网络错误，加载失败');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function toggleStatus(u: PublicUser) {
    if (u.id === currentUserId && u.role === 'super_admin') {
      toast.error('超级管理员不能停用自己');
      return;
    }
    const next: Status = u.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await fetch(`/api/system/employees/${u.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message ?? '操作失败');
        return;
      }
      toast.success(next === 'disabled' ? '已停用该账号' : '已启用该账号');
      void load();
    } catch {
      toast.error('网络错误，操作失败');
    }
  }

  return (
    <PageContainer
      pageTitle='员工管理'
      pageDescription='管理员工账号、角色与状态'
      pageHeaderAction={
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Icons.add />
          新建员工
        </Button>
      }
    >
      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <form
          className='flex flex-1 items-center gap-2'
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
          }}
        >
          <div className='relative w-full max-w-xs'>
            <Icons.search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='搜索姓名 / 登录账号 / 工号'
              className='pl-8'
            />
          </div>
          <Button type='submit' variant='outline'>
            搜索
          </Button>
        </form>

        <Select value={roleFilter} onValueChange={(v) => setRoleFilter((v as string) ?? 'all')}>
          <SelectTrigger className='w-[150px]'>
            <span>{roleFilterLabels[roleFilter] ?? '全部角色'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>全部角色</SelectItem>
            <SelectItem value='super_admin'>超级管理员</SelectItem>
            <SelectItem value='manager'>管理者</SelectItem>
            <SelectItem value='employee'>员工</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as string) ?? 'all')}>
          <SelectTrigger className='w-[140px]'>
            <span>{statusFilterLabels[statusFilter] ?? '全部状态'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>全部状态</SelectItem>
            <SelectItem value='active'>启用</SelectItem>
            <SelectItem value='disabled'>停用</SelectItem>
          </SelectContent>
        </Select>

        <Button variant='ghost' onClick={() => void load()} title='刷新'>
          <Icons.spinner className={loading ? 'animate-spin' : 'hidden'} />
          刷新
        </Button>
      </div>

      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>登录账号</TableHead>
              <TableHead>工号</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>岗位</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>首次改密</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className='py-8 text-center text-muted-foreground'>
                  加载中...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className='py-8 text-center text-muted-foreground'>
                  暂无员工数据
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <TableRow key={u.id}>
                    <TableCell className='font-medium'>
                      <div className='flex items-center gap-2'>
                        <EmployeeAvatar user={u} />
                        <span>{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>{u.employeeNo}</TableCell>
                    <TableCell>{u.department ?? '-'}</TableCell>
                    <TableCell>{u.position ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE[u.role]}>{roleLabel(u.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.status === 'active' ? (
                        <span className='text-emerald-600'>{statusLabel(u.status)}</span>
                      ) : (
                        <span className='text-muted-foreground'>{statusLabel(u.status)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.mustChangePassword ? (
                        <span className='text-amber-600'>待修改</span>
                      ) : (
                        <span className='text-muted-foreground'>已设置</span>
                      )}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {u.createdAt
                        ? formatDate(u.createdAt, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })
                        : '-'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant='ghost' size='icon-sm' aria-label='操作'>
                              <Icons.ellipsis />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(u);
                              setFormOpen(true);
                            }}
                          >
                            <Icons.edit />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={isSelf} onClick={() => setResetTarget(u)}>
                            <Icons.lock />
                            重置密码
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isSelf && u.role === 'super_admin'}
                            onClick={() => void toggleStatus(u)}
                          >
                            {u.status === 'active' ? (
                              <>
                                <Icons.circleX />
                                停用
                              </>
                            ) : (
                              <>
                                <Icons.check />
                                启用
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => void load()}
      />
      <ResetPasswordDialog
        open={resetTarget !== null}
        onOpenChange={(o) => {
          if (!o) setResetTarget(null);
        }}
        target={resetTarget}
        onSaved={() => void load()}
      />
    </PageContainer>
  );
}
