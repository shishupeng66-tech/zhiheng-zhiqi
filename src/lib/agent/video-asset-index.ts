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
  /**
   * 是否要求物理视频文件存在（默认 true）。
   * 规划阶段（Agent 上游 / create_video_plan）只依赖索引元数据（assetId / recommendedCuts /
   * avoidCuts），物理文件解析交给运行期 Asset Resolver，因此可置为 false 以避免「文件未挂载」
   * 时把全部片段丢弃。渲染阶段保持 true。
   */
  requireFileExists?: boolean;
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
    const filePath = path.join(assetRoot, asset.relativePath);
    // 默认要求物理文件存在；规划阶段（requireFileExists=false）仅依赖索引元数据，跳过此校验。
    if (params.requireFileExists !== false) {
      try {
        await fs.access(filePath);
      } catch {
        // 文件不存在，跳过
        console.warn(`[video-asset-index] 文件不存在，跳过: ${asset.relativePath}`);
        continue;
      }
    }

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

    // 检查是否在 avoidCuts 范围内。若该区间同时存在明确 recommendedCut，
    // recommendedCut 优先，避免把人工推荐片段误删。
    if (
      isInAvoidCuts(segment, asset.avoidCuts) &&
      !findBestRecommendedCut(segment, asset.recommendedCuts)
    ) {
      return false;
    }

    return true;
  });

  // 3. 评分
  let scored = filtered.map(({ asset, segment, recommendedCut }) => {
    const { score, reasons, semanticScore } = calculateMatchScore(asset, segment, params);
    return { asset, segment, recommendedCut, score, reasons, semanticScore };
  });

  if (params.query && isClearlyUnsupportedQuery(params.query, scored)) {
    return [];
  }

  // 3.5 最低相关性阈值过滤（有 query 时生效）
  // 语义匹配分低于阈值的，不进入排序（避免不相关素材靠 preferred/quality 基础分混进 Top）
  if (params.query && params.query.trim().length > 0) {
    const minSemanticThreshold = 0.08; // 至少 8% 的关键词匹配（约 1/12 的词命中）
    scored = scored.filter((item) => {
      // 如果有 usageRoles 过滤，也算有明确意图，降低阈值
      const threshold =
        params.usageRoles && params.usageRoles.length > 0 ? 0.03 : minSemanticThreshold;
      return item.semanticScore >= threshold;
    });
  }

  // 4. 排序（分数从高到低）。同一素材内优先保留更早的明确 recommendedCut，
  // 避免语义排序把同一文件的后段 segment 选中后覆盖人工推荐的起始剪辑点。
  scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return getCutStart(a.segment, a.recommendedCut) - getCutStart(b.segment, b.recommendedCut);
  });

  // 5. 同一文件去重（同一文件最多保留 1 个最佳 segment）
  // 除非用户明确传了参数要求多个
  scored = chooseBestCandidatePerAsset(scored);

  // 6. duplicateGroup 去重（同一组只保留最高分的）
  if (params.excludeDuplicateGroups !== false) {
    scored = chooseBestCandidatePerDuplicateGroup(scored);
  }

  // 6. 截取 limit
  const limit = params.limit ?? 10;
  const topResults = scored.slice(0, limit);

  // 7. 转换为输出格式
  return topResults.map(({ asset, segment, recommendedCut, score, reasons }) => {
    // 计算推荐起止时间：
    // - 有 recommendedCut 时，优先使用 recommendedCut 的完整时间（这是明确推荐的剪辑点）
    // - 没有 recommendedCut 时，使用 segment 时间，并应用 recommendedClipLength 约束
    let recStart = segment.start;
    let recEnd = segment.end;

    if (recommendedCut) {
      // recommendedCut 是人工语义索引确认过的剪辑事实，输出时不再被 segment 边界或
      // recommendedClipLength 截短。segment 只用于排序和解释。
      recStart = recommendedCut.start;
      recEnd = recommendedCut.end;
    } else {
      // 没有 recommendedCut 时，应用推荐剪辑长度约束
      const maxLen = segment.recommendedClipLength?.max ?? segment.end - segment.start;
      const minLen = segment.recommendedClipLength?.min ?? 0;
      const currentLen = recEnd - recStart;
      if (currentLen > maxLen) {
        recEnd = recStart + maxLen;
      }
      if (currentLen < minLen) {
        recEnd = Math.min(segment.end, recStart + minLen);
      }
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

type ScoredClip = {
  asset: VideoAsset;
  segment: TimelineSegment;
  recommendedCut: RecommendedCut | undefined;
  score: number;
  reasons: string[];
  semanticScore: number;
};

function getCutStart(segment: TimelineSegment, recommendedCut?: RecommendedCut): number {
  return recommendedCut?.start ?? segment.start;
}

function getCutPriorityWeight(recommendedCut?: RecommendedCut): number {
  if (!recommendedCut) return 0;
  if (recommendedCut.priority === 'high') return 3;
  if (recommendedCut.priority === 'medium') return 2;
  return 1;
}

function chooseBestCandidatePerAsset(scored: ScoredClip[]): ScoredClip[] {
  const bestByAsset = new Map<string, ScoredClip>();

  for (const item of scored) {
    const current = bestByAsset.get(item.asset.id);
    if (!current) {
      bestByAsset.set(item.asset.id, item);
      continue;
    }

    if (isBetterCandidateForSameAsset(item, current)) {
      bestByAsset.set(item.asset.id, item);
    }
  }

  return [...bestByAsset.values()].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return (
      compareStableAssetOrder(a, b) ||
      getCutStart(a.segment, a.recommendedCut) - getCutStart(b.segment, b.recommendedCut)
    );
  });
}

function isBetterCandidateForSameAsset(candidate: ScoredClip, current: ScoredClip): boolean {
  const scoreMargin = candidate.score - current.score;
  if (scoreMargin > 0.05) return true;
  if (scoreMargin < -0.05) return false;

  const candidatePriority = getCutPriorityWeight(candidate.recommendedCut);
  const currentPriority = getCutPriorityWeight(current.recommendedCut);
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority;
  }

  return (
    getCutStart(candidate.segment, candidate.recommendedCut) <
    getCutStart(current.segment, current.recommendedCut)
  );
}

