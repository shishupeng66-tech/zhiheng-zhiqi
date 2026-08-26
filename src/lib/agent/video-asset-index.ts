import fs from 'node:fs/promises';
import path from 'node:path';
import { getPath } from '@/lib/storage';

// ============================================================
// 类型定义
// ============================================================

/** 时间线段（timeline segment） */
export interface TimelineSegment {
  start: number;
  end: number;
  content: string;
  action: string;
  subjects: string[];
  shotType: string;
  cameraMovement: string;
  cameraAngle: string;
  visualQuality: string;
  stability: string;
  clarity: string;
  subjectCompleteness: string;
  usable: boolean;
  usageRoles: string[];
  topicTags: string[];
  semanticMatches: string[];
  recommendedClipLength: { min: number; max: number };
  recommendedSkills: string[];
  avoidUses: string[];
  subjectPosition: string;
  cropSafety: string;
  verticalCropSuitability: string;
  notes?: string;
}

/** 推荐剪辑点 */
export interface RecommendedCut {
  start: number;
  end: number;
  reason: string;
  bestFor: string[];
  usageRoles: string[];
  priority: 'high' | 'medium' | 'low';
}

/** 避免剪辑点 */
export interface AvoidCut {
  start: number;
  end: number;
  reason: string;
}

/** 素材元数据 */
export interface VideoAsset {
  id: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  sourceCategory: string;
  normalizedCategory: string;
  durationSeconds: number;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait' | 'square';
  fps: number;
  fileSize: number;
  hash: string;
  overallContent: string;
  overallCameraAngle: string;
  overallScene: string;
  people: string[];
  products: string[];
  equipment: string[];
  actions: string[];
  environment: string[];
  sceneTags: string[];
  topicTags: string[];
  recommendedSkills: string[];
  usageRoles: string[];
  qualityLevel: string;
  preferred: boolean;
  duplicateGroup: string | null;
  cropSafety: string;
  verticalCropSuitability: string;
  notes: string;
  timelineSegments: TimelineSegment[];
  recommendedCuts: RecommendedCut[];
  avoidCuts: AvoidCut[];
  semanticMatches: string[];
  storyPotential: Array<{ topic: string; contentType: string }>;
}

/** 索引文件顶层结构 */
interface AssetIndexFile {
  version: string;
  generatedAt: string;
  assetsRoot: string;
  sourceIndex: string;
  count: number;
  assets: VideoAsset[];
}

// ============================================================
// 搜索参数
// ============================================================

export interface SearchVideoAssetsParams {
  /** 搜索关键词/查询文本 */
  query?: string;
  /** 内容类型过滤（如 老板IP、知识科普 等） */
  contentType?: string;
  /** 适用角色过滤（如 Hook、正文B-roll、转场 等） */
  usageRoles?: string[];
  /** 主题标签过滤 */
  topicTags?: string[];
  /** 语义匹配关键词（匹配 semanticMatches 字段） */
  semanticMatches?: string[];
  /** 横竖屏过滤：landscape / portrait / 不传则不限 */
  orientation?: 'landscape' | 'portrait';
  /** 仅返回 preferred = true 的素材 */
  preferredOnly?: boolean;
  /** 同一 duplicateGroup 只返回一个（默认 true） */
  excludeDuplicateGroups?: boolean;
  /** 最小片段时长（秒） */
  minClipDuration?: number;
  /** 最大片段时长（秒） */
  maxClipDuration?: number;
  /** 返回结果数量上限，默认 10 */
  limit?: number;
}

// ============================================================
// 搜索结果（秒级片段）
// ============================================================

export interface VideoClipResult {
  /** 素材 ID */
  assetId: string;
  /** 文件名 */
  fileName: string;
  /** 相对路径（相对于素材根目录） */
  relativePath: string;
  /** 分类 */
  category: string;
  /** 片段起始时间（秒） */
  segmentStart: number;
  /** 片段结束时间（秒） */
  segmentEnd: number;
  /** 推荐起始时间（秒）—— 基于 recommendedCuts 优化 */
  recommendedStart: number;
  /** 推荐结束时间（秒） */
  recommendedEnd: number;
  /** 片段时长（秒） */
  clipDuration: number;
  /** 内容描述 */
  content: string;
  /** 主要动作 */
  action: string;
  /** 景别 */
  shotType: string;
  /** 拍摄角度 */
  cameraAngle: string;
  /** 镜头运动 */
  cameraMovement: string;
  /** 主题标签 */
  topicTags: string[];
  /** 语义匹配描述 */
  semanticMatches: string[];
  /** 适用角色 */
  usageRoles: string[];
  /** 推荐 Skill */
  recommendedSkills: string[];
  /** 画质等级 */
  visualQuality: string;
  /** 裁剪安全性 */
  cropSafety: string;
  /** 横竖屏 */
  orientation: 'landscape' | 'portrait' | 'square';
  /** 重复素材组 ID */
  duplicateGroup: string | null;
  /** 是否为优选素材 */
  preferred: boolean;
  /** 匹配分数 0-1 */
  matchScore: number;
  /** 匹配理由（可解释） */
  matchReasons: string[];
}

