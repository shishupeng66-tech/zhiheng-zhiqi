import type { InfobarContent } from '@/components/ui/infobar';

export const reactQueryInfoContent: InfobarContent = {
  title: 'React Query 模式',
  sections: [
    {
      title: '服务端预取',
      description:
        '数据在服务端通过 getQueryClient().prefetchQuery() 进行预取。脱水后的状态会传入 HydrationBoundary，使客户端直接以缓存数据启动——首次加载无需出现加载动画。',
      links: [
        {
          title: 'TanStack Query SSR Docs',
          url: 'https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr'
        }
      ]
    },
    {
      title: '查询选项',
      description:
        '查询键与获取函数定义在一个共享的 queryOptions() 对象中。服务端预取与客户端 hooks 复用同一对象，始终保持一致。',
      links: [
        {
          title: 'queryOptions API',
          url: 'https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions'
        }
      ]
    },
    {
      title: 'Suspense 查询',
      description:
        '客户端使用 useSuspenseQuery()，与 React Suspense 集成。配合服务端预取，数据可立即可用——只有当缓存过期、且在后续导航时，Suspense 才会展示回退界面。',
      links: []
    },
    {
      title: '乐观更新',
      description:
        '变更通过 onMutate 在请求完成前乐观地更新缓存。若发生错误则回滚到之前的状态；请求结束后会使查询失效以重新获取最新数据。',
      links: [
        {
          title: 'Optimistic Updates Guide',
          url: 'https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates'
        }
      ]
    }
  ]
};