function chooseBestCandidatePerDuplicateGroup(scored: ScoredClip[]): ScoredClip[] {
  const bestByGroup = new Map<string, ScoredClip>();
  const ungrouped: ScoredClip[] = [];

  for (const item of scored) {
    if (!item.asset.duplicateGroup) {
      ungrouped.push(item);
      continue;
    }

    const current = bestByGroup.get(item.asset.duplicateGroup);
    if (!current || isBetterDuplicateCandidate(item, current)) {
      bestByGroup.set(item.asset.duplicateGroup, item);
    }
  }

  return [...ungrouped, ...bestByGroup.values()].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return (
      compareStableAssetOrder(a, b) ||
      getCutStart(a.segment, a.recommendedCut) - getCutStart(b.segment, b.recommendedCut)
    );
  });
}

function isBetterDuplicateCandidate(candidate: ScoredClip, current: ScoredClip): boolean {
  const scoreMargin = candidate.score - current.score;
  if (scoreMargin > 0.05) return true;
  if (scoreMargin < -0.05) return false;

  if (candidate.asset.preferred !== current.asset.preferred) {
    return candidate.asset.preferred;
  }

  const candidateIsSummary = candidate.asset.sourceCategory === '00-总目录';
  const currentIsSummary = current.asset.sourceCategory === '00-总目录';
  if (candidateIsSummary !== currentIsSummary) {
    return !candidateIsSummary;
  }

  return (
    getCutStart(candidate.segment, candidate.recommendedCut) <
    getCutStart(current.segment, current.recommendedCut)
  );
}

function compareStableAssetOrder(a: ScoredClip, b: ScoredClip): number {
  if (a.asset.preferred !== b.asset.preferred) {
    return a.asset.preferred ? -1 : 1;
  }

  const aSummary = a.asset.sourceCategory === '00-总目录';
  const bSummary = b.asset.sourceCategory === '00-总目录';
  if (aSummary !== bSummary) {
    return aSummary ? 1 : -1;
  }

  return a.asset.relativePath.localeCompare(b.asset.relativePath, 'zh-CN', {
    numeric: true,
    sensitivity: 'base'
  });
}