// ============================================================
// 内存缓存
// ============================================================

let cachedIndex: VideoAsset[] | null = null;
let cacheMtime: number = 0;
let cachePromise: Promise<VideoAsset[]> | null = null;
const INDEX_FILENAME = 'video-assets-detailed.json';

// ============================================================
// 公共 API
// ============================================================

/**
 * 加载素材索引（带内存缓存，mtime 变化自动刷新）
 */
export async function loadVideoAssetIndex(): Promise<VideoAsset[]> {
  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = loadIndexInternal().finally(() => {
    cachePromise = null;
  });

  return cachePromise;
}

/**
 * 搜索视频素材片段（秒级粒度）
 *
 * 搜索最小单位是 timelineSegments + recommendedCuts，
 * 不是整个视频文件。
 */
export async function searchVideoClips(
  params: SearchVideoAssetsParams
): Promise<VideoClipResult[]> {
  const assets = await loadVideoAssetIndex();
  const assetRoot = await getAssetsRootPath();

  // 1. 展开所有 segment（每个 segment 成为一个候选片段）
  const allClips: Array<{
    asset: VideoAsset;
    segment: TimelineSegment;
    recommendedCut?: RecommendedCut;
  }> = [];

  for (const asset of assets) {
    // 文件存在性校验
    const filePath = path.join(assetRoot, asset.relativePath);
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch {
      // 文件不存在，跳过
      console.warn(`[video-asset-index] 文件不存在，跳过: ${asset.relativePath}`);
      continue;
    }

    if (!fileExists) continue;

    for (const segment of asset.timelineSegments) {
      if (!segment.usable) continue;

      // 找到与该 segment 关联的最佳 recommendedCut
      const bestCut = findBestRecommendedCut(segment, asset.recommendedCuts);

      allClips.push({
        asset,
        segment,
        recommendedCut: bestCut
      });
    }
  }

  // 2. 过滤
  let filtered = allClips.filter(({ asset, segment }) => {
    // orientation 过滤
    if (params.orientation) {
      if (asset.orientation !== params.orientation) {
        // 横屏请求但素材是竖屏，或反之 —— 不直接排除，后面评分时降权
        // 但如果 cropSafety 差，就排除
        if (params.orientation === 'portrait' && asset.orientation === 'landscape') {
          if (segment.cropSafety !== 'good' && segment.verticalCropSuitability !== 'good') {
            return false;
          }
        }
      }
    }

    // preferredOnly 过滤
    if (params.preferredOnly && !asset.preferred) {
      return false;
    }

    // usageRoles 过滤（至少匹配一个）
    if (params.usageRoles && params.usageRoles.length > 0) {
      const hasMatch = params.usageRoles.some((role) =>
        segment.usageRoles.some((r) => r.includes(role) || role.includes(r))
      );
      if (!hasMatch) return false;
    }

    // topicTags 过滤（至少匹配一个）
    if (params.topicTags && params.topicTags.length > 0) {
      const hasMatch = params.topicTags.some((tag) =>
        segment.topicTags.some((t) => t.includes(tag) || t.includes(tag))
      );
      if (!hasMatch) return false;
    }

    // 时长过滤
    const duration = segment.end - segment.start;
    if (params.minClipDuration && duration < params.minClipDuration) {
      return false;
    }
    if (params.maxClipDuration && duration > params.maxClipDuration) {
      return false;
    }

    // 检查是否在 avoidCuts 范围内
    if (isInAvoidCuts(segment, asset.avoidCuts)) {
      return false;
    }

    return true;
  });

  // 3. 评分
  let scored = filtered.map(({ asset, segment, recommendedCut }) => {
    const { score, reasons } = calculateMatchScore(asset, segment, params);
    return { asset, segment, recommendedCut, score, reasons };
  });

  // 4. 排序（分数从高到低）
  scored.sort((a, b) => b.score - a.score);

  // 5. duplicateGroup 去重（同一组只保留最高分的）
  if (params.excludeDuplicateGroups !== false) {
    const seenGroups = new Set<string>();
    scored = scored.filter(({ asset }) => {
      if (!asset.duplicateGroup) return true;
      if (seenGroups.has(asset.duplicateGroup)) return false;
      seenGroups.add(asset.duplicateGroup);
      return true;
    });
  }

  // 6. 截取 limit
  const limit = params.limit ?? 10;
  const topResults = scored.slice(0, limit);

  // 7. 转换为输出格式
  return topResults.map(({ asset, segment, recommendedCut, score, reasons }) => {
    // 计算推荐起止时间：优先用 recommendedCut，否则用 segment
    let recStart = segment.start;
    let recEnd = segment.end;

    if (recommendedCut) {
      recStart = Math.max(segment.start, recommendedCut.start);
      recEnd = Math.min(segment.end, recommendedCut.end);
    }

    // 应用推荐剪辑长度约束
    const maxLen = segment.recommendedClipLength?.max ?? segment.end - segment.start;
    const minLen = segment.recommendedClipLength?.min ?? 0;
    const currentLen = recEnd - recStart;
    if (currentLen > maxLen) {
      recEnd = recStart + maxLen;
    }
    if (currentLen < minLen) {
      recEnd = Math.min(segment.end, recStart + minLen);
    }

    return {
      assetId: asset.id,
      fileName: asset.fileName,
      relativePath: asset.relativePath,
      category: asset.normalizedCategory,
      segmentStart: segment.start,
      segmentEnd: segment.end,
      recommendedStart: Math.round(recStart * 10) / 10,
      recommendedEnd: Math.round(recEnd * 10) / 10,
      clipDuration: Math.round((recEnd - recStart) * 10) / 10,
      content: segment.content,
      action: segment.action,
      shotType: segment.shotType,
      cameraAngle: segment.cameraAngle,
      cameraMovement: segment.cameraMovement,
      topicTags: segment.topicTags,
      semanticMatches: segment.semanticMatches,
      usageRoles: segment.usageRoles,
      recommendedSkills: segment.recommendedSkills,
      visualQuality: segment.visualQuality,
      cropSafety: segment.cropSafety,
      orientation: asset.orientation,
      duplicateGroup: asset.duplicateGroup,
      preferred: asset.preferred,
      matchScore: Math.round(score * 1000) / 1000,
      matchReasons: reasons
    };
  });
}

