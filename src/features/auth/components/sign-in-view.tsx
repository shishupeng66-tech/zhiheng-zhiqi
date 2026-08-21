'use client';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import Link from 'next/link';
import { InteractiveGridPattern } from './interactive-grid';

export default function SignInViewPage() {
  const router = useRouter();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        switch (data.error) {
          case 'not_found':
            setError('账号不存在');
            break;
          case 'invalid_password':
            setError('密码错误');
            break;
          case 'disabled':
            setError('该账号已被禁用，请联系系统管理员');
            break;
          default:
            setError('登录失败，请稍后重试');
        }
        return;
      }
      // 首次登录必须修改初始密码 → 进入个人资料页；否则进入工作台
      if (data.mustChangePassword) {
        router.push('/dashboard/profile');
      } else {
        router.push('/dashboard/overview');
      }
      router.refresh();
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='relative flex min-h-screen flex-col items-center justify-center overflow-hidden md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <Link
        href='/examples/authentication'
        className={cn(
          buttonVariants({ variant: 'ghost' }),
          'absolute top-4 right-4 hidden md:top-8 md:right-8'
        )}
      >
        登录
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
            <h1 className='text-2xl font-semibold tracking-tight'>欢迎回来</h1>
            <p className='text-muted-foreground text-sm'>使用您的企业账号登录</p>
          </div>
          <form onSubmit={handleSubmit} className='w-full space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='username'>账号</Label>
              <Input
                id='username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete='username'
                placeholder='请输入账号'
                disabled={loading}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='password'>密码</Label>
              <Input
                id='password'
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete='current-password'
                placeholder='请输入密码'
                disabled={loading}
              />
            </div>
            {error && (
              <p className='text-destructive text-sm font-medium' role='alert'>
                {error}
              </p>
            )}
            <button type='submit' className={cn(buttonVariants(), 'w-full')} disabled={loading}>
              {loading ? '登录中…' : '登录'}
            </button>
          </form>
          <p className='text-muted-foreground px-8 text-center text-sm'>
            账号由系统管理员创建。如忘记密码，请联系管理员重置。
          </p>
        </div>
      </div>
    </div>
  );
}
