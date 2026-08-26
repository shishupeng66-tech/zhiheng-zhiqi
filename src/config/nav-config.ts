import { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 *
 * RBAC Access Control:
 * Each navigation item can have an `access` property that controls visibility
 * based on permissions, plans, features, roles, and organization context.
 *
 * Examples:
 *
 * 1. Require organization:
 *    access: { requireOrg: true }
 *
 * 2. Require specific permission:
 *    access: { requireOrg: true, permission: 'org:teams:manage' }
 *
 * 3. Require specific plan:
 *    access: { plan: 'pro' }
 *
 * 4. Require specific feature:
 *    access: { feature: 'premium_access' }
 *
 * 5. Require specific role:
 *    access: { role: 'admin' }
 *
 * 6. Multiple conditions (all must be true):
 *    access: { requireOrg: true, permission: 'org:teams:manage', plan: 'pro' }
 *
 * Note: The `visible` function is deprecated but still supported for backward compatibility.
 * Use the `access` property for new items.
 */
export const navGroups: NavGroup[] = [
  {
    label: '概览',
    items: [
      {
        title: '仪表盘',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: '工作空间',
        url: '/dashboard/workspaces',
        icon: 'workspace',
        isActive: false,
        items: []
      },
      {
        title: '团队',
        url: '/dashboard/workspaces/team',
        icon: 'teams',
        isActive: false,
        items: [],
        access: { requireOrg: true }
      },
      {
        title: '产品',
        url: '/dashboard/product',
        icon: 'product',
        shortcut: ['p', 'p'],
        isActive: false,
        items: []
      },
      {
        title: '客户管理',
        url: '/dashboard/users',
        icon: 'teams',
        shortcut: ['u', 'u'],
        isActive: false,
        items: []
      },
      {
        title: '看板',
        url: '/dashboard/kanban',
        icon: 'kanban',
        shortcut: ['k', 'k'],
        isActive: false,
        items: []
      },
      {
        title: '聊天',
        url: '/dashboard/chat',
        icon: 'chat',
        shortcut: ['c', 'c'],
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: '素材库',
    items: [
      {
        title: '音色库',
        url: '/dashboard/voices/library',
        icon: 'music',
        isActive: false,
        items: []
      },
      {
        title: '声音复刻',
        url: '/dashboard/voices/clone',
        icon: 'sparkles',
        isActive: false,
        items: []
      },
      {
        title: '视频库',
        url: '/dashboard/voices/videos',
        icon: 'video',
        isActive: false,
        items: []
      },
      {
        title: '图片库',
        url: '/dashboard/voices/images',
        icon: 'photo',
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: '系统管理',
    items: [
      {
        title: '员工管理',
        url: '/dashboard/system/employees',
        icon: 'userPen',
        isActive: false,
        items: [],
        access: { role: 'super_admin' }
      },
      {
        title: '模型与接口',
        url: '/dashboard/system/providers',
        icon: 'sparkles',
        isActive: false,
        items: [],
        access: { role: 'super_admin' }
      },
      {
        title: '数据存储',
        url: '/dashboard/system/storage',
        icon: 'database',
        isActive: false,
        items: [],
        access: { role: 'super_admin' }
      },
      {
        title: '账户',
        url: '#',
        icon: 'account',
        isActive: true,
        items: [
          {
            title: '个人资料',
            url: '/dashboard/profile',
            icon: 'profile',
            shortcut: ['m', 'm']
          },
          {
            title: '通知',
            url: '/dashboard/notifications',
            icon: 'notification',
            shortcut: ['n', 'n']
          },
          {
            title: '账单',
            url: '/dashboard/billing',
            icon: 'billing',
            shortcut: ['b', 'b'],
            access: { requireOrg: true }
          }
        ]
      }
    ]
  }
];
