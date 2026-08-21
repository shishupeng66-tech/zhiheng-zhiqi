import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Metadata } from 'next';
import Link from 'next/link';
import { InteractiveGridPattern } from './interactive-grid';

export const metadata: Metadata = {
  title: '注册',
  description: '注册功能已关闭'
};

/**
 * 注册入口已关闭（本地企业部署：账号由系统管理员统一创建）。
 * 保留本文件结构作为备份，不再挂载 Clerk <SignUp>。
 */
export default function SignUpViewPage() {
  return (
    <div className='relative flex min-h-screen flex-col items-center justify-center overflow-hidden md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <Link
        href='/auth/sign-in'
        className={cn(
          buttonVariants({ variant: 'ghost' }),
          'absolute top-4 right-4 hidden md:top-8 md:right-8'
        )}
      >
        返回登录
      </Link>
      <div className='relative hidden h-full flex-col p-10 lg:flex dark:border-r'>
        <div className='absolute inset-0 bg-sidebar' />
        <div className='text-sidebar-foreground relative z-20 flex items-center text-lg font-medium'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='mr-2 h-6 w-6'
          >
            <path d='M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3' />
          </svg>
          知衡智企
        </div>
        <InteractiveGridPattern
          className={cn(
            'mask-[radial-gradient(400px_circle_at_center,white,transparent)]',
            'inset-x-0 inset-y-[0%] h-full skew-y-12'
          )}
        />
        <div className='text-sidebar-foreground relative z-20 mt-auto'>
          <blockquote className='space-y-2'>
            <p className='text-lg'>
              &ldquo;这套起始模板为我节省了无数小时的工作，并让我能够比以往更快地向客户交付项目。&rdquo;
            </p>
            <footer className='text-sidebar-foreground/70 text-sm'>某用户</footer>
          </blockquote>
        </div>
      </div>
      <div className='flex h-full items-center justify-center p-4 lg:p-8'>
        <div className='flex w-full max-w-md flex-col items-center justify-center space-y-6'>
          <div className='flex flex-col space-y-2 text-center'>
            <h1 className='text-2xl font-semibold tracking-tight'>注册功能已关闭</h1>
            <p className='text-muted-foreground text-sm'>
              本系统为企业内部部署，账号由系统管理员统一创建。
            </p>
          </div>
          <div className='bg-muted w-full rounded-lg border p-6 text-center text-sm text-muted-foreground'>
            如需开通账号，请联系贵公司的系统管理员。
            <br />
            已拥有账号？请直接登录。
          </div>
          <Link href='/auth/sign-in' className={cn(buttonVariants(), 'w-full')}>
            前往登录
          </Link>
        </div>
      </div>
    </div>
  );
}
