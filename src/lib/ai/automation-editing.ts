import { chat } from '@/lib/ai';

type VideoCopyInput = {
  topic: string;
  style?: string;
  language?: string;
  existingScript?: string;
};

export type VideoCopyResult = {
  script: string;
  keywords: string[];
};

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('AI 返回内容不是有效 JSON');
  }
  return JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeVideoCopy(text: string): VideoCopyResult {
  const data = extractJsonObject(text);
  const script = typeof data.script === 'string' ? data.script.trim() : '';
  const keywords = normalizeKeywords(data.keywords);
  if (!script || keywords.length === 0) {
    throw new Error('AI 返回缺少 script 或 keywords');
  }
  return { script, keywords };
}

function normalizeKeywordResult(text: string) {
  const data = extractJsonObject(text);
  const keywords = normalizeKeywords(data.keywords);
  if (keywords.length === 0) {
    throw new Error('AI 返回缺少 keywords');
  }
  return { keywords };
}

export async function generateAutomationVideoCopy(input: VideoCopyInput): Promise<VideoCopyResult> {
  const topic = input.topic.trim();
  const existingScript = input.existingScript?.trim();
  const response = await chat([
    {
      role: 'system',
      content:
        '你是知衡智企企业短视频文案助手。只返回严格 JSON，不要 Markdown。字段必须是 {"script": string, "keywords": string[]}。文案用于制造企业宣传短视频，语言清晰、可信、适合配音。关键词用于后续素材匹配。'
    },
    {
      role: 'user',
      content: JSON.stringify({
        topic,
        style: input.style || '企业宣传短视频',
        language: input.language || '自动检测',
        existingScript: existingScript || '',
        requirements: [
          'script 控制在 80 到 180 个中文字符',
          'keywords 返回 5 到 8 个短关键词',
          '不要出现底层模型、供应商、API 等技术信息'
        ]
      })
    }
  ]);
  return normalizeVideoCopy(response);
}

export async function generateAutomationVideoKeywords(script: string) {
  const response = await chat([
    {
      role: 'system',
      content:
        '你是知衡智企视频素材匹配关键词助手。只返回严格 JSON，不要 Markdown。字段必须是 {"keywords": string[]}。关键词要适合企业素材检索、镜头匹配和短视频生成。'
    },
    {
      role: 'user',
      content: JSON.stringify({
        script,
        requirements: ['返回 5 到 8 个关键词', '关键词尽量短，不要句子']
      })
    }
  ]);
  return normalizeKeywordResult(response);
}
