'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganization, Show } from '@clerk/nextjs';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

export default function ExclusivePage() {
  const { organization, isLoaded } = useOrganization();

  return (
    <PageContainer isLoading={!isLoaded}>
      <Show
        when={{ plan: 'pro' }}
        fallback={
          <div className='flex h-full items-center justify-center'>
            <Alert>
              <Icons.lock className='h-5 w-5 text-yellow-600' />
              <AlertDescription>
                <div className='mb-1 text-lg font-semibold'>需要 Pro 套餐</div>
                <div className='text-muted-foreground'>
                  本页面仅向 <span className='font-semibold'>Pro</span> 套餐的组织开放。
                  <br />
                  请在&nbsp;
                  <Link className='underline' href='/dashboard/billing'>
                    账单与套餐
                  </Link>
                  中升级你的订阅。
                </div>
              </AlertDescription>
            </Alert>
          </div>
        }
      >
        <div className='space-y-6'>
          <div>
            <h1 className='flex items-center gap-2 text-3xl font-bold tracking-tight'>
              <Icons.badgeCheck className='h-7 w-7 text-green-600' />
              专属区域
            </h1>
            <p className='text-muted-foreground'>
              欢迎，<span className='font-semibold'>{organization?.name}</span>！本页面包含 Pro
              套餐组织的专属功能。
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>感谢查看专属页面</CardTitle>
              <CardDescription>这意味着你属于一个已订阅 Pro 套餐的组织。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='text-lg'>祝你度过美好的一天！</div>
            </CardContent>
          </Card>
        </div>
      </Show>
    </PageContainer>
  );
}