/**
 * 强制刷新缓存
 */
export function refreshAssetIndexCache(): void {
  cachedIndex = null;
  cacheMtime = 0;
  cachePromise = null;
}

// ============================================================
// 内部实现
// ============================================================

async function getAssetsRootPath(): Promise<string> {
  return getPath('assets');
}

async function loadIndexInternal(): Promise<VideoAsset[]> {
  try {
    const assetsRoot = await getAssetsRootPath();
    const indexPath = path.join(assetsRoot, INDEX_FILENAME);

    // 检查文件是否存在
    try {
      const stat = await fs.stat(indexPath);
      const mtime = stat.mtimeMs;

      // 缓存有效
      if (cachedIndex && cacheMtime === mtime) {
        return cachedIndex;
      }

      // 读取并解析
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = JSON.parse(content) as AssetIndexFile;

      cachedIndex = parsed.assets || [];
      cacheMtime = mtime;
      return cachedIndex;
    } catch {
      // 索引文件不存在或解析失败
      return [];
    }
  } catch {
    return [];
  }
}

/**
 * 找到与 segment 最匹配的 recommendedCut
 */
function findBestRecommendedCut(
  segment: TimelineSegment,
  cuts: RecommendedCut[]
): RecommendedCut | undefined {
  if (!cuts || cuts.length === 0) return undefined;

  // 找到与 segment 时间重叠最多的 cut
  let best: RecommendedCut | undefined;
  let bestOverlap = 0;

  for (const cut of cuts) {
    const overlapStart = Math.max(segment.start, cut.start);
    const overlapEnd = Math.min(segment.end, cut.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = cut;
    }
  }

  return best;
}

/**
 * 检查 segment 是否主要落在 avoidCuts 范围内
 */
