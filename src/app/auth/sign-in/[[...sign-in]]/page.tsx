import { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: '登录 | 身份验证',
  description: '登录认证页面。'
};

export default async function Page() {
  return <SignInViewPage />;
}
