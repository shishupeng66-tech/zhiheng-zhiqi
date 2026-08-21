import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import Link from 'next/link';

export const metadata = {
  title: '无访问权限'
};

export default function ForbiddenPage() {
  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center gap-5 p-6 text-center'>
      <div className='bg-muted flex size-16 items-center justify-center rounded-full'>
        <Icons.lock className='size-7 text-muted-foreground' />
      </div>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold'>无访问权限</h1>
        <p className='text-muted-foreground max-w-md text-sm'>
          您当前的账号角色无权访问该页面。如需访问，请联系系统超级管理员为您开通相应权限。
        </p>
      </div>
      <Link href='/dashboard/overview' className={buttonVariants()}>
        返回工作台
      </Link>
    </div>
  );
}
