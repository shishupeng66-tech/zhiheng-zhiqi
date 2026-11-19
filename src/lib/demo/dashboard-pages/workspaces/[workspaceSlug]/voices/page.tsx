import { redirect } from 'next/navigation';

/**
 * 历史兼容：知衡语音已迁移为一级功能（/dashboard/voices）。
 * 旧的工作空间内路由统一 302 跳转到新地址，避免历史链接 / 书签失效。
 */
export default function VoicesWorkspaceRoute() {
  redirect('/dashboard/voices');
}
