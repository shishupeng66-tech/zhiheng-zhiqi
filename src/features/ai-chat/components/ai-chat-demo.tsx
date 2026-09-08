'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@/components/ui/message-scroller';
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Marker, MarkerContent } from '@/components/ui/marker';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type HistorySession = {
  sessionId: string;
  title: string;
  messageCount: number;
  updatedAt: string | null;
};

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好，我是知衡智企 AI 助手。你可以问我工作空间、自动化剪辑、企业知识资产或业务流程相关问题。'
};

const STATUS_LABELS = {
  ready: '就绪',
  streaming: '生成中',
  error: '错误'
};

function toApiMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.id !== 'welcome')
    .map((message) => ({ role: message.role, content: message.content }));
}

export function AiChatDemo() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = React.useState('');
  const [status, setStatus] = React.useState<keyof typeof STATUS_LABELS>('ready');
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<HistorySession[]>([]);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const isBusy = status === 'streaming';

  // 加载历史会话列表
  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/ai/chat/history', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      }
    } catch {
      // 历史加载失败不阻塞聊天
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // 加载指定会话完整消息
  const openSession = React.useCallback(async (sid: string) => {
    setStatus('ready');
    try {
      const res = await fetch(`/api/ai/chat/history?sessionId=${encodeURIComponent(sid)}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        const raw: { role: ChatRole; content: string }[] = Array.isArray(data.messages)
          ? data.messages
          : [];
        const loaded: ChatMessage[] = raw
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m, index) => ({ id: `hist-${sid}-${index}`, role: m.role, content: m.content }));
        setMessages(loaded.length > 0 ? loaded : [welcomeMessage]);
        setSessionId(sid);
        setHistoryOpen(false);
      }
    } catch {
      // 会话读取失败保持现状
    }
  }, []);

  // 新会话
  const startNew = React.useCallback(() => {
    setMessages([welcomeMessage]);
    setSessionId(null);
    setStatus('ready');
    setHistoryOpen(false);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || isBusy) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: ''
    };
    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setInput('');
    setStatus('streaming');

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messages: toApiMessages([...messages, userMessage])
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('AI service unavailable');
      }

      // 首次回复后记住会话 ID，后续消息追加到同一会话
      const sid = response.headers.get('X-Session-Id');
      if (sid) setSessionId(sid);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: fullText } : message
          )
        );
      }
      setStatus('ready');
      // 刷新会话列表（聊天记录已落盘）
      void loadHistory();
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: 'AI服务暂时不可用，请稍后重试。' }
            : message
        )
      );
      setStatus('error');
    }
  }

  return (
    <div className='relative flex flex-1'>
      <div className='bg-card absolute inset-0 mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border'>
        <div className='flex shrink-0 items-center gap-2 border-b px-4 py-3'>
          <div className='bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg'>
            <Icons.sparkles className='size-4' />
          </div>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>AI助手</p>
            <p className='text-muted-foreground text-xs'>
              连接统一模型中枢的企业智能对话 · 记录保存于企业数据目录
            </p>
          </div>
          <div className='ml-auto flex items-center gap-2'>
            <Badge variant='outline'>{STATUS_LABELS[status]}</Badge>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                setHistoryOpen((v) => !v);
                if (!historyOpen) void loadHistory();
              }}
              disabled={isBusy}
            >
              <Icons.clock className='size-4' />
              历史
            </Button>
          </div>
        </div>

        {historyOpen ? (
          <div className='border-b bg-muted/30 px-4 py-3'>
            <div className='mb-2 flex items-center justify-between'>
              <p className='text-sm font-medium'>历史会话</p>
              <Button variant='outline' size='sm' onClick={startNew}>
                <Icons.add className='size-4' />
                新会话
              </Button>
            </div>
            <div className='grid max-h-48 gap-1 overflow-y-auto'>
              {historyLoading ? (
                <p className='py-2 text-xs text-muted-foreground'>加载中…</p>
              ) : sessions.length === 0 ? (
                <p className='py-2 text-xs text-muted-foreground'>暂无历史会话记录。</p>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.sessionId}
                    onClick={() => void openSession(session.sessionId)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                      session.sessionId === sessionId && 'bg-muted'
                    )}
                  >
                    <Icons.chat className='size-4 shrink-0 text-muted-foreground' />
                    <span className='min-w-0 flex-1 truncate'>{session.title}</span>
                    <span className='shrink-0 text-xs text-muted-foreground'>
                      {session.messageCount} 条
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        <MessageScrollerProvider defaultScrollPosition='end' scrollPreviousItemPeek={64}>
          <MessageScroller className='min-h-0 flex-1'>
            <MessageScrollerViewport>
              <MessageScrollerContent className='px-4 py-4'>
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={isUser}
                    >
                      <Message align={isUser ? 'end' : 'start'}>
                        <MessageAvatar
                          className={cn(
                            'size-8 self-start',
                            isUser
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-primary/10 text-primary'
                          )}
                        >
                          {isUser ? (
                            <Icons.user className='size-4' />
                          ) : (
                            <Icons.sparkles className='size-4' />
                          )}
                        </MessageAvatar>
                        <MessageContent>
                          <Bubble
                            variant={isUser ? 'default' : 'muted'}
                            align={isUser ? 'end' : 'start'}
                          >
                            <BubbleContent className='whitespace-pre-wrap'>
                              {message.content || (
                                <Marker>
                                  <MarkerContent className='shimmer'>思考中...</MarkerContent>
                                </Marker>
                              )}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        <div className='grid shrink-0 gap-2 border-t p-3'>
          <Textarea
            className='min-h-20 resize-none'
            placeholder='输入你的问题...'
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className='flex items-center justify-between gap-2'>
            <Button variant='outline' size='sm' onClick={startNew} disabled={isBusy}>
              重新开始
            </Button>
            <Button disabled={isBusy || !input.trim()} onClick={() => void send()}>
              <Icons.send className='size-4' />
              {isBusy ? '正在生成' : '发送'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
