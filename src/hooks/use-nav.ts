'use client';

/**
 * 纯客户端导航 RBAC 过滤 Hook（本地账号体系版，替换原 Clerk useUser / useOrganization）。
 *
 * 说明：
 * - 当前仅实现账号 / 会话，尚未建立本地「工作空间 / 多租户」，因此没有 organization 概念
 *   （hasOrg=false）。任何 requireOrg 的导航项（如团队、账单）在本阶段默认隐藏。
 * - 真实的权限 / 访问控制在服务端（页面 / 路由处理器）强制；此处仅为导航可见性（UX）。
 * - 所有判断均为同步，无额外服务端请求，无加载闪烁。
 */

import { useMemo } from 'react';
import { useCurrentUser } from '@/components/auth/user-provider';
import type { NavItem, NavGroup } from '@/types';

export function useFilteredNavItems(items: NavItem[]) {
  const user = useCurrentUser();

  const accessContext = useMemo(() => {
    return {
      organization: undefined,
      user: user ?? undefined,
      permissions: [] as string[],
      role: user?.role,
      hasOrg: false
    };
  }, [user?.id, user?.role]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        if (!item.access) {
          return true;
        }

        if (item.access.requireOrg && !accessContext.hasOrg) {
          return false;
        }

        if (item.access.permission) {
          if (!accessContext.hasOrg) {
            return false;
          }
          if (!accessContext.permissions.includes(item.access.permission)) {
            return false;
          }
        }

        if (item.access.role) {
          // 角色可见性不依赖 organization（本地账号体系下始终生效）
          if (accessContext.role !== item.access.role) {
            return false;
          }
        }

        if (item.access.plan || item.access.feature) {
          console.warn(
            `Plan/feature 导航权限校验需要服务端验证。导航项 "${item.title}" 将显示，` +
              `但页面级保护应另行实现。`
          );
        }

        return true;
      })
      .map((item) => {
        if (item.items && item.items.length > 0) {
          const filteredChildren = item.items.filter((childItem) => {
            if (!childItem.access) {
              return true;
            }
            if (childItem.access.requireOrg && !accessContext.hasOrg) {
              return false;
            }
            if (childItem.access.permission) {
              if (!accessContext.hasOrg) {
                return false;
              }
              if (!accessContext.permissions.includes(childItem.access.permission)) {
                return false;
              }
            }
            if (childItem.access.role) {
              if (accessContext.role !== childItem.access.role) {
                return false;
              }
            }
            if (childItem.access.plan || childItem.access.feature) {
              console.warn(
                `Plan/feature 导航权限校验需要服务端验证。导航项 "${childItem.title}" 将显示，` +
                  `但页面级保护应另行实现。`
              );
            }
            return true;
          });

          return {
            ...item,
            items: filteredChildren
          };
        }

        return item;
      });
  }, [items, accessContext]);

  return filteredItems;
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const filteredItems = useFilteredNavItems(allItems);

  return useMemo(() => {
    const filteredSet = new Set(filteredItems.map((item) => item.title));
    return groups
      .map((group) => ({
        ...group,
        items: filteredItems.filter((item) =>
          group.items.some((gi) => gi.title === item.title && filteredSet.has(gi.title))
        )
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, filteredItems]);
}
