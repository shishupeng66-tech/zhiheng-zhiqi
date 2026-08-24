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

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      '你好，我是知衡智企 AI 助手。你可以问我工作空间、自动化剪辑、企业知识资产或业务流程相关问题。'
  }
];

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
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState('');
  const [status, setStatus] = React.useState<keyof typeof STATUS_LABELS>('ready');
  const isBusy = status === 'streaming';

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
          messages: toApiMessages([...messages, userMessage])
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('AI service unavailable');
      }

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
            <p className='text-muted-foreground text-xs'>连接统一模型中枢的企业智能对话</p>
          </div>
          <Badge variant='outline' className='ml-auto'>
            {STATUS_LABELS[status]}
          </Badge>
        </div>

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
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setMessages(initialMessages);
                setStatus('ready');
              }}
              disabled={isBusy}
            >
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