const UNSUPPORTED_SPECIFIC_TERMS = [
  '冷链',
  '冷库',
  '冷藏',
  '低温仓储',
  '无人机',
  '航拍',
  '鸟瞰',
  '高空',
  '机器人',
  '机械臂',
  '高速分拣',
  '色谱',
  '微生物',
  '培养',
  '高级实验室',
  '发布会',
  '舞台演讲',
  '大会演讲'
];

const DOMAIN_PHRASE_MATCHERS: Array<{
  triggers: string[];
  targets: string[];
  reason: string;
}> = [
  {
    triggers: ['老板日常', '管理者真实感', '管理者日常'],
    targets: ['老板日常', '郝总日常'],
    reason: '老板日常场景'
  },
  {
    triggers: ['投料萃取', '投料', '萃取'],
    targets: ['投料萃取'],
    reason: '投料萃取工艺'
  },
  {
    triggers: ['外宾', '外国友人', '国际客户'],
    targets: ['外宾', '外国友人'],
    reason: '外宾交流'
  },
  {
    triggers: ['贴标', '套标', '包装工序'],
    targets: ['贴标', '套标', '贴标机'],
    reason: '贴标包装'
  },
  {
    triggers: ['仓储', '装车', '装货', '出库', '交付'],
    targets: ['装车', '装货', '出库', '物流', '仓库'],
    reason: '仓储交付'
  },
  {
    triggers: ['消杀', '消毒', '生产规范', '进入车间'],
    targets: ['消杀', '消毒', '进车间消杀', '洁净'],
    reason: '车间消杀'
  },
  {
    triggers: ['机修', '维护', '设备维修', '设备稳定'],
    targets: ['机修', '维修', '设备维护', '设备维修'],
    reason: '设备维修'
  },
  {
    triggers: ['一线岗位', '一线员工', '员工', '工作人员'],
    targets: ['员工风采', '员工', '工人', '工作人员'],
    reason: '员工工作'
  },
  {
    triggers: ['公司环境', '展示屏', '企业介绍开场', '产品展示墙'],
    targets: ['公司环境', '展示屏', '展厅', '产品陈列墙'],
    reason: '公司环境'
  },
  {
    triggers: ['小作坊', '有规模', '产线规模', '生产规模', '工厂实力展示型'],
    targets: ['生产线大景', '产线规模', '生产线全景', '产线大景'],
    reason: '工厂规模'
  },
  {
    triggers: ['过渡', '转场', '段落之间', '短镜头'],
    targets: ['转场', '产品瓶身', '包装陈列', '仓库全景'],
    reason: '转场镜头'
  },
  {
    triggers: ['9:16', '竖屏', '抖音'],
    targets: ['竖屏', 'portrait'],
    reason: '竖屏优先'
  },
  {
    triggers: ['16:9', '横版', '横屏'],
    targets: ['横屏', 'landscape'],
    reason: '横屏优先'
  }
];

const DIRECT_MATCH_TERMS = [
  'RIVO',
  '七白饮',
  '企鹅爽',
  '八宝茶',
  'PANDA',
  '郝总口播',
  '郝总日常',
  '老板日常',
  '生产线大景',
  '公司环境',
  '员工',
  '员工风采',
  '原材料验收',
  '剪切配料',
  '投料萃取',
  '品控',
  '无菌',
  '贴标',
  '套标',
  '客户接待',
  '外国友人',
  '外宾',
  '仓库',
  '装车',
  '装货',
  '消杀',
  '机修'
];

