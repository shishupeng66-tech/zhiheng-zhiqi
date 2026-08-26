import { create } from 'zustand';
import type { AgentMessage, AgentEntityContext } from '@/lib/agent/types';

/** Tool 状态项 */
export interface ToolStatusItem {
  id: string;
  toolName: string;
  displayName: string;
  status: 'running' | 'completed';
}

interface AssistantState {
  // 面板状态
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggle: () => void;

  // 消息
  messages: AgentMessage[];
  isLoading: boolean;
  inputValue: string;

  // Tool 状态列表（当前正在进行 / 刚完成的工具调用）
  toolStatuses: ToolStatusItem[];

  // Actions
  setInputValue: (value: string) => void;
  setIsLoading: (loading: boolean) => void;
  addMessage: (message: AgentMessage) => void;
  updateMessage: (id: string, updates: Partial<AgentMessage>) => void;
  appendToMessage: (id: string, chunk: string) => void;
  clearMessages: () => void;
  resetConversation: () => void;

  // Tool 状态操作
  addToolStatus: (status: ToolStatusItem) => void;
  updateToolStatus: (id: string, updates: Partial<ToolStatusItem>) => void;
  clearToolStatuses: () => void;

  // Context
  currentRoute: string;
  currentEntity: AgentEntityContext | null;
  setCurrentRoute: (route: string) => void;
  setCurrentEntity: (entity: AgentEntityContext | null) => void;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const WELCOME_MESSAGE: AgentMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是知衡助手。有什么可以帮你的？',
  createdAt: Date.now(),
  status: 'done'
};

export const useAssistantStore = create<AssistantState>()((set, get) => ({
  // 面板状态
  isOpen: false,
  setIsOpen: (open) => set({ isOpen: open }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),

  // 消息
  messages: [WELCOME_MESSAGE],
  isLoading: false,
  inputValue: '',
  toolStatuses: [],

  // Actions
  setInputValue: (value) => set({ inputValue: value }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m))
    })),

  appendToMessage: (id, chunk) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m))
    })),

  clearMessages: () => set({ messages: [] }),

  resetConversation: () =>
    set({
      messages: [
        {
          ...WELCOME_MESSAGE,
          id: generateId(),
          createdAt: Date.now()
        }
      ],
      isLoading: false,
      inputValue: '',
      toolStatuses: []
    }),

  // Tool 状态操作
  addToolStatus: (status) =>
    set((state) => ({
      toolStatuses: [...state.toolStatuses, status]
    })),

  updateToolStatus: (id, updates) =>
    set((state) => ({
      toolStatuses: state.toolStatuses.map((s) => (s.id === id ? { ...s, ...updates } : s))
    })),

  clearToolStatuses: () => set({ toolStatuses: [] }),

  // Context
  currentRoute: '',
  currentEntity: null,
  setCurrentRoute: (route) => set({ currentRoute: route }),
  setCurrentEntity: (entity) => set({ currentEntity: entity })
}));
