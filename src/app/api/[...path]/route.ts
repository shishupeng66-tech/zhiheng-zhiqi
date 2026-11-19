import { NextResponse, type NextRequest } from 'next/server';
import { GET as get0 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/automation/tasks/[taskId]/outputs/[index]/route';
import { GET as get1 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/voices/clone/[voiceId]/preview/route';
import { GET as get2 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/voices/[voiceType]/preview/route';
import { GET as get3 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/automation/tasks/[taskId]/route';
import { GET as get4 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/automation/tasks/route';
import { GET as get5 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/automation/voices/route';
import { GET as get6 } from '@/lib/demo/api-pages/system/employees/[id]/workspaces/route';
import { GET as get7 } from '@/lib/demo/api-pages/ai/chat/history/route';
import { GET as get8 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/voices/route';
import { GET as get9 } from '@/lib/demo/api-pages/system/settings/[module]/route';
import { GET as get10 } from '@/lib/demo/api-pages/system/employees/[id]/route';
import { GET as get11 } from '@/lib/demo/api-pages/services/[serviceId]/health/route';
import { GET as get12 } from '@/lib/demo/api-pages/desktop/health/route';
import { GET as get13 } from '@/lib/demo/api-pages/desktop/runtime/route';
import { GET as get14 } from '@/lib/demo/api-pages/system/settings/route';
import { GET as get15 } from '@/lib/demo/api-pages/system/storage/route';
import { GET as get16 } from '@/lib/demo/api-pages/system/employees/route';
import { GET as get17 } from '@/lib/demo/api-pages/templates/enterprise/route';
import { GET as get18 } from '@/lib/demo/api-pages/products/[id]/route';
import { GET as get19 } from '@/lib/demo/api-pages/workspaces/[workspaceSlug]/route';
import { GET as get20 } from '@/lib/demo/api-pages/products/route';
import { GET as get21 } from '@/lib/demo/api-pages/profile/route';
import { GET as get22 } from '@/lib/demo/api-pages/users/route';
import { GET as get23 } from '@/lib/demo/api-pages/templates/route';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type DemoHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Response | Promise<Response>;
const routes = [
  {
    pattern: new RegExp(
      '^/workspaces/(?<workspaceSlug>[^/]+)/automation/tasks/(?<taskId>[^/]+)/outputs/(?<index>[^/]+)/?$'
    ),
    handler: get0 as unknown as DemoHandler
  },
  {
    pattern: new RegExp(
      '^/workspaces/(?<workspaceSlug>[^/]+)/voices/clone/(?<voiceId>[^/]+)/preview/?$'
    ),
    handler: get1 as unknown as DemoHandler
  },
  {
    pattern: new RegExp(
      '^/workspaces/(?<workspaceSlug>[^/]+)/voices/(?<voiceType>[^/]+)/preview/?$'
    ),
    handler: get2 as unknown as DemoHandler
  },
  {
    pattern: new RegExp(
      '^/workspaces/(?<workspaceSlug>[^/]+)/automation/tasks/(?<taskId>[^/]+)/?$'
    ),
    handler: get3 as unknown as DemoHandler
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/automation/tasks/?$'),
    handler: get4 as unknown as DemoHandler
  },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/automation/voices/?$'),
    handler: get5 as unknown as DemoHandler
  },
  {
    pattern: new RegExp('^/system/employees/(?<id>[^/]+)/workspaces/?$'),
    handler: get6 as unknown as DemoHandler
  },
  { pattern: new RegExp('^/ai/chat/history/?$'), handler: get7 as unknown as DemoHandler },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/voices/?$'),
    handler: get8 as unknown as DemoHandler
  },
  {
    pattern: new RegExp('^/system/settings/(?<module>[^/]+)/?$'),
    handler: get9 as unknown as DemoHandler
  },
  {
    pattern: new RegExp('^/system/employees/(?<id>[^/]+)/?$'),
    handler: get10 as unknown as DemoHandler
  },
  {
    pattern: new RegExp('^/services/(?<serviceId>[^/]+)/health/?$'),
    handler: get11 as unknown as DemoHandler
  },
  { pattern: new RegExp('^/desktop/health/?$'), handler: get12 as unknown as DemoHandler },
  { pattern: new RegExp('^/desktop/runtime/?$'), handler: get13 as unknown as DemoHandler },
  { pattern: new RegExp('^/system/settings/?$'), handler: get14 as unknown as DemoHandler },
  { pattern: new RegExp('^/system/storage/?$'), handler: get15 as unknown as DemoHandler },
  { pattern: new RegExp('^/system/employees/?$'), handler: get16 as unknown as DemoHandler },
  { pattern: new RegExp('^/templates/enterprise/?$'), handler: get17 as unknown as DemoHandler },
  { pattern: new RegExp('^/products/(?<id>[^/]+)/?$'), handler: get18 as unknown as DemoHandler },
  {
    pattern: new RegExp('^/workspaces/(?<workspaceSlug>[^/]+)/?$'),
    handler: get19 as unknown as DemoHandler
  },
  { pattern: new RegExp('^/products/?$'), handler: get20 as unknown as DemoHandler },
  { pattern: new RegExp('^/profile/?$'), handler: get21 as unknown as DemoHandler },
  { pattern: new RegExp('^/users/?$'), handler: get22 as unknown as DemoHandler },
  { pattern: new RegExp('^/templates/?$'), handler: get23 as unknown as DemoHandler }
];
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const pathname = '/' + (await params).path.join('/');
  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    if (match) return route.handler(request, { params: Promise.resolve({ ...match.groups }) });
  }
  return NextResponse.json(
    { error: 'demo_unavailable', message: '该功能暂未开放演示。' },
    { status: 404 }
  );
}
