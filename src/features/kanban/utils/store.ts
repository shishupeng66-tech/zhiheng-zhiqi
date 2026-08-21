import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
// import { persist } from 'zustand/middleware';

export type Priority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  title: string;
  priority: Priority;
  description?: string;
  assignee?: string;
  dueDate?: string;
};

type KanbanState = {
  columns: Record<string, Task[]>;
  setColumns: (columns: Record<string, Task[]>) => void;
  addTask: (title: string, description?: string) => void;
};

const initialColumns: Record<string, Task[]> = {
  backlog: [
    {
      id: '1',
      title: '迁移至 Stripe 计费 API',
      priority: 'high',
      assignee: '陈思雅',
      dueDate: '2026-04-08'
    },
    {
      id: '2',
      title: '为报表新增 CSV 导出功能',
      priority: 'medium',
      assignee: '李远',
      dueDate: '2026-04-12'
    },
    {
      id: '3',
      title: '更新新用户引导文案',
      priority: 'low',
      assignee: '王敏',
      dueDate: '2026-04-15'
    },
    {
      id: '9',
      title: '审计 RBAC 权限',
      priority: 'medium',
      assignee: '金乔',
      dueDate: '2026-04-10'
    }
  ],
  inProgress: [
    {
      id: '4',
      title: '重构通知服务',
      priority: 'high',
      assignee: '张磊',
      dueDate: '2026-04-03'
    },
    {
      id: '5',
      title: '搭建团队邀请流程',
      priority: 'medium',
      assignee: '赵琳',
      dueDate: '2026-04-06'
    },
    {
      id: '10',
      title: '修复调度器时区处理',
      priority: 'high',
      assignee: '陈思雅',
      dueDate: '2026-04-04'
    }
  ],
  done: [
    {
      id: '6',
      title: '对接 Okta 单点登录',
      priority: 'high',
      assignee: '金乔',
      dueDate: '2026-03-22'
    },
    {
      id: '7',
      title: '仪表盘数据分析图表',
      priority: 'medium',
      assignee: '李远',
      dueDate: '2026-03-20'
    },
    {
      id: '8',
      title: 'Webhook 重试机制',
      priority: 'low',
      assignee: '张磊',
      dueDate: '2026-03-18'
    }
  ]
};

export const useTaskStore = create<KanbanState>()(
  // To enable persistence across refreshes, uncomment the persist wrapper below:
  // persist(
  (set) => ({
    columns: initialColumns,

    setColumns: (columns) => set({ columns }),

    addTask: (title, description) =>
      set((state) => ({
        columns: {
          ...state.columns,
          backlog: [
            {
              id: uuid(),
              title,
              description,
              priority: 'medium' as Priority,
              assignee: undefined,
              dueDate: undefined
            },
            ...(state.columns.backlog ?? [])
          ]
        }
      }))
  })
  //   ,
  //   { name: 'kanban-store' }
  // )
);
