'use client';

import * as React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { roleLabel } from '@/constants/rbac';
import { workspaceRoleLabels } from '@/lib/workspaces/permissions';
import type { Role, Status, WorkspaceMemberRole } from '@/lib/db/schema';
import { toast } from 'sonner';

const ASSIGNABLE_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'editor', 'viewer'];

type WorkspaceMemberRow = {
  id: string;
  role: WorkspaceMemberRole;
  userId: string;
  name: string;
  username: string;
  avatar: string | null;
  employeeNo: string;
  companyRole: Role;
  department: string | null;
  position: string | null;
  status: Status;
};

type CandidateRow = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  employeeNo: string;
  department: string | null;
  position: string | null;
  role: Role;
  status: Status;
};

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '员';
}

function UserAvatar({ user }: { user: { name: string; avatar: string | null } }) {
  return (
    <Avatar className='size-8'>
      {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
      <AvatarFallback>{getInitial(user.name)}</AvatarFallback>
    </Avatar>
  );
}

export function WorkspaceMembersClient({
  workspaceSlug,
  initialMembers,
  initialCandidates
}: {
  workspaceSlug: string;
  initialMembers: WorkspaceMemberRow[];
  initialCandidates: CandidateRow[];
}) {
  const [members, setMembers] = React.useState(initialMembers);
  const [candidates, setCandidates] = React.useState(initialCandidates);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [selectedRole, setSelectedRole] = React.useState<WorkspaceMemberRole>('viewer');
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceSlug}/members`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.message ?? '加载成员失败');
      return;
    }
    setMembers(Array.isArray(data.members) ? data.members : []);
    setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
  }, [workspaceSlug]);

  async function addMember() {
    if (!selectedUserId) {
      toast.error('请选择要添加的员工');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message ?? '添加成员失败');
        return;
      }
      toast.success('已添加成员');
      setSelectedUserId('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(memberId: string, role: WorkspaceMemberRole) {
    const previous = members;
    setMembers((rows) => rows.map((row) => (row.id === memberId ? { ...row, role } : row)));
    const res = await fetch(`/api/workspaces/${workspaceSlug}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, role })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMembers(previous);
      toast.error(data.message ?? '修改权限失败');
      return;
    }
    toast.success('Workspace 权限已更新');
  }

  async function removeMember(memberId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceSlug}/members?memberId=${encodeURIComponent(memberId)}`,
      { method: 'DELETE' }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.message ?? '移除成员失败');
      return;
    }
    toast.success('已移除成员');
    await load();
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='space-y-1'>
          <h2 className='text-xl font-semibold tracking-tight'>成员与权限</h2>
          <p className='max-w-5xl text-sm text-muted-foreground'>
            管理当前 Workspace 的成员范围与空间内权限。员工角色是公司级身份，Workspace
            角色只控制该业务空间内的访问能力。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>添加成员</CardTitle>
          <CardDescription>从启用状态的员工中选择，并分配 Workspace 角色。</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-[minmax(280px,1fr)_220px_auto]'>
          <Select value={selectedUserId} onValueChange={(value) => setSelectedUserId(value ?? '')}>
            <SelectTrigger className='w-full'>
              <span>
                {selectedUserId
                  ? candidates.find((user) => user.id === selectedUserId)?.name
                  : '选择员工'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {candidates.length === 0 ? (
                <SelectItem value='__none__' disabled>
                  暂无可添加员工
                </SelectItem>
              ) : (
                candidates.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} / {user.username}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Select
            value={selectedRole}
            onValueChange={(value) => setSelectedRole(value as WorkspaceMemberRole)}
          >
            <SelectTrigger className='w-full'>
              <span>{workspaceRoleLabels[selectedRole]}</span>
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_WORKSPACE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {workspaceRoleLabels[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => void addMember()} disabled={saving || !selectedUserId}>
            <Icons.add />
            添加成员
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>当前成员</CardTitle>
          <CardDescription>查看成员、账号、部门和 Workspace 权限。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>成员</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>公司角色</TableHead>
                <TableHead>Workspace 权限</TableHead>
                <TableHead className='text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='py-8 text-center text-muted-foreground'>
                    当前 Workspace 还没有独立成员。
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <UserAvatar user={member} />
                        <div>
                          <div className='font-medium'>{member.name}</div>
                          <div className='text-xs text-muted-foreground'>{member.employeeNo}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{member.username}</TableCell>
                    <TableCell>
                      <div>{member.department ?? '-'}</div>
                      <div className='text-xs text-muted-foreground'>{member.position ?? '-'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>{roleLabel(member.companyRole)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={member.role}
                        onValueChange={(role) =>
                          void updateRole(member.id, role as WorkspaceMemberRole)
                        }
                      >
                        <SelectTrigger className='w-[140px]'>
                          <span>{workspaceRoleLabels[member.role]}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_WORKSPACE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {workspaceRoleLabels[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => void removeMember(member.id)}
                      >
                        <Icons.trash />
                        移除成员
                      </Button>
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
