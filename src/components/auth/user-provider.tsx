'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { PublicUser } from '@/lib/auth/types';

const UserContext = createContext<PublicUser | null>(null);

/**
 * 客户端当前用户上下文。
 * 由 dashboard 布局（Server Component）读取 getCurrentUser() 后注入，
 * 供 user-nav / app-sidebar / use-nav 等客户端组件获取本地当前用户。
 */
export function UserProvider({ user, children }: { user: PublicUser | null; children: ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** 客户端获取当前登录用户（未登录为 null） */
export function useCurrentUser(): PublicUser | null {
  return useContext(UserContext);
}
