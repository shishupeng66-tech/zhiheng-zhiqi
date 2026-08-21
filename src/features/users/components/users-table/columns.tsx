'use client';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { User } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { CellAction } from './cell-action';
import { ROLE_OPTIONS } from './options';

const STATUS_LABELS: Record<string, string> = {
  Active: '启用',
  Inactive: '停用',
  Invited: '已邀请'
};

export const columns: ColumnDef<User>[] = [
  {
    id: 'name',
    accessorFn: (row) => `${row.first_name} ${row.last_name}`,
    header: ({ column }: { column: Column<User, unknown> }) => (
      <DataTableColumnHeader column={column} title='姓名' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-medium'>
          {row.original.first_name} {row.original.last_name}
        </span>
        <span className='text-muted-foreground text-xs'>{row.original.email}</span>
      </div>
    ),
    meta: {
      label: '姓名',
      placeholder: '搜索用户',
      variant: 'text' as const,
      icon: Icons.text
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'phone',
    header: '电话'
  },
  {
    id: 'role',
    accessorKey: 'role',
    enableSorting: false,
    header: ({ column }: { column: Column<User, unknown> }) => (
      <DataTableColumnHeader column={column} title='角色' />
    ),
    cell: ({ cell }) => {
      const roleValue = cell.getValue<User['role']>();
      const roleLabel =
        ROLE_OPTIONS.find((option) => option.value === roleValue)?.label ?? roleValue;
      return (
        <Badge variant='outline' className='capitalize'>
          {roleLabel}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: '角色',
      variant: 'multiSelect' as const,
      options: ROLE_OPTIONS
    }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ cell }) => {
      const status = cell.getValue<User['status']>();
      const variant =
        status === 'Active' ? 'default' : status === 'Inactive' ? 'secondary' : 'outline';
      return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
