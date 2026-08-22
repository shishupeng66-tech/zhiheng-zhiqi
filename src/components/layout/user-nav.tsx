'use client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { UserAvatarProfile } from '@/components/user-avatar-profile';
import { useCurrentUser } from '@/components/auth/user-provider';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export function UserNav() {
  const user = useCurrentUser();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/auth/sign-in');
      router.refresh();
    }
  }

  if (!user) return null;

  const subtitle = [user.department, user.position].filter(Boolean).join(' · ');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant='ghost' className='relative h-8 w-8 rounded-full' />}
      >
        <UserAvatarProfile user={{ name: user.name, avatar: user.avatar }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' sideOffset={10}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col space-y-1'>
              <p className='text-sm leading-none font-medium'>{user.name}</p>
              {subtitle && <p className='text-muted-foreground text-xs leading-none'>{subtitle}</p>}
              <p className='text-muted-foreground text-xs leading-none'>{user.username}</p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
            个人资料
          </DropdownMenuItem>
          <DropdownMenuItem>设置</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleLogout} disabled={loading}>
            {loading ? '退出中…' : '退出登录'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
