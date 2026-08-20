import PageContainer from '@/components/layout/page-container';
import { AiChatDemo } from '@/features/ai-chat/components/ai-chat-demo';

export const metadata = {
  title: '仪表盘：AI 聊天'
};

export default function Page() {
  return (
    <PageContainer pageTitle='AI 聊天' pageDescription='体验 AI 驱动的多步对话与工具调用'>
      <AiChatDemo />
    </PageContainer>
  );
}
