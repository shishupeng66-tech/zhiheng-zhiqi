import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSystemAsset } from '@/lib/system-assets';

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

/** 旧默认 Skill 目录（保留为 fallback，避免迁移后 skill 加载为空）。 */
const LEGACY_SKILLS_DIR = path.join(process.cwd(), 'skills', 'video-editing');

/**
 * 项目内置三层模板 Skill 目录（正式，随项目版本走）。
 * 产品 Skill 固定在项目内部，不依赖客户 Obsidian；Obsidian 06 副本仅作企业可见说明。
 */
const PROJECT_TEMPLATE_SKILLS_DIR = path.join(process.cwd(), 'skills', 'template-editing');

/** 判断目录下是否存在含 skill.json 的子目录。 */
async function dirHasSkillJson(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const withJson = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          try {
            await fs.access(path.join(dir, e.name, 'skill.json'));
            return true;
          } catch {
            return false;
          }
        })
    );
    return withJson.some(Boolean);
  } catch {
    return false;
  }
}

/**
 * 解析 Editing Skill 根目录（优先级）：
 * 1. 项目内置三层模板 Skill（skills/template-editing）—— 产品 Skill 正式源，随版本走
 * 2. resolveSystemAsset('editingSkillRoot')（DB/ENV 可覆盖，指向系统资产 Skills 目录）
 * 3. 旧默认目录 skills/video-editing（legacy fallback）
 */
async function resolveSkillsDir(): Promise<string> {
  // 1) 项目内置三层模板 Skill（正式）
  if (await dirHasSkillJson(PROJECT_TEMPLATE_SKILLS_DIR)) {
    return PROJECT_TEMPLATE_SKILLS_DIR;
  }
  // 2) editingSkillRoot（DB/ENV 覆盖 / 系统资产 Skills 目录）
  try {
    const r = await resolveSystemAsset('editingSkillRoot');
    if (r.exists && (await dirHasSkillJson(r.path))) return r.path;
  } catch {
    /* 忽略，回退 */
  }
  // 3) legacy
  return LEGACY_SKILLS_DIR;
}

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
    const skillsDir = await resolveSkillsDir();
    const dirStat = await fs.stat(skillsDir);
    if (!dirStat.isDirectory()) {
      return [];
    }

    // 缓存有效
    if (cachedSkills && cacheMtime === dirStat.mtimeMs) {
      return cachedSkills;
    }

    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory());

    const skills: VideoEditingSkill[] = [];

    for (const dir of skillDirs) {
      const skillPath = path.join(skillsDir, dir.name, 'skill.json');
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
