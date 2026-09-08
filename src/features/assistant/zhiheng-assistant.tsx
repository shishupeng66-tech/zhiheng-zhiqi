'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ChatMessages, type ChatMessage } from '@/components/ui/chat-messages';
import { GradientOrb } from '@/components/ui/gradient-orb';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useAssistantStore } from './store';

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

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
  toolResult?: unknown;
  error?: string;
  errorCode?: string;
  confirmation?: {
    actionId: string;
    title: string;
    description: string;
    riskLevel: 'low' | 'high';
  };
}

type PendingVideoPlan = {
  title: string;
  topic: string;
  script: string;
  timeline: Array<unknown>;
  coverage: {
    highQualityCoverageRate: number;
    status: string;
  };
  warnings: string[];
};

function isPendingVideoPlan(value: unknown): value is PendingVideoPlan {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    typeof record.topic === 'string' &&
    typeof record.script === 'string' &&
    Array.isArray(record.timeline) &&
    typeof record.coverage === 'object' &&
    Array.isArray(record.warnings)
  );
}

function getWorkspaceSlug(pathname: string) {
  const match = pathname.match(/^\/dashboard\/workspaces\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const ASSISTANT_ORB_SIZE = 73;
const ASSISTANT_VIEWPORT_MARGIN = 16;
const ASSISTANT_PANEL_WIDTH = 420;
const ASSISTANT_PANEL_HEIGHT = 620;
const ASSISTANT_PANEL_GAP = 10;
const ASSISTANT_ORB_POSITION_KEY = 'zhiheng-assistant-orb-position';

type AssistantOrbPosition = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDefaultOrbPosition() {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }

  return {
    x: window.innerWidth - ASSISTANT_ORB_SIZE - 24,
    y: window.innerHeight - ASSISTANT_ORB_SIZE - 24
  };
}

function getInitialViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720 };
  }

  return { width: window.innerWidth, height: window.innerHeight };
}

function getInitialOrbPosition() {
  if (typeof window === 'undefined') {
    return { x: 1200, y: 640 };
  }

  let nextPosition = getDefaultOrbPosition();
  try {
    const storedPosition = window.localStorage.getItem(ASSISTANT_ORB_POSITION_KEY);
    if (storedPosition) {
      const parsed = JSON.parse(storedPosition) as Partial<AssistantOrbPosition>;
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        nextPosition = { x: parsed.x, y: parsed.y };
      }
    }
  } catch {
    nextPosition = getDefaultOrbPosition();
  }

  return clampOrbPosition(nextPosition, window.innerWidth, window.innerHeight);
}

