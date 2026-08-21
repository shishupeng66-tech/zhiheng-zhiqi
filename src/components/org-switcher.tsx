'use client';
import { Icons } from '@/components/icons';
import { useCurrentUser } from '@/components/auth/user-provider';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

/**
 * 工作空间切换器（本地版，替换原 Clerk Organization 组件）。
 *
 * Phase 3 仅建立本地账号 / 会话体系，完整「工作空间 / 多租户」逻辑尚未实现
 * （user_workspaces 表已预留）。此处渲染为静态企业标识头，展示当前用户所属部门 / 岗位，
 * 不提供 Org 切换，避免引入尚未就绪的工作空间业务。
 */
export function OrgSwitcher() {
  const user = useCurrentUser();
  const subtitle = [user?.department, user?.position].filter(Boolean).join(' · ') || '工作空间';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground'
        >
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg'>
            <Icons.galleryVerticalEnd className='size-4' />
          </div>
          <div className='grid flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>知衡智企</span>
            <span className='text-muted-foreground truncate text-xs'>{subtitle}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
