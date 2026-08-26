import fs from 'node:fs/promises';
import path from 'node:path';

// Skill 定义类型（与 schema.v1.json 对齐）
export interface VideoEditingSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'draft' | 'testing' | 'published';
  version: string;
  content: {
    contentType: string;
    targetAudience?: string;
    targetPlatform?: string;
    durationRange?: string;
  };
  script: {
    systemPrompt?: string | null;
    scriptPrompt?: string | null;
    hookRules?: string[];
    structureRules?: string[];
    toneRules?: string[];
    ctaRules?: string[];
  };
  assets: {
    assetSelectionRules?: string[];
    preferredCategories?: string[];
    forbiddenCategories?: string[];
    reuseRules?: string[];
    orientationRules?: string[];
  };
  shots: {
    shotRules?: string[];
    clipDurationRules?: string[];
    pacingRules?: string[];
    transitionRules?: string[];
  };
  voice: {
    voiceStyle?: string | null;
    voiceRate?: string | null;
    emotionRules?: string[];
  };
  subtitle: {
    subtitleStyle?: string | null;
    subtitlePosition?: string | null;
    subtitleSize?: string | null;
    highlightRules?: string[];
  };
  bgm: {
    bgmStyle?: string | null;
    bgmVolume?: string | null;
    bgmRules?: string[];
  };
  review: {
    referenceVideoIds?: string[];
    qualityRules?: string[];
    failureRules?: string[];
    acceptanceRules?: string[];
  };
}

// 内存缓存
let cachedSkills: VideoEditingSkill[] | null = null;
let cacheMtime: number = 0;
let cachePromise: Promise<VideoEditingSkill[]> | null = null;

const SKILLS_DIR = path.join(process.cwd(), 'skills', 'video-editing');

/**
 * 列出所有视频剪辑 Skill
 * 带内存缓存，目录 mtime 变化自动刷新
 */
export async function listVideoEditingSkills(): Promise<VideoEditingSkill[]> {
  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = loadAllSkills().finally(() => {
    cachePromise = null;
  });

  return cachePromise;
}

/**
 * 根据 ID 获取单个 Skill
 */
export async function getVideoEditingSkill(id: string): Promise<VideoEditingSkill | null> {
  const skills = await listVideoEditingSkills();
  return skills.find((s) => s.id === id) || null;
}

/**
 * 根据 contentType 获取 Skill
 */
export async function getSkillByContentType(
  contentType: string
): Promise<VideoEditingSkill | null> {
  const skills = await listVideoEditingSkills();
  return skills.find((s) => s.content.contentType === contentType) || null;
}

async function loadAllSkills(): Promise<VideoEditingSkill[]> {
  try {
    const dirStat = await fs.stat(SKILLS_DIR);
    if (!dirStat.isDirectory()) {
      return [];
    }

    // 缓存有效
    if (cachedSkills && cacheMtime === dirStat.mtimeMs) {
      return cachedSkills;
    }

    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory());

    const skills: VideoEditingSkill[] = [];

    for (const dir of skillDirs) {
      const skillPath = path.join(SKILLS_DIR, dir.name, 'skill.json');
      try {
        const content = await fs.readFile(skillPath, 'utf-8');
        const skill = JSON.parse(content) as VideoEditingSkill;
        if (skill.id && skill.name) {
          skills.push(skill);
        }
      } catch {
        // 单个 skill 加载失败，跳过
      }
    }

    cachedSkills = skills;
    cacheMtime = dirStat.mtimeMs;
    return skills;
  } catch {
    // 目录不存在或其他错误，返回空数组
    return [];
  }
}

/**
 * 强制刷新缓存
 */
export function refreshSkillCache(): void {
  cachedSkills = null;
  cacheMtime = 0;
  cachePromise = null;
}
