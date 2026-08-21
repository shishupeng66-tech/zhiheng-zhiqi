'use client';
import React from 'react';
import { ActiveThemeProvider } from '../themes/active-theme';
import QueryProvider from './query-provider';

/**
 * 全局 Provider（本地账号体系版）。
 * 已移除 ClerkProvider：认证由本地会话（HttpOnly Cookie + SQLite sessions 表）承担，
 * 当前用户通过 dashboard 布局注入的 UserProvider 下发。此处仅保留主题与数据请求 Provider。
 */
export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  return (
    <ActiveThemeProvider initialTheme={activeThemeValue}>
      <QueryProvider>{children}</QueryProvider>
    </ActiveThemeProvider>
  );
}
