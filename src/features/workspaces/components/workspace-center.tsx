import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { workspaceRoleLabels } from '@/lib/workspaces/permissions';
import {
  listWorkspaceMembers,
  listVisibleWorkspacesForCurrentUser
} from '@/lib/workspaces/service';

export async function WorkspaceCenter() {
  const workspaces = await listVisibleWorkspacesForCurrentUser();

  return (
    <div className='mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-5 md:px-8 lg:px-10'>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>工作空间</h1>
        <p className='max-w-2xl text-sm text-muted-foreground'>进入你有权限参与的企业工作空间。</p>
      </div>

      {workspaces.length === 0 ? (
        <Card className='max-w-2xl'>
          <CardHeader>
            <CardTitle>暂无可访问的工作空间</CardTitle>
            <CardDescription>
              当前账号还没有被加入任何工作空间，请联系企业管理员分配权限。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className='grid max-w-5xl items-stretch gap-4 lg:grid-cols-2'>
          {workspaces.map(({ workspace, membership }) => {
            const members = listWorkspaceMembers(workspace.id);
            const roleLabel = membership ? workspaceRoleLabels[membership.role] : '企业管理员';

            return (
              <Card key={workspace.id} className='flex h-full flex-col border-border/80'>
                <CardHeader>
                  <div className='flex items-start justify-between gap-4'>
                    <div className='flex items-start gap-3'>
                      <div className='flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                        <Icons.video className='size-5' />
                      </div>
                      <div className='space-y-1'>
                        <CardTitle>{workspace.name}</CardTitle>
                        <CardDescription className='leading-6'>
                          {workspace.description}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant='secondary'>
                      {workspace.status === 'active' ? '运行中' : '停用'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className='grid gap-3 text-sm md:grid-cols-3'>
                  <div>
                    <div className='text-muted-foreground'>我的角色</div>
                    <div className='mt-1 font-medium'>{roleLabel}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>成员数量</div>
                    <div className='mt-1 font-medium'>{members.length}</div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>进行中的视频项目</div>
                    <div className='mt-1 font-medium'>0</div>
                  </div>
                </CardContent>
                <CardFooter className='mt-auto justify-between gap-3'>
                  <div className='text-xs text-muted-foreground'>
                    类型：{workspace.workspaceType}
                  </div>
                  <Link
                    className={buttonVariants()}
                    href={`/dashboard/workspaces/${workspace.slug}`}
                  >
                    进入工作空间
                    <Icons.arrowRight className='size-4' />
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
