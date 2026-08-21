import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface UserAvatarProfileProps {
  className?: string;
  showInfo?: boolean;
  /** 本地当前用户（取自 PublicUser 的展示字段） */
  user: {
    name?: string | null;
    avatar?: string | null;
    subtitle?: string | null;
  } | null;
}

export function UserAvatarProfile({ className, showInfo = false, user }: UserAvatarProfileProps) {
  const initial = (user?.name || '用').slice(0, 2);
  return (
    <div className='flex items-center gap-2'>
      <Avatar className={className}>
        <AvatarImage src={user?.avatar || ''} alt={user?.name || ''} />
        <AvatarFallback className='rounded-lg'>{initial.toUpperCase()}</AvatarFallback>
      </Avatar>

      {showInfo && (
        <div className='grid flex-1 text-left text-sm leading-tight'>
          <span className='truncate font-semibold'>{user?.name || '用户'}</span>
          <span className='truncate text-xs'>{user?.subtitle || ''}</span>
        </div>
      )}
    </div>
  );
}