function isInAvoidCuts(segment: TimelineSegment, avoidCuts: AvoidCut[]): boolean {
  if (!avoidCuts || avoidCuts.length === 0) return false;

  const segDuration = segment.end - segment.start;
  for (const avoid of avoidCuts) {
    const overlapStart = Math.max(segment.start, avoid.start);
    const overlapEnd = Math.min(segment.end, avoid.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    // 如果 segment 超过 50% 在 avoid 区域内，排除
    if (overlap > segDuration * 0.5) {
      return true;
    }
  }
  return false;
}

/**
 * 计算匹配分数（0-1）
 *
 * 综合维度：
 * - query 与 semanticMatches 匹配
 * - query 与 content 匹配
 * - query 与 topicTags 匹配
 * - usageRoles 匹配
 * - recommendedSkills 匹配
 * - orientation 匹配度
 * - visualQuality
 * - preferred 加分
 * - duplicateGroup 去重（在外部处理）
 * - clip 时长合理性
 */
function calculateMatchScore(
  asset: VideoAsset,
  segment: TimelineSegment,
  params: SearchVideoAssetsParams
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const weights = {
    semanticMatch: 0.3,
    contentMatch: 0.2,
    topicMatch: 0.15,
    usageRoleMatch: 0.15,
    skillMatch: 0.05,
    quality: 0.05,
    preferred: 0.05,
    orientation: 0.05
  };

  // 1. semanticMatches 匹配（最高权重）
  if (params.query) {
    const queryLower = params.query.toLowerCase();
    const semanticHits = segment.semanticMatches.filter(
      (s) => s.toLowerCase().includes(queryLower) || queryLower.includes(s.toLowerCase())
    );
    if (semanticHits.length > 0) {
      const semanticScore = Math.min(1, semanticHits.length * 0.4);
      score += weights.semanticMatch * semanticScore;
      reasons.push(`语义匹配：${semanticHits.slice(0, 2).join('、')}`);
    }

    // 2. content 匹配
    if (segment.content.toLowerCase().includes(queryLower)) {
      score += weights.contentMatch * 1.0;
      reasons.push('内容描述匹配');
    } else {
      // 部分关键词匹配
      const keywords = queryLower.split(/[\s，,。.！!？?]+/).filter((k) => k.length >= 2);
      let contentHits = 0;
      for (const kw of keywords) {
        if (segment.content.toLowerCase().includes(kw)) contentHits++;
      }
      if (contentHits > 0) {
        const contentScore = Math.min(1, contentHits / keywords.length);
        score += weights.contentMatch * contentScore * 0.5;
        reasons.push(`内容部分匹配（${contentHits}/${keywords.length} 关键词）`);
      }
    }

    // 3. topicTags 匹配
    const topicHits = segment.topicTags.filter(
      (t) => t.toLowerCase().includes(queryLower) || queryLower.includes(t.toLowerCase())
    );
    if (topicHits.length > 0) {
      const topicScore = Math.min(1, topicHits.length * 0.3);
      score += weights.topicMatch * topicScore;
      reasons.push(`主题标签匹配：${topicHits.slice(0, 2).join('、')}`);
    }
  } else {
    // 无 query 时，基础分
    score += (weights.semanticMatch + weights.contentMatch + weights.topicMatch) * 0.3;
  }

  // 4. usageRoles 匹配
  if (params.usageRoles && params.usageRoles.length > 0) {
    const roleHits = params.usageRoles.filter((role) =>
      segment.usageRoles.some(
        (r) =>
          r.toLowerCase().includes(role.toLowerCase()) ||
          role.toLowerCase().includes(r.toLowerCase())
      )
    );
    if (roleHits.length > 0) {
      const roleScore = Math.min(1, roleHits.length / params.usageRoles.length);
      score += weights.usageRoleMatch * roleScore;
      reasons.push(`用途匹配：${roleHits.join('、')}`);
    }
  } else {
    score += weights.usageRoleMatch * 0.3;
  }

  // 5. recommendedSkills 匹配（如果有 contentType 参数）
  if (params.contentType) {
    const skillHits = segment.recommendedSkills.filter(
      (s) => s.includes(params.contentType!) || params.contentType!.includes(s)
    );
    if (skillHits.length > 0) {
      score += weights.skillMatch * 1.0;
      reasons.push(`适合${params.contentType}风格`);
    }
  } else {
    score += weights.skillMatch * 0.5;
  }

  // 6. 画质加分
  if (segment.visualQuality === 'good') {
    score += weights.quality * 1.0;
    reasons.push('画质良好');
  } else if (segment.visualQuality === 'medium') {
    score += weights.quality * 0.6;
  } else {
    score += weights.quality * 0.3;
  }

  // 7. preferred 加分
  if (asset.preferred) {
    score += weights.preferred * 1.0;
    reasons.push('优选素材');
  } else {
    score += weights.preferred * 0.3;
  }

  // 8. orientation 匹配
  if (params.orientation) {
    if (asset.orientation === params.orientation) {
      score += weights.orientation * 1.0;
      reasons.push(params.orientation === 'portrait' ? '竖屏素材' : '横屏素材');
    } else {
      // 方向不同但 cropSafety 好，给部分分
      if (segment.cropSafety === 'good') {
        score += weights.orientation * 0.5;
        reasons.push('可裁剪适配');
      } else {
        score += weights.orientation * 0.2;
      }
    }
  } else {
    score += weights.orientation * 0.5;
  }

  // 确保分数在 0-1 范围内
  score = Math.max(0, Math.min(1, score));

  return { score, reasons };
}