function isClearlyUnsupportedQuery(query: string, scored: ScoredClip[]): boolean {
  const requiredTerms = UNSUPPORTED_SPECIFIC_TERMS.filter((term) => query.includes(term));
  if (requiredTerms.length === 0) return false;

  return !scored.some((item) => {
    const haystack = [
      item.asset.fileName,
      item.asset.relativePath,
      item.asset.overallContent,
      item.asset.overallScene,
      item.asset.overallCameraAngle,
      item.segment.content,
      item.segment.action,
      ...item.asset.topicTags,
      ...item.asset.sceneTags,
      ...item.asset.semanticMatches,
      ...item.asset.actions,
      ...item.asset.equipment,
      ...item.asset.environment,
      ...item.segment.topicTags,
      ...item.segment.semanticMatches,
      ...item.asset.storyPotential.map((story) => story.topic)
    ].join(' ');

    return requiredTerms.some((term) => haystack.includes(term));
  });
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

// ============================================================
// 关键词提取与匹配
// ============================================================

/**
 * 企业视频领域少量归一化词表
 * 只做最常见的同义词/近义词映射，不搞大词表
 * 优先利用结构化字段（semanticMatches/topicTags/sceneTags/actions/usageRoles）做多字段匹配
 */
const NORMALIZATION_MAP: Record<string, string[]> = {
  // 质量/品控
  品控: ['质检', '质量控制', '质量检测'],
  质检: ['品控', '质量控制', '质量检测'],
  // 原材料
  原材料: ['原料', '物料', '原辅料'],
  原料: ['原材料', '物料'],
  // 投料/萃取
  投料: ['萃取', '配料', '投料萃取'],
  萃取: ['投料', '提取', '投料萃取'],
  // 无菌/灌装
  无菌: ['无菌灌装', '洁净'],
  灌装: ['无菌灌装', '灌装机'],
  // 客户/接待
  客户接待: ['客户参观', '客户到访', '外宾'],
  外宾: ['客户接待', '外国友人'],
  // 人物/老板
  老板: ['创始人', '企业家', '郝总', '郏总', '老总'],
  口播: ['真人出镜', '人物讲解', '面对镜头', '出镜'],
  老板IP: ['老板口播', '创始人IP', '企业家IP'],
  // 工厂/实力
  工厂实力: ['企业实力', '工厂规模', '生产实力'],
  企业实力: ['工厂实力', '生产实力', '公司实力'],
  // 消杀/卫生
  消杀: ['消毒', '卫生', '洁净'],
  消毒: ['消杀', '卫生', '灭菌'],
  // 研发/实验室
  研发: ['实验室', '技术研发', '产品研发'],
  实验室: ['研发', '化验室', '检测室'],
  // 物流/发货
  物流: ['装车', '装货', '发货', '仓储物流'],
  装车: ['物流', '装货', '发货'],
  // 产品/展示
  产品展示: ['产品陈列', '样品展示', '展示墙'],
  陈列: ['展示', '产品陈列', '样品'],
  // 员工/工作
  员工: ['工人', '工作人员', '一线员工'],
  // 包装/贴标
  贴标: ['套标', '贴标机', '标签'],
  包装: ['包材', '包装材料', '外包装'],
  // 转场/空镜
  转场: ['过渡', '空镜', '转场镜头'],
  空镜: ['转场', '过渡'],
  // 航拍
  航拍: ['无人机', '全景', '鸟瞰', '高空'],
  // 自动化
  自动化: ['机器人', '机械臂', '智能'],
  机器人: ['自动化', '机械臂'],
  // 冷链
  冷链: ['冷库', '低温仓储', '冷藏'],
  // 发布会
  发布会: ['演讲', '舞台', '大会', '论坛'],
  // 开头/结尾
  开头: ['开场', '开篇', '引入', 'hook'],
  结尾: ['收尾', '结束', 'cta', '总结'],
  // 正文/B-roll
  正文: ['主体', '内容', '中间部分'],
  'b-roll': ['补充画面', '辅助画面', '正文']
};

/**
 * 从 query 中提取中文 N-gram 候选关键词（2-4 字）
 * 用于在目标字段中进行子串匹配
 */
function extractChineseNGrams(query: string): string[] {
  if (!query) return [];

  // 先按非中文字符切分，得到中文片段
  const chineseSegments = query
    .toLowerCase()
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter((s) => s.length >= 2);

  const ngrams = new Set<string>();

  for (const seg of chineseSegments) {
    // 纯英文/数字片段直接保留
    if (/^[a-zA-Z0-9]+$/.test(seg)) {
      ngrams.add(seg);
      continue;
    }

    // 中文片段：提取 2、3、4 字 N-gram
    const len = seg.length;
    for (let n = 2; n <= Math.min(4, len); n++) {
      for (let i = 0; i <= len - n; i++) {
        ngrams.add(seg.slice(i, i + n));
      }
    }
  }

  return [...ngrams];
}

/**
 * 停用词过滤（只过滤最通用的虚词）
 */
const STOP_WORDS = new Set([
  '的',
  '了',
  '是',
  '在',
  '我',
  '有',
  '和',
  '就',
  '不',
  '人',
  '都',
  '一',
  '一个',
  '上',
  '也',
  '很',
  '到',
  '说',
  '要',
  '去',
  '你',
  '会',
  '着',
  '没有',
  '看',
  '好',
  '自己',
  '这',
  '那',
  '什么',
  '怎么',
  '为什么',
  '可以',
  '能',
  '能够',
  '应该',
  '我们',
  '你们',
  '他们',
  '它们',
  '这个',
  '那个',
  '这些',
  '那些',
  '进行',
  '表现',
  '展示',
  '体现',
  '说明',
  '证明',
  '需要',
  '找',
  '搜索',
  '素材',
  '视频',
  '画面',
  '镜头',
  '片段',
  '场景',
  '适合',
  '用来',
  '作为',
  '比如',
  '例如',
  '以及',
  '过程',
  '当中',
  '时候',
  '以后',
  '之前',
  '现在',
  '真正',
  '其实',
  '就是',
  '不是',
  '不会',
  '不能',
  '第一步',
  '第二步',
  '第三步',
  '第一',
  '第二',
  '第三',
  '直接',
  '间接',
  '完全',
  '充分',
  '足够',
  '一些',
  '一点',
  '很多',
  '许多',
  '大量',
  '这样',
  '那样',
  '如何',
  '怎么',
  '怎样',
  '因为',
  '所以',
  '但是',
  '而且',
  '或者',
  '通过',
  '根据',
  '关于',
  '对于',
  '由于',
  '已经',
  '正在',
  '将要',
  '曾经',
  '一直',
  '非常',
  '特别',
  '十分',
  '相当',
  '比较',
  '可能',
  '大概',
  '也许',
  '或许',
  '应该',
  '必须',
  '一定',
  '必然',
  '绝对',
  '进来',
  '进去',
  '出来',
  '出去',
  '过来',
  '过去',
  '开始',
  '结束',
  '继续',
  '停止',
  '完成',
  '知道',
  '明白',
  '理解',
  '认识',
  '记得',
  '觉得',
  '认为',
  '以为',
  '感到',
  '发现',
  '告诉',
  '回答',
  '问',
  '说',
  '讲',
  '做',
  '干',
  '搞',
  '弄',
  '办',
  '给',
  '拿',
  '放',
  '带',
  '送',
  '来',
  '去',
  '到',
  '在',
  '从',
  '把',
  '被',
  '让',
  '使',
  '叫',
  '和',
  '跟',
  '与',
  '及',
  '或',
  '而',
  '但',
  '却',
  '然',
  '则',
  '之',
  '乎',
  '者',
  '也',
  '矣',
  '个',
  '只',
  '条',
  '件',
  '张',
  '种',
  '类',
  '样',
  '式',
  '型',
  '企业',
  '公司',
  '工厂',
  '产品',
  '建立',
  '突出',
  '展现',
  '呈现',
  '当中',
  '其中',
  '之后',
  '之前'
]);

/**
 * 提取关键词（N-gram + 停用词过滤 + 归一化扩展）
 */
function extractKeywords(query: string): string[] {
  if (!query) return [];

  const ngrams = extractChineseNGrams(query);
  const filtered = ngrams.filter((w) => !STOP_WORDS.has(w));

  // 归一化扩展：对每个关键词，加入同义词用于匹配
  const expanded = new Set<string>(filtered);
  for (const kw of filtered) {
    const synonyms = NORMALIZATION_MAP[kw];
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
  }

  return [...expanded];
}

/**
 * 双向匹配分数计算
 *
 * 正向：query 关键词 → 目标文本字段（子串包含）
 * 反向：目标标签 → query 文本（标签在 query 中出现）
 *
 * 为什么需要反向匹配：
 * - query 是长句（如"老板正面对镜头介绍企业实力"）
 * - 目标标签是短词（如"老板口播"、"企业实力"）
 * - 正向 N-gram 可能切不到正好的词，但反向用标签去 query 里找更准
 */
function bidirectionalMatchScore(
  query: string,
  targetLabels: string[],
  targetTexts: string[]
): { score: number; hits: string[] } {
  if (!query || (targetLabels.length === 0 && targetTexts.length === 0)) {
    return { score: 0, hits: [] };
  }

  const queryLower = query.toLowerCase();
  const hits = new Set<string>();

  // ---- 反向匹配：目标标签 → query（高置信度，因为标签是结构化的）----
  let reverseHits = 0;
  for (const label of targetLabels) {
    const labelLower = label.toLowerCase();
    if (labelLower.length < 2) continue;

    // 直接匹配
    if (queryLower.includes(labelLower)) {
      hits.add(label);
      reverseHits++;
      continue;
    }

    // 归一化扩展匹配
    const synonyms = NORMALIZATION_MAP[labelLower];
    if (synonyms) {
      for (const syn of synonyms) {
        if (queryLower.includes(syn)) {
          hits.add(label);
          reverseHits++;
          break;
        }
      }
    }
  }

  // 反向匹配分数：命中标签数 / 总标签数（但最多算 5 个标签，避免长尾）
  const reverseScore =
    targetLabels.length > 0 ? Math.min(1, reverseHits / Math.min(5, targetLabels.length)) : 0;

  // ---- 正向匹配：query N-gram → 目标文本 ----
  const keywords = extractKeywords(query);
  let forwardHits = 0;
  const allTargetText = [...targetLabels, ...targetTexts].map((t) => t.toLowerCase());

  for (const kw of keywords) {
    if (allTargetText.some((t) => t.includes(kw))) {
      hits.add(kw);
      forwardHits++;
    }
  }

  // 正向匹配分数：命中关键词数 / 关键词总数（但最多算 10 个，避免 N-gram 太多）
  const forwardScore =
    keywords.length > 0 ? Math.min(1, forwardHits / Math.min(10, keywords.length)) : 0;

  // ---- 综合：取较高的那个方向的分数 ----
  // 反向匹配通常更准（因为标签是结构化的），所以权重稍高
  const score = Math.max(
    reverseScore * 1.0,
    forwardScore * 0.8,
    reverseScore * 0.6 + forwardScore * 0.4
  );

  return {
    score: Math.min(1, score),
    hits: [...hits].slice(0, 8)
  };
}

function getSearchableText(asset: VideoAsset, segment: TimelineSegment): string {
  return [
    asset.fileName,
    asset.relativePath,
    asset.sourceCategory,
    asset.normalizedCategory,
    asset.overallContent,
    asset.overallCameraAngle,
    asset.overallScene,
    asset.orientation,
    segment.content,
    segment.action,
    segment.shotType,
    segment.cameraAngle,
    segment.cameraMovement,
    segment.visualQuality,
    segment.cropSafety,
    segment.verticalCropSuitability,
    ...asset.people,
    ...asset.products,
    ...asset.equipment,
    ...asset.actions,
    ...asset.environment,
    ...asset.sceneTags,
    ...asset.topicTags,
    ...asset.recommendedSkills,
    ...asset.usageRoles,
    ...asset.semanticMatches,
    ...segment.subjects,
    ...segment.usageRoles,
    ...segment.topicTags,
    ...segment.semanticMatches,
    ...segment.recommendedSkills,
    ...asset.storyPotential.map((story) => `${story.topic} ${story.contentType}`)
  ]
    .join(' ')
    .toLowerCase();
}

function domainPhraseMatchScore(
  query: string,
  asset: VideoAsset,
  segment: TimelineSegment
): { score: number; hits: string[] } {
  const queryLower = query.toLowerCase();
  const searchable = getSearchableText(asset, segment);
  const hits: string[] = [];

  for (const matcher of DOMAIN_PHRASE_MATCHERS) {
    const queryHit = matcher.triggers.some((trigger) => queryLower.includes(trigger.toLowerCase()));
    if (!queryHit) continue;

    const targetHit = matcher.targets.some((target) => {
      const targetLower = target.toLowerCase();
      if (targetLower === 'portrait') return asset.orientation === 'portrait';
      if (targetLower === 'landscape') return asset.orientation === 'landscape';
      return searchable.includes(targetLower);
    });

    if (targetHit) {
      hits.push(matcher.reason);
    }
  }

  return {
    score: hits.length > 0 ? Math.min(1, hits.length * 0.5) : 0,
    hits
  };
}

function directTermMatchScore(
  query: string,
  asset: VideoAsset,
  segment: TimelineSegment
): { score: number; hits: string[] } {
  const queryLower = query.toLowerCase();
  const searchable = getSearchableText(asset, segment);
  const queryTerms = DIRECT_MATCH_TERMS.filter((term) => queryLower.includes(term.toLowerCase()));

  if (queryTerms.length === 0) {
    return { score: 0, hits: [] };
  }

  const hits = queryTerms.filter((term) => searchable.includes(term.toLowerCase()));
  return {
    score: hits.length > 0 ? Math.min(1, hits.length / Math.min(3, queryTerms.length)) : 0,
    hits
  };
}

function surfaceTermMatchScore(
  query: string,
  asset: VideoAsset,
  segment: TimelineSegment
): { score: number; hits: string[] } {
  const queryLower = query.toLowerCase();
  const surface = [asset.fileName, asset.relativePath, asset.overallContent, segment.content]
    .join(' ')
    .toLowerCase();

  const queryTerms = DIRECT_MATCH_TERMS.filter((term) => queryLower.includes(term.toLowerCase()));
  const hits = queryTerms.filter((term) => surface.includes(term.toLowerCase()));

  return {
    score: hits.length > 0 ? Math.min(1, hits.length / Math.min(2, queryTerms.length || 1)) : 0,
    hits
  };
}

/**
 * 计算匹配分数（0-1）
 *
 * 综合维度：
 * - query 多字段语义匹配（segment + asset 两级，反向匹配为主）
 * - usageRoles 匹配
 * - recommendedSkills 匹配
 * - orientation 匹配
 * - visualQuality / preferred（仅在有语义匹配时加分，与语义强度挂钩）
 *
 * 重要：无有效语义匹配时，分数极低，不进入 Top 结果
 */
function calculateMatchScore(
  asset: VideoAsset,
  segment: TimelineSegment,
  params: SearchVideoAssetsParams
): { score: number; reasons: string[]; semanticScore: number } {
  let score = 0;
  const reasons: string[] = [];
  const weights = {
    semanticMatch: 0.45, // 语义匹配（最高权重）
    topicMatch: 0.15, // 主题标签匹配
    sceneMatch: 0.1, // 场景/动作/设备/环境匹配
    usageRoleMatch: 0.1, // 用途角色匹配
    skillMatch: 0.05, // 风格匹配
    quality: 0.05, // 画质加分
    preferred: 0.05, // 优选加分
    orientation: 0.05 // 横竖屏匹配
  };

  let semanticScore = 0; // 纯语义匹配分（用于最低阈值判断）

  // ============================================================
  // 1. 语义匹配（多字段分层加权，双向匹配）
  // ============================================================
  if (params.query && params.query.trim().length > 0) {
    const query = params.query;

    // 字段分层（按重要性）
    // Layer 1: semanticMatches（最精准的语义标签）
    const semanticLabels = [...segment.semanticMatches, ...asset.semanticMatches];

    // Layer 2: topicTags（主题标签）
    const topicLabels = [...segment.topicTags, ...asset.topicTags];

    // Layer 3: scene / action / equipment / environment（场景描述标签）
    const sceneLabels = [
      ...asset.sceneTags,
      ...asset.actions,
      ...asset.equipment,
      ...asset.environment,
      segment.action,
      ...asset.storyPotential.map((s) => s.topic)
    ];

    // Layer 4: 长文本描述（content / overallContent）
    const longTexts = [segment.content, asset.overallContent];

    // 各层分别做双向匹配
    const semanticResult = bidirectionalMatchScore(query, semanticLabels, []);
    const topicResult = bidirectionalMatchScore(query, topicLabels, []);
    const sceneResult = bidirectionalMatchScore(query, sceneLabels, []);
    const contentResult = bidirectionalMatchScore(query, [], longTexts);
    const domainResult = domainPhraseMatchScore(query, asset, segment);
    const directResult = directTermMatchScore(query, asset, segment);
    const surfaceResult = surfaceTermMatchScore(query, asset, segment);

    // 语义总分 = 各层加权求和
    // semanticMatches 权重最高（因为是最精准的语义标签）
    // 长文本描述权重最低（因为描述性强，噪音多）
    const combinedSemanticScore =
      semanticResult.score * 0.32 +
      topicResult.score * 0.2 +
      sceneResult.score * 0.12 +
      contentResult.score * 0.08 +
      domainResult.score * 0.2 +
      directResult.score * 0.06 +
      surfaceResult.score * 0.02;

    semanticScore = Math.min(1, combinedSemanticScore);

    if (semanticScore > 0) {
      score += weights.semanticMatch * semanticScore;

      // 收集命中理由（取各层命中的前几个）
      const allHits = [
        ...domainResult.hits.map((h) => `领域:${h}`),
        ...directResult.hits.map((h) => `直接:${h}`),
        ...surfaceResult.hits.map((h) => `精确:${h}`),
        ...semanticResult.hits.map((h) => `语义:${h}`),
        ...topicResult.hits.map((h) => `主题:${h}`),
        ...sceneResult.hits.map((h) => `场景:${h}`)
      ];
      if (allHits.length > 0) {
        reasons.push(`匹配：${allHits.slice(0, 3).join('、')}`);
      }
    }

    // topicMatch 单独加分（在语义分之外额外奖励主题匹配）
    if (topicResult.score > 0.3) {
      score += weights.topicMatch * Math.min(1, topicResult.score);
      if (topicResult.hits.length > 0) {
        reasons.push(`主题匹配：${topicResult.hits.slice(0, 2).join('、')}`);
      }
    }

    // sceneMatch 单独加分
    if (sceneResult.score > 0.3) {
      score += weights.sceneMatch * Math.min(1, sceneResult.score * 0.8);
    }

    if (domainResult.score > 0) {
      score += 0.22 * domainResult.score;
    }

    if (directResult.score > 0) {
      score += 0.18 * directResult.score;
    }

    if (surfaceResult.score > 0) {
      score += 0.14 * surfaceResult.score;
    }
  }

  // ============================================================
  // 2. usageRoles 匹配
  // ============================================================
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
  }

  // 3. recommendedSkills 匹配
  if (params.contentType) {
    const contentTypeLower = params.contentType.toLowerCase();
    const skillHits = segment.recommendedSkills.filter(
      (s) =>
        s.toLowerCase().includes(contentTypeLower) || contentTypeLower.includes(s.toLowerCase())
    );
    if (skillHits.length > 0) {
      score += weights.skillMatch * 1.0;
      reasons.push(`适合${params.contentType}风格`);
    }
  }

  // ============================================================
  // 4. 画质 / 优选 / 横竖屏 —— 与语义匹配强度挂钩
  // ============================================================
  // 语义匹配越强，quality/preferred 加分越多（最多 100%）
  // 语义匹配越弱，加分越少（避免不相关素材靠画质/优选混上来）
  const hasSemanticMatch = semanticScore > 0.05;
  const hasUsageRole = params.usageRoles && params.usageRoles.length > 0;
  const qualityMultiplier = hasSemanticMatch
    ? Math.min(1, Math.max(0.3, semanticScore * 2.5))
    : hasUsageRole
      ? 0.3
      : 0.1;

  if (hasSemanticMatch || hasUsageRole) {
    // 画质加分
    if (segment.visualQuality === 'good') {
      score += weights.quality * 1.0 * qualityMultiplier;
      reasons.push('画质良好');
    } else if (segment.visualQuality === 'medium') {
      score += weights.quality * 0.6 * qualityMultiplier;
    } else {
      score += weights.quality * 0.3 * qualityMultiplier;
    }

    // preferred 加分
    if (asset.preferred) {
      score += weights.preferred * 1.0 * qualityMultiplier;
      reasons.push('优选素材');
    } else {
      score += weights.preferred * 0.3 * qualityMultiplier;
    }
  } else {
    // 几乎无语义匹配时，quality/preferred 只给极低的基础分
    score += weights.quality * 0.1;
    score += weights.preferred * 0.1;
  }

  // 5. orientation 匹配
  if (params.orientation) {
    if (asset.orientation === params.orientation) {
      score += weights.orientation * 1.0;
      reasons.push(params.orientation === 'portrait' ? '竖屏素材' : '横屏素材');
    } else {
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

  return { score, reasons, semanticScore };
}
