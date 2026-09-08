'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatMessagesProps {
  messages?: ChatMessage[];
  autoPlay?: boolean;
  autoPlayDelay?: number;
  typingDuration?: number;
  showReplay?: boolean;
  interactive?: boolean;
  className?: string;
  isTyping?: boolean;
  showHeader?: boolean;
  showInput?: boolean;
}

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    sender: 'assistant',
    content: "Hello! I'm your Nexus AI assistant. How can I help you build something amazing today?"
  },
  {
    id: '2',
    sender: 'user',
    content: 'I want to create a beautiful landing page for my SaaS product.'
  },
  {
    id: '3',
    sender: 'assistant',
    content:
      'Great choice! Nexus UI has everything you need - animated components, premium styling, and easy integration.'
  }
];

function TypingIndicator({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'inline-flex items-center gap-1 rounded-2xl rounded-tl-md border border-white/10 bg-zinc-800/90 px-4 py-3 backdrop-blur-sm',
        className
      )}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className='h-2 w-2 rounded-full bg-white/60'
          animate={{ opacity: [0.4, 1, 0.4], y: [0, -4, 0] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut'
          }}
        />
      ))}
    </motion.div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.sender === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96, x: isUser ? 20 : -20 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('flex min-w-0 items-end gap-2', isUser && 'flex-row-reverse')}>
        {!isUser && (
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600'>
            <Sparkles className='size-4 text-white' />
          </div>
        )}
        <motion.div
          layout
          className={cn(
            'max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'rounded-tr-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_24px_-4px_rgba(99,102,241,0.4)]'
              : 'rounded-tl-md border border-white/10 bg-zinc-800/90 text-zinc-100 backdrop-blur-sm shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3)]'
          )}
          whileHover={{ scale: 1.01, y: -1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {message.content}
        </motion.div>
      </div>
    </motion.div>
  );
}

export function ChatMessages({
  messages = DEFAULT_MESSAGES,
  autoPlay: _autoPlay = true,
  autoPlayDelay: _autoPlayDelay = 1800,
  typingDuration: _typingDuration = 1400,
  showReplay = true,
  interactive = false,
  className,
  isTyping = false,
  showHeader = true,
  showInput = true
}: ChatMessagesProps) {
  const [inputValue, setInputValue] = useState('');
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayedMessages = interactive ? [...messages, ...localMessages] : messages;
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  });

  const handleSend = () => {
    if (!inputValue.trim() || !interactive) return;

    const newMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: inputValue.trim()
    };

    setLocalMessages((prev) => [...prev, newMessage]);
    setInputValue('');

    setTimeout(() => {
      const assistantReply: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        content:
          "That's a great question! Let me help you explore the best options for your use case."
      };
      setLocalMessages((prev) => [...prev, assistantReply]);
    }, 900);
  };

  const replay = () => {
    setLocalMessages([]);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.5)]',
        className
      )}
    >
      {showHeader && (
        <div className='flex items-center justify-between border-b border-white/5 px-4 py-3'>
          <div className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600'>
              <Sparkles className='size-4 text-white' />
            </div>
            <div>
              <h3 className='text-sm font-medium text-white'>Nexus AI</h3>
              <p className='text-xs text-white/40'>Always here to help</p>
            </div>
          </div>
          {showReplay && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={replay}
              aria-label='Replay conversation'
              className='flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white'
            >
              <RotateCcw className='size-3.5' />
              Replay
            </motion.button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        role='log'
        aria-label='Chat messages'
        aria-live='polite'
        className='flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10'
      >
        {displayedMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        <AnimatePresence>{isTyping && <TypingIndicator />}</AnimatePresence>
      </div>

      {showInput && (
        <div className='border-t border-white/5 p-3'>
          <div className='flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-800/50 px-4 py-2 backdrop-blur-sm focus-within:border-white/20 focus-within:bg-zinc-800/70'>
            <input
              type='text'
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!interactive}
              placeholder={interactive ? 'Ask Nexus AI...' : 'Demo mode - replay to watch again'}
              aria-label={interactive ? 'Type your message' : 'Chat input (demo mode)'}
              className='flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed'
            />
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={handleSend}
              disabled={!interactive || !inputValue.trim()}
              aria-label='Send message'
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                interactive && inputValue.trim()
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'bg-white/5 text-white/30'
              )}
            >
              <Send className='size-4' />
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatMessages;