function clampOrbPosition(
  position: AssistantOrbPosition,
  viewportWidth: number,
  viewportHeight: number
) {
  return {
    x: clamp(
      position.x,
      ASSISTANT_VIEWPORT_MARGIN,
      Math.max(
        ASSISTANT_VIEWPORT_MARGIN,
        viewportWidth - ASSISTANT_ORB_SIZE - ASSISTANT_VIEWPORT_MARGIN
      )
    ),
    y: clamp(
      position.y,
      ASSISTANT_VIEWPORT_MARGIN,
      Math.max(
        ASSISTANT_VIEWPORT_MARGIN,
        viewportHeight - ASSISTANT_ORB_SIZE - ASSISTANT_VIEWPORT_MARGIN
      )
    )
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

  React.useEffect(() => {
    setCurrentRoute(pathname);
  }, [pathname, setCurrentRoute]);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const orbRef = React.useRef<HTMLButtonElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const toolIdMap = React.useRef<Map<string, string>>(new Map());
  const dragStateRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef(false);
  const [pendingVideoPlan, setPendingVideoPlan] = React.useState<PendingVideoPlan | null>(null);
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [viewportSize, setViewportSize] = React.useState(getInitialViewportSize);
  const [orbPosition, setOrbPosition] = React.useState<AssistantOrbPosition>(getInitialOrbPosition);

  React.useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewportSize({ width, height });
      setOrbPosition((current) => clampOrbPosition(current, width, height));
    };

    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || orbRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setIsOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  async function send() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMessageId = generateId();
    const assistantMessageId = generateId();
    const createdAt = new Date().getTime();

    addMessage({
      id: userMessageId,
      role: 'user',
      content: text,
      createdAt,
      status: 'done'
    });

    addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt,
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
            // Ignore malformed stream frames.
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
        toolIdMap.current.set(event.tool ?? '', toolId);
        break;
      }

      case 'tool_completed': {
        const toolId = toolIdMap.current.get(event.tool ?? '');
        if (toolId) {
          updateToolStatus(toolId, { status: 'completed' });
          toolIdMap.current.delete(event.tool ?? '');
        }
        if (event.tool === 'create_video_plan' && isPendingVideoPlan(event.toolResult)) {
          setPendingVideoPlan(event.toolResult);
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
        break;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleNewChat() {
    resetConversation();
    toolIdMap.current.clear();
    setPendingVideoPlan(null);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }

  async function savePendingPlanAsDraft() {
    if (!pendingVideoPlan || savingDraft) return;
    const workspaceSlug = getWorkspaceSlug(pathname);
    if (!workspaceSlug) {
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: '请先进入具体工作空间页面，再保存剪辑草稿。',
        createdAt: Date.now(),
        status: 'error'
      });
      return;
    }

    const confirmed = window.confirm('确认把当前剪辑方案保存为草稿，并打开高级编辑工作台？');
    if (!confirmed) return;

    setSavingDraft(true);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/automation/tasks/from-plan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: pendingVideoPlan })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        editorUrl?: string;
        message?: string;
      };
      if (!response.ok || !payload.editorUrl) {
        throw new Error(payload.message ?? '保存草稿失败');
      }
      setPendingVideoPlan(null);
      window.location.href = payload.editorUrl;
    } catch (error) {
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: error instanceof Error ? error.message : '保存草稿失败',
        createdAt: Date.now(),
        status: 'error'
      });
    } finally {
      setSavingDraft(false);
    }
  }

  const chatMessages = React.useMemo<ChatMessage[]>(
    () =>
      messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .filter((message) => message.content || message.status !== 'streaming')
        .map((message) => ({
          id: message.id,
          sender: message.role === 'user' ? 'user' : 'assistant',
          content: message.content,
          timestamp: new Date(message.createdAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
          })
        })),
    [messages]
  );

  const hasRunningTools = toolStatuses.some((status) => status.status === 'running');
  const panelPosition = React.useMemo(() => {
    const panelWidth = Math.min(
      ASSISTANT_PANEL_WIDTH,
      viewportSize.width - ASSISTANT_VIEWPORT_MARGIN * 2
    );
    const opensAbove = orbPosition.y > viewportSize.height / 2;
    const preferredX = orbPosition.x + ASSISTANT_ORB_SIZE - panelWidth;
    const availableHeight = opensAbove
      ? orbPosition.y - ASSISTANT_VIEWPORT_MARGIN - ASSISTANT_PANEL_GAP
      : viewportSize.height -
        (orbPosition.y + ASSISTANT_ORB_SIZE + ASSISTANT_PANEL_GAP) -
        ASSISTANT_VIEWPORT_MARGIN;

    return {
      left: clamp(
        preferredX,
        ASSISTANT_VIEWPORT_MARGIN,
        Math.max(
          ASSISTANT_VIEWPORT_MARGIN,
          viewportSize.width - panelWidth - ASSISTANT_VIEWPORT_MARGIN
        )
      ),
      top: opensAbove ? undefined : orbPosition.y + ASSISTANT_ORB_SIZE + ASSISTANT_PANEL_GAP,
      bottom: opensAbove ? viewportSize.height - orbPosition.y + ASSISTANT_PANEL_GAP : undefined,
      width: panelWidth,
      maxHeight: Math.min(ASSISTANT_PANEL_HEIGHT, Math.max(260, availableHeight))
    };
  }, [orbPosition.x, orbPosition.y, viewportSize.height, viewportSize.width]);

  function saveOrbPosition(position: AssistantOrbPosition) {
    try {
      window.localStorage.setItem(ASSISTANT_ORB_POSITION_KEY, JSON.stringify(position));
    } catch {
      // Position persistence is best effort; dragging should still work without storage.
    }
  }

  function handleOrbPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: orbPosition.x,
      originY: orbPosition.y,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleOrbPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.moved = true;
    }

    setOrbPosition(
      clampOrbPosition(
        {
          x: dragState.originX + deltaX,
          y: dragState.originY + deltaY
        },
        viewportSize.width,
        viewportSize.height
      )
    );
  }

  function handleOrbPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const nextPosition = clampOrbPosition(
      {
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY
      },
      viewportSize.width,
      viewportSize.height
    );

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setOrbPosition(nextPosition);
    saveOrbPosition(nextPosition);

    if (dragState.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  }

  function handleOrbClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    setIsOpen(!isOpen);
  }

  return (
    <>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              left: panelPosition.left,
              top: panelPosition.top,
              bottom: panelPosition.bottom,
              width: panelPosition.width,
              maxHeight: panelPosition.maxHeight
            }}
            className={cn(
              'fixed z-50 flex flex-col overflow-hidden',
              'rounded-2xl border border-white/10 bg-zinc-950/90 text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.72)] backdrop-blur-xl'
            )}
          >
            <div className='flex items-center justify-between border-b border-white/10 px-4 py-3'>
              <div className='flex items-center gap-3'>
                <div className='flex size-8 items-center justify-center overflow-hidden rounded-full border border-white/10'>
                  <GradientOrb config={{ background: '#09090b', hue: 18, rotationSpeed: 0.45 }} />
                </div>
                <div className='min-w-0'>
                  <div className='text-sm font-medium text-white'>知衡助手</div>
                  <div className='text-xs text-white/45'>
                    {isLoading || hasRunningTools ? '正在处理请求' : '企业 AI 工作助手'}
                  </div>
                </div>
              </div>
              <div className='flex items-center gap-1.5'>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={handleNewChat}
                  title='新对话'
                  disabled={isLoading}
                  className='text-white/60 hover:bg-white/10 hover:text-white'
                >
                  <Icons.add className='size-4' />
                  <span className='sr-only'>新对话</span>
                </Button>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => setIsOpen(false)}
                  title='关闭'
                  className='text-white/60 hover:bg-white/10 hover:text-white'
                >
                  <X className='size-4' />
                  <span className='sr-only'>关闭</span>
                </Button>
              </div>
            </div>

            <ChatMessages
              messages={chatMessages}
              autoPlay={false}
              showHeader={false}
              showInput={false}
              showReplay={false}
              isTyping={isLoading && !messages[messages.length - 1]?.content}
              className='min-h-0 flex-1 rounded-none border-0 bg-transparent shadow-none'
            />

            {toolStatuses.length > 0 ? (
              <div className='border-t border-white/10 px-4 py-2'>
                <ToolStatusList statuses={toolStatuses} />
              </div>
            ) : null}

            {pendingVideoPlan ? (
              <div className='border-t border-white/10 px-4 py-3'>
                <div className='rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs'>
                  <div className='font-medium text-white'>已生成剪辑方案</div>
                  <div className='mt-1 text-white/55'>
                    {pendingVideoPlan.title} · 素材覆盖率{' '}
                    {pendingVideoPlan.coverage.highQualityCoverageRate}% ·{' '}
                    {pendingVideoPlan.timeline.length} 个片段 · {pendingVideoPlan.warnings.length}{' '}
                    条提醒
                  </div>
                  <div className='mt-3 grid gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className='border-white/10 bg-white/[0.03] text-white hover:bg-white/10'
                      onClick={() =>
                        addMessage({
                          id: generateId(),
                          role: 'assistant',
                          content: [
                            `剪辑方案：${pendingVideoPlan.title}`,
                            `主题：${pendingVideoPlan.topic}`,
                            `素材覆盖率：${pendingVideoPlan.coverage.highQualityCoverageRate}%`,
                            `片段数量：${pendingVideoPlan.timeline.length}`,
                            pendingVideoPlan.warnings.length > 0
                              ? `提醒：${pendingVideoPlan.warnings.join('；')}`
                              : '提醒：暂无'
                          ].join('\n'),
                          createdAt: Date.now(),
                          status: 'done'
                        })
                      }
                    >
                      查看剪辑方案
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className='border-white/10 bg-white/[0.03] text-white hover:bg-white/10'
                      onClick={() => {
                        setInputValue('请基于当前剪辑方案继续修改：');
                        textareaRef.current?.focus();
                      }}
                    >
                      修改方案
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      disabled={savingDraft}
                      onClick={() => void savePendingPlanAsDraft()}
                    >
                      {savingDraft ? '正在保存...' : '保存为草稿并打开高级编辑'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className='border-t border-white/10 p-3'>
              <div className='rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 transition-colors focus-within:border-white/25'>
                <Textarea
                  ref={textareaRef}
                  className='min-h-[68px] resize-none border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none placeholder:text-white/35 focus-visible:ring-0'
                  placeholder='输入你的问题，Enter 发送，Shift+Enter 换行...'
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                />
                <div className='mt-2 flex items-center justify-between gap-2'>
                  <span className='text-xs text-white/40'>
                    {isLoading ? '生成中...' : '按 Enter 发送'}
                  </span>
                  <Button
                    size='icon-sm'
                    disabled={isLoading || !inputValue.trim()}
                    onClick={() => void send()}
                    className='rounded-lg'
                  >
                    <Icons.send className='size-4' />
                    <span className='sr-only'>发送</span>
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        ref={orbRef}
        onClick={handleOrbClick}
        onPointerDown={handleOrbPointerDown}
        onPointerMove={handleOrbPointerMove}
        onPointerUp={handleOrbPointerUp}
        onPointerCancel={handleOrbPointerUp}
        style={{
          left: orbPosition.x,
          top: orbPosition.y
        }}
        className={cn(
          'fixed z-50 size-[73px] touch-none cursor-grab overflow-hidden rounded-full border-0 bg-transparent shadow-none transition-transform hover:scale-105 active:cursor-grabbing',
          'focus:outline-none'
        )}
        aria-label={isOpen ? '关闭知衡助手' : '打开知衡助手'}
      >
        <GradientOrb
          className='mix-blend-screen'
          config={{
            background: 'transparent',
            hue: isOpen ? 34 : 0,
            rotationSpeed: isOpen ? 0.62 : 0.38,
            noiseScale: 0.7,
            innerRadius: 0.08
          }}
        />
      </button>
    </>
  );
}

function ToolStatusList({
  statuses
}: {
  statuses: Array<{ displayName: string; status: 'running' | 'completed' }>;
}) {
  if (statuses.length === 0) return null;

  return (
    <div className='flex flex-col gap-1.5'>
      {statuses.map((status, index) => (
        <div key={`${status.displayName}-${index}`} className='flex items-center gap-2 text-xs'>
          {status.status === 'running' ? (
            <Icons.spinner className='size-3.5 animate-spin text-indigo-300' />
          ) : (
            <Icons.check className='size-3.5 text-emerald-400' />
          )}
          <span className={cn(status.status === 'running' ? 'text-white/80' : 'text-white/45')}>
            {status.status === 'running' ? '正在' : '已完成'}
            {status.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}
