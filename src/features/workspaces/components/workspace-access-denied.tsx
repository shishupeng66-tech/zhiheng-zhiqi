import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';

type WorkspaceAccessDeniedProps = {
  title?: string;
  description?: string;
};

export function WorkspaceAccessDenied({
  title = '无权访问此工作空间',
  description = '当前账号不是该工作空间成员，或没有访问此页面所需的权限。'
}: WorkspaceAccessDeniedProps) {
  return (
    <div className='flex min-h-[520px] items-center justify-center p-6'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive'>
            <Icons.lock className='size-5' />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className={buttonVariants()} href='/dashboard/workspaces'>
            返回工作空间
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
