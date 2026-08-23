import type { InfobarContent } from '@/components/ui/infobar';

export const usersInfoContent: InfobarContent = {
  title: '客户管理 — React Query + nuqs 模式',
  sections: [
    {
      title: '概述',
      description:
        '本页演示了结合 React Query 的客户端数据获取与 nuqs URL 搜索参数——作为产品页（使用服务端 RSC 获取）的替代方案。两种模式使用相同的 DataTable、useDataTable Hook 与 nuqs URL 状态。',
      links: [
        {
          title: 'TanStack Query SSR 文档',
          url: 'https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr'
        }
      ]
    },
    {
      title: '服务端预取 + 客户端水合',
      description:
        '服务端组件通过 searchParamsCache 读取搜索参数、构建筛选条件并调用 queryClient.prefetchQuery()。脱水后的状态会传给 HydrationBoundary，使客户端以缓存数据启动。客户端组件通过 useQueryState 读取相同的搜索参数，并使用匹配的筛选条件调用 useSuspenseQuery。',
      links: []
    },
    {
      title: '使用 nuqs 管理 URL 状态',
      description:
        '分页、搜索与状态筛选通过 nuqs 同步到 URL。useDataTable Hook 管理 TanStack Table 的状态，并在更新 URL 前对筛选变更进行防抖。当 URL 变化时，由于查询键包含筛选条件，React Query 会自动重新获取。',
      links: [
        {
          title: 'nuqs 文档',
          url: 'https://nuqs.47ng.com'
        }
      ]
    },
    {
      title: '产品页与客户页模式对比',
      description:
        '产品页：searchParams → RSC 获取 → 作为 props 传给客户端表格。客户页：searchParams → 服务端预取 → HydrationBoundary → 客户端 useSuspenseQuery。客户页模式支持后台重新获取、跨组件缓存共享与乐观更新。',
      links: []
    }
  ]
};
