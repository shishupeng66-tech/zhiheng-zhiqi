import { Metadata } from 'next';
import SignUpViewPage from '@/features/auth/components/sign-up-view';

export const metadata: Metadata = {
  title: '注册 | 身份验证',
  description: '注册认证页面。'
};

export default function Page() {
  return <SignUpViewPage />;
}
