'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useAssistantStore } from './store';

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** SSE 事件类型（与服务端 AgentStreamEvent 对齐） */
interface StreamEvent {
  type:
    | 'assistant_delta'
    | 'tool_started'
    | 'tool_completed'
    | 'confirmation_required'
    | 'error'
    | 'done';
  content?: string;
  tool?: string;
  toolDisplayName?: string;
  error?: string;
  errorCode?: string;
  confirmation?: {
    actionId: string;
    title: string;
    description: string;
    riskLevel: 'low' | 'high';
  };
}

export function ZhihengAssistant() {
  const pathname = usePathname();
  const {
    isOpen,
    setIsOpen,
    messages,
    isLoading,
    inputValue,
    toolStatuses,
    setInputValue,
    setIsLoading,
    addMessage,
    updateMessage,
    appendToMessage,
    resetConversation,
    setCurrentRoute,
    addToolStatus,
    updateToolStatus,
    clearToolStatuses
  } = useAssistantStore();

  // 同步当前 route 到 store
  React.useEffect(() => {
    setCurrentRoute(pathname);
  }, [pathname, setCurrentRoute]);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  async function send() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMessageId = generateId();
    const assistantMessageId = generateId();

    addMessage({
      id: userMessageId,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      status: 'done'
    });

    addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'streaming'
    });

    setInputValue('');
    setIsLoading(true);
    clearToolStatuses();

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content }))
            .concat([{ role: 'user', content: text }]),
          context: {
            route: pathname
          }
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('AI service unavailable');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 帧（data: {...}\n\n）
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          try {
            const event = JSON.parse(payload) as StreamEvent;
            handleStreamEvent(event, assistantMessageId);
          } catch {
            // 跳过无法解析的帧
          }
        }
      }

      updateMessage(assistantMessageId, { status: 'done' });
    } catch {
      updateMessage(assistantMessageId, {
        content: '知衡助手暂时不可用，请稍后重试。',
        status: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  }

  /** 处理单个流式事件 */
  function handleStreamEvent(event: StreamEvent, assistantMessageId: string) {
    switch (event.type) {
      case 'assistant_delta':
        if (event.content) {
          appendToMessage(assistantMessageId, event.content);
        }
        break;

      case 'tool_started': {
        const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        addToolStatus({
          id: toolId,
          toolName: event.tool ?? '',
          displayName: event.toolDisplayName ?? event.tool ?? '',
          status: 'running'
        });
        // 保存 toolId 映射，方便 completed 时更新
        // 用 toolName 做 key（同一轮内 toolName 唯一）
        toolIdMap.current.set(event.tool ?? '', toolId);
        break;
      }

      case 'tool_completed': {
        const toolId = toolIdMap.current.get(event.tool ?? '');
        if (toolId) {
          updateToolStatus(toolId, { status: 'completed' });
          toolIdMap.current.delete(event.tool ?? '');
        }
        break;
      }

      case 'error':
        updateMessage(assistantMessageId, {
          content: event.error ?? '发生错误',
          status: 'error'
        });
        break;

      case 'done':
      case 'confirmation_required':
        // V1 暂不处理确认卡片
        break;
    }
  }

  // Tool ID 映射（toolName → 本地 ID），用于匹配 started/completed
  const toolIdMap = React.useRef<Map<string, string>>(new Map());

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleNewChat() {
    resetConversation();
    toolIdMap.current.clear();
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }

  return (
    <>
      {/* 悬浮球 */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          isOpen && 'hidden'
        )}
        aria-label='打开知衡助手'
      >
        <Icons.sparkles className='size-5' />
      </button>

      {/* 右侧面板 */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side='right' className='w-full sm:max-w-[420px] p-0'>
          <div className='flex h-full flex-col'>
            {/* 顶部标题栏 */}
            <SheetHeader className='border-b px-4 py-3'>
              <div className='flex items-center gap-3'>
                <div className='bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg'>
                  <Icons.sparkles className='size-4' />
                </div>
                <div className='min-w-0 flex-1'>
                  <SheetTitle className='text-sm font-medium'>知衡助手</SheetTitle>
                  <p className='text-muted-foreground text-xs'>企业 AI 工作助手</p>
                </div>
                <Button
                  variant='outline'
                  size='icon-sm'
                  onClick={handleNewChat}
                  title='新对话'
                  disabled={isLoading}
                >
                  <Icons.add className='size-4' />
                  <span className='sr-only'>新对话</span>
                </Button>
              </div>
            </SheetHeader>

            {/* 消息区 */}
            <MessageScrollerProvider defaultScrollPosition='end' scrollPreviousItemPeek={64}>
              <MessageScroller className='min-h-0 flex-1'>
                <MessageScrollerViewport>
                  <MessageScrollerContent className='px-3 py-4'>
                    {messages.map((message) => {
                      const isUser = message.role === 'user';
                      const isLastAssistant =
                        message.role === 'assistant' &&
                        message.id === messages[messages.length - 1]?.id;
                      const showToolStatus =
                        isLastAssistant &&
                        message.status === 'streaming' &&
                        toolStatuses.length > 0 &&
                        !message.content;

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
                                  {message.content ||
                                    (showToolStatus ? (
                                      <ToolStatusList statuses={toolStatuses} />
                                    ) : (
                                      <Marker>
                                        <MarkerContent className='shimmer'>思考中...</MarkerContent>
                                      </Marker>
                                    ))}
                                </BubbleContent>
                              </Bubble>

                              {/* 如果消息已有内容但还有运行中的 Tool，在下方显示 Tool 状态 */}
                              {message.content &&
                                isLastAssistant &&
                                message.status === 'streaming' &&
                                toolStatuses.some((s) => s.status === 'running') && (
                                  <div className='mt-2'>
                                    <ToolStatusList
                                      statuses={toolStatuses.filter((s) => s.status === 'running')}
                                    />
                                  </div>
                                )}
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

            {/* 底部输入区 */}
            <div className='grid shrink-0 gap-2 border-t p-3'>
              <Textarea
                ref={textareaRef}
                className='min-h-[80px] resize-none'
                placeholder='输入你的问题，Enter 发送，Shift+Enter 换行...'
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <div className='flex items-center justify-between gap-2'>
                <span className='text-muted-foreground text-xs'>
                  {isLoading ? '生成中...' : '按 Enter 发送'}
                </span>
                <Button
                  size='sm'
                  disabled={isLoading || !inputValue.trim()}
                  onClick={() => void send()}
                >
                  <Icons.send className='size-4' />
                  发送
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Tool 状态列表组件 */
function ToolStatusList({
  statuses
}: {
  statuses: Array<{ displayName: string; status: 'running' | 'completed' }>;
}) {
  if (statuses.length === 0) return null;

  return (
    <div className='flex flex-col gap-1.5'>
      {statuses.map((s, i) => (
        <div key={i} className='flex items-center gap-2 text-xs'>
          {s.status === 'running' ? (
            <Icons.spinner className='size-3.5 animate-spin text-primary' />
          ) : (
            <Icons.check className='size-3.5 text-emerald-500' />
          )}
          <span
            className={cn(s.status === 'running' ? 'text-foreground' : 'text-muted-foreground')}
          >
            {s.status === 'running' ? '正在' : '已完成'}
            {s.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}
