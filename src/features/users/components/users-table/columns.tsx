'use client';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { User } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { CellAction } from './cell-action';

const STATUS_LABELS: Record<string, string> = {
  潜在: '潜在',
  跟进中: '跟进中',
  已成交: '已成交',
  已流失: '已流失'
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  已成交: 'default',
  跟进中: 'secondary',
  潜在: 'outline',
  已流失: 'outline'
};

export const columns: ColumnDef<User>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.customer_name,
    header: ({ column }: { column: Column<User, unknown> }) => (
      <DataTableColumnHeader column={column} title='客户名称' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-medium'>{row.original.customer_name}</span>
        <span className='text-muted-foreground text-xs'>{row.original.contact}</span>
      </div>
    ),
    meta: {
      label: '客户名称',
      placeholder: '搜索客户',
      variant: 'text' as const,
      icon: Icons.text
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'contact',
    header: '联系人',
    enableColumnFilter: false
  },
  {
    accessorKey: 'industry',
    header: '行业',
    enableColumnFilter: false
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ cell }) => {
      const status = cell.getValue<string>();
      return (
        <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
      );
    },
    enableColumnFilter: false
  },
  {
    accessorKey: 'owner',
    header: '负责人',
    enableColumnFilter: false
  },
  {
    accessorKey: 'updated_at',
    header: '更新时间',
    enableColumnFilter: false,
    cell: ({ cell }) => (
      <span className='text-muted-foreground text-sm'>
        {new Date(cell.getValue<string>()).toLocaleDateString('zh-CN')}
      </span>
    )
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
