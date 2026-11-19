import type { ComponentType } from 'react';
import { notFound, redirect } from 'next/navigation';
import OverviewLayout from '@/lib/demo/dashboard-pages/overview/layout';
import Sales from '@/lib/demo/dashboard-pages/overview/@sales/page';
import Area from '@/lib/demo/dashboard-pages/overview/@area_stats/page';
import Bar from '@/lib/demo/dashboard-pages/overview/@bar_stats/page';
import Pie from '@/lib/demo/dashboard-pages/overview/@pie_stats/page';
import WorkspaceLayout from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/layout';
import Page0 from '@/lib/demo/dashboard-pages/workspaces/team/[[...rest]]/page';
import Page1 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/projects/page';
import Page2 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/publish/page';
import Page3 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/voices/page';
import Page4 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/ai-video/page';
import Page5 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/review/page';
import Page6 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/scripts/page';
import Page7 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/assets/page';
import Page8 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/topics/page';
import Page9 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/analytics/page';
import Page10 from '@/lib/demo/dashboard-pages/forms/advanced/page';
import Page11 from '@/lib/demo/dashboard-pages/forms/multi-step/page';
import Page12 from '@/lib/demo/dashboard-pages/forms/basic/page';
import Page13 from '@/lib/demo/dashboard-pages/forms/sheet-form/page';
import Page14 from '@/lib/demo/dashboard-pages/system/settings/page';
import Page15 from '@/lib/demo/dashboard-pages/system/providers/page';
import Page16 from '@/lib/demo/dashboard-pages/system/storage/page';
import Page17 from '@/lib/demo/dashboard-pages/system/employees/page';
import Page18 from '@/lib/demo/dashboard-pages/elements/icons/page';
import Page19 from '@/lib/demo/dashboard-pages/voices/images/page';
import Page20 from '@/lib/demo/dashboard-pages/voices/library/page';
import Page21 from '@/lib/demo/dashboard-pages/voices/videos/page';
import Page22 from '@/lib/demo/dashboard-pages/voices/clone/page';
import Page23 from '@/lib/demo/dashboard-pages/product/[productId]/page';
import Page24 from '@/lib/demo/dashboard-pages/workspaces/[workspaceSlug]/page';
import Page25 from '@/lib/demo/dashboard-pages/profile/[[...profile]]/page';
import Page26 from '@/lib/demo/dashboard-pages/forms/page';
import Page27 from '@/lib/demo/dashboard-pages/chat/page';
import Page28 from '@/lib/demo/dashboard-pages/desktop/page';
import Page29 from '@/lib/demo/dashboard-pages/product/page';
import Page30 from '@/lib/demo/dashboard-pages/workspaces/page';
import Page31 from '@/lib/demo/dashboard-pages/ai-chat/page';
import Page32 from '@/lib/demo/dashboard-pages/forbidden/page';
import Page33 from '@/lib/demo/dashboard-pages/kanban/page';
import Page34 from '@/lib/demo/dashboard-pages/users/page';
import Page35 from '@/lib/demo/dashboard-pages/exclusive/page';
import Page36 from '@/lib/demo/dashboard-pages/notifications/page';
import Page37 from '@/lib/demo/dashboard-pages/billing/page';

type DemoPageProps = {
  params: Promise<Record<string, string | string[]>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const routes = [
  {
    pattern: new RegExp('^/workspaces/team(?:/(?<rest>.*))?/?$'),
    component: Page0 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/projects/?$'),
    component: Page1 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/publish/?$'),
    component: Page2 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/voices/?$'),
    component: Page3 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/ai-video/?$'),
    component: Page4 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/review/?$'),
    component: Page5 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/scripts/?$'),
    component: Page6 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/assets/?$'),
    component: Page7 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/topics/?$'),
    component: Page8 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/analytics/?$'),
    component: Page9 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/forms/advanced/?$'),
    component: Page10 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/forms/multi-step/?$'),
    component: Page11 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/forms/basic/?$'),
    component: Page12 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/forms/sheet-form/?$'),
    component: Page13 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/system/settings/?$'),
    component: Page14 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/system/providers/?$'),
    component: Page15 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/system/storage/?$'),
    component: Page16 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/system/employees/?$'),
    component: Page17 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/elements/icons/?$'),
    component: Page18 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/voices/images/?$'),
    component: Page19 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/voices/library/?$'),
    component: Page20 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/voices/videos/?$'),
    component: Page21 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/voices/clone/?$'),
    component: Page22 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/product/(?<productId>[^/]+)/?$'),
    component: Page23 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/?$'),
    component: Page24 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/profile(?:/(?<profile>.*))?/?$'),
    component: Page25 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/forms/?$'),
    component: Page26 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/chat/?$'),
    component: Page27 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/desktop/?$'),
    component: Page28 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/product/?$'),
    component: Page29 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/workspaces/?$'),
    component: Page30 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/ai-chat/?$'),
    component: Page31 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/forbidden/?$'),
    component: Page32 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/kanban/?$'),
    component: Page33 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/users/?$'),
    component: Page34 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/exclusive/?$'),
    component: Page35 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/notifications/?$'),
    component: Page36 as unknown as ComponentType<DemoPageProps>
  },
  {
    pattern: new RegExp('^/billing/?$'),
    component: Page37 as unknown as ComponentType<DemoPageProps>
  }
];

export default async function DemoDashboardPage({
  params,
  searchParams
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parts = (await params).path ?? [];
  if (!parts.length) redirect('/dashboard/overview');
  if (parts.join('/') === 'overview') {
    return (
      <OverviewLayout
        sales={<Sales />}
        area_stats={<Area />}
        bar_stats={<Bar />}
        pie_stats={<Pie />}
      />
    );
  }
  const pathname = '/' + parts.join('/');
  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    const values: Record<string, string | string[]> = { ...match.groups };
    for (const key of ['profile', 'rest']) {
      if (typeof values[key] === 'string') values[key] = values[key].split('/').filter(Boolean);
    }
    const Component = route.component;
    const page = <Component params={Promise.resolve(values)} searchParams={searchParams} />;
    if (parts[0] === 'workspaces' && parts[1] && parts[1] !== 'team') {
      return (
        <WorkspaceLayout params={Promise.resolve({ workspaceSlug: parts[1] })}>
          {page}
        </WorkspaceLayout>
      );
    }
    return page;
  }
  notFound();
}
