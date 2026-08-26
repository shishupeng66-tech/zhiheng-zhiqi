// Agent 相关类型定义

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  status?: 'sending' | 'streaming' | 'done' | 'error';
}

export interface AgentEntityContext {
  type: 'customer' | 'product' | 'video_task' | 'workspace' | null;
  id: string | null;
  name?: string;
  data?: Record<string, unknown>;
}

export interface AgentContext {
  route: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
  workspace: {
    id: string;
    slug: string;
    name: string;
  } | null;
  entity: AgentEntityContext | null;
}

export interface CompanyContext {
  version: number;
  company?: {
    name?: string;
    industry?: string;
    businessScope?: string;
    introduction?: string;
  };
  brand?: {
    positioning?: string;
    slogan?: string;
    tone?: string;
  };
  audience?: {
    primary?: string;
    secondary?: string;
  };
  products?: Array<{
    name: string;
    sellingPoints?: string[];
  }>;
  contentStrategy?: {
    directions?: string[];
    principles?: string[];
  };
  voiceStyle?: {
    tone?: string;
    vocabulary?: string[];
    forbiddenWords?: string[];
  };
  guardrails?: {
    forbiddenFacts?: string[];
  };
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  contentType: string;
  version: string;
  systemPrompt?: string;
  tools?: string[];
  parameters?: Record<string, unknown>;
}
