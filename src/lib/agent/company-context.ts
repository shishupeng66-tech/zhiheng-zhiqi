import fs from 'node:fs/promises';
import path from 'node:path';
import { getPath } from '@/lib/storage';
import type { CompanyContext } from './types';

// 内存缓存
let cachedContext: CompanyContext | null = null;
let cachedMtime: number = 0;
let cachePromise: Promise<CompanyContext | null> | null = null;

const JSON_RELATIVE_PATH = ['视频内容策略', '01-企业定位', 'agent-company-context.json'];
const MARKDOWN_RELATIVE_DIR = ['视频内容策略', '01-企业定位'];

/**
 * 获取企业定位上下文（JSON 优先，Markdown 兜底）
 * 带内存缓存，mtime 变化自动刷新
 */
export async function loadCompanyContext(): Promise<CompanyContext | null> {
  // 如果有正在进行的加载，复用 Promise 避免重复读取
  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = loadCompanyContextInternal().finally(() => {
    // 加载完成后清除 Promise 缓存（保留数据缓存）
    cachePromise = null;
  });

  return cachePromise;
}

async function loadCompanyContextInternal(): Promise<CompanyContext | null> {
  try {
    const knowledgeRoot = await getPath('knowledge');
    const jsonPath = path.join(knowledgeRoot, ...JSON_RELATIVE_PATH);

    // 检查 JSON 文件是否存在
    try {
      const stat = await fs.stat(jsonPath);
      const mtime = stat.mtimeMs;

      // 缓存有效，直接返回
      if (cachedContext && cachedMtime === mtime) {
        return cachedContext;
      }

      // 读取并解析 JSON
      const content = await fs.readFile(jsonPath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<CompanyContext>;

      const context: CompanyContext = {
        version: parsed.version ?? 1,
        company: parsed.company,
        brand: parsed.brand,
        audience: parsed.audience,
        products: parsed.products,
        contentStrategy: parsed.contentStrategy,
        voiceStyle: parsed.voiceStyle,
        guardrails: parsed.guardrails
      };

      cachedContext = context;
      cachedMtime = mtime;
      return context;
    } catch {
      // JSON 不存在或解析失败，降级尝试 Markdown
      return loadMarkdownFallback(knowledgeRoot);
    }
  } catch {
    // StorageService 或其他错误，静默返回 null
    return null;
  }
}

/**
 * 降级：从 Markdown 文件加载（纯文本，不解析结构）
 * 只在 JSON 不存在时使用
 */
async function loadMarkdownFallback(knowledgeRoot: string): Promise<CompanyContext | null> {
  try {
    const mdDir = path.join(knowledgeRoot, ...MARKDOWN_RELATIVE_DIR);
    const stat = await fs.stat(mdDir);

    if (!stat.isDirectory()) {
      return null;
    }

    const files = await fs.readdir(mdDir);
    const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('README')).sort();

    if (mdFiles.length === 0) {
      return null;
    }

    // 读取所有 Markdown，拼接成 introduction 字段
    const sections: string[] = [];
    for (const file of mdFiles) {
      try {
        const content = await fs.readFile(path.join(mdDir, file), 'utf-8');
        const title = file.replace(/^\d+-/, '').replace(/\.md$/, '');
        sections.push(`## ${title}\n\n${content.trim()}`);
      } catch {
        // 单个文件读取失败，跳过
      }
    }

    if (sections.length === 0) {
      return null;
    }

    const context: CompanyContext = {
      version: 0, // 0 表示 Markdown 降级模式
      company: {
        introduction: sections.join('\n\n')
      }
    };

    // Markdown 模式不做精细缓存，每次重新读（文件少，开销小）
    cachedContext = context;
    cachedMtime = stat.mtimeMs;
    return context;
  } catch {
    return null;
  }
}

/**
 * 将企业定位上下文转换为 system prompt 文本片段
 */
export function formatCompanyContextPrompt(context: CompanyContext | null): string {
  if (!context) return '';

  const lines: string[] = [];
  lines.push('【企业定位上下文】');

  if (context.company) {
    if (context.company.name) {
      lines.push(`企业名称：${context.company.name}`);
    }
    if (context.company.industry) {
      lines.push(`所属行业：${context.company.industry}`);
    }
    if (context.company.businessScope) {
      lines.push(`业务范围：${context.company.businessScope}`);
    }
    if (context.company.introduction) {
      lines.push(`企业简介：${context.company.introduction}`);
    }
  }

  if (context.brand) {
    if (context.brand.positioning) {
      lines.push(`品牌定位：${context.brand.positioning}`);
    }
    if (context.brand.slogan) {
      lines.push(`品牌口号：${context.brand.slogan}`);
    }
    if (context.brand.tone) {
      lines.push(`品牌调性：${context.brand.tone}`);
    }
  }

  if (context.audience) {
    if (context.audience.primary) {
      lines.push(`主要受众：${context.audience.primary}`);
    }
    if (context.audience.secondary) {
      lines.push(`次要受众：${context.audience.secondary}`);
    }
  }

  if (context.products && context.products.length > 0) {
    lines.push('产品矩阵：');
    for (const p of context.products) {
      const points = p.sellingPoints?.join('、') || '';
      lines.push(`  - ${p.name}${points ? `（${points}）` : ''}`);
    }
  }

  if (context.contentStrategy) {
    if (context.contentStrategy.directions?.length) {
      lines.push(`内容方向：${context.contentStrategy.directions.join('、')}`);
    }
    if (context.contentStrategy.principles?.length) {
      lines.push(`选题原则：${context.contentStrategy.principles.join('、')}`);
    }
  }

  if (context.voiceStyle) {
    if (context.voiceStyle.tone) {
      lines.push(`语气风格：${context.voiceStyle.tone}`);
    }
    if (context.voiceStyle.vocabulary?.length) {
      lines.push(`常用词汇：${context.voiceStyle.vocabulary.join('、')}`);
    }
    if (context.voiceStyle.forbiddenWords?.length) {
      lines.push(`禁忌词汇：${context.voiceStyle.forbiddenWords.join('、')}`);
    }
  }

  // Guardrails
  const forbidden = context.guardrails?.forbiddenFacts;
  if (forbidden && forbidden.length > 0) {
    lines.push('');
    lines.push('【企业事实 Guardrails】');
    lines.push('以下信息缺失时，不得自行推断或编造：');
    for (const item of forbidden) {
      lines.push(`- ${item}`);
    }
    lines.push(
      '企业一般性内容可以使用常识性表达，但涉及上述企业专有事实时，必须明确说明"需要确认"或"以官方数据为准"，不得虚构。'
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 强制刷新缓存
 */
export function refreshCompanyContextCache(): void {
  cachedContext = null;
  cachedMtime = 0;
  cachePromise = null;
}
