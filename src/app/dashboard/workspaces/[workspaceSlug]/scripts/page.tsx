import { redirect } from 'next/navigation';

type PageProps = { params: Promise<{ workspaceSlug: string }> };

// 「声音资产」已升级为「知衡语音」，路径由 /scripts 迁移至 /voices。
// 保留 /scripts 作为兼容重定向，避免旧书签或外链失效。
export default async function ScriptsRedirectRoute({ params }: PageProps) {
  const { workspaceSlug } = await params;
  redirect(`/dashboard/workspaces/${workspaceSlug}/voices`);
}
