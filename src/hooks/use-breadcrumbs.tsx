'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

type BreadcrumbItem = {
  title: string;
  link: string;
};

// This allows to add custom title as well
const routeMapping: Record<string, BreadcrumbItem[]> = {
  '/dashboard/system/employees': [
    { title: '系统管理', link: '/dashboard/system/employees' },
    { title: '员工管理', link: '/dashboard/system/employees' }
  ],
  '/dashboard/system/providers': [
    { title: '系统管理', link: '/dashboard/system/employees' },
    { title: '模型与接口', link: '/dashboard/system/providers' }
  ],
  '/dashboard/system/storage': [
    { title: '系统管理', link: '/dashboard/system/employees' },
    { title: '数据存储', link: '/dashboard/system/storage' }
  ],
  '/dashboard/system/settings': [
    { title: '系统管理', link: '/dashboard/system/employees' },
    { title: '模型与接口', link: '/dashboard/system/providers' }
  ],
  '/dashboard': [{ title: '仪表盘', link: '/dashboard' }],
  '/dashboard/employee': [
    { title: '仪表盘', link: '/dashboard' },
    { title: '员工', link: '/dashboard/employee' }
  ],
  '/dashboard/product': [
    { title: '仪表盘', link: '/dashboard' },
    { title: '产品', link: '/dashboard/product' }
  ]
  // Add more custom mappings as needed
};

// Map individual path segments to Chinese labels (used as a fallback
// for routes that don't have an explicit routeMapping entry)
const segmentLabels: Record<string, string> = {
  dashboard: '仪表盘',
  overview: '概览',
  workspaces: '工作空间',
  team: '团队',
  product: '产品',
  products: '产品',
  users: '客户管理',
  kanban: '看板',
  chat: '聊天',
  'ai-chat': 'AI 聊天',
  forms: '表单',
  basic: '基础表单',
  'multi-step': '分步表单',
  'sheet-form': '抽屉与弹窗',
  advanced: '高级模式',
  elements: '组件',
  icons: '图标',
  exclusive: '专属',
  account: '账户',
  profile: '个人资料',
  notifications: '通知',
  billing: '账单',
  system: '系统管理',
  employee: '员工',
  employees: '员工管理',
  settings: '模型与接口',
  providers: '模型与接口',
  storage: '数据存储'
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    // Check if we have a custom mapping for this exact path
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    // If no exact match, fall back to generating breadcrumbs from the path
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        title: segmentLabels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1),
        link: path
      };
    });
  }, [pathname]);

  return breadcrumbs;
}
