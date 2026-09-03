/**
 * JianYing Adapter —— ResourceMap 类型与查询/校验逻辑。
 *
 * ResourceMap 的职责：
 * 1. styleId（语义模板名）→ 剪映资源（resourceId）的映射
 * 2. 资源缺失时的行为判定（required / fallback）
 * 3. 跳过/替换必须产生 warning 并要求人工检查
 *
 * 设计目标：Agent 只输出语义 styleId，由 ResourceMap 转换为剪映具体 resourceId。
 */
import { ErrorCode, type ContractError } from './errors';
import { getResourceEntry } from './resource-map-data';

/** 资源类型 */
export type ResourceType = 'huazi' | 'transition' | 'sfx' | 'bgm' | 'subtitle';

/** ResourceMap 条目 */
export interface ResourceMapEntry {
  /** 语义样式 ID（Agent/模板层使用），如 "huazi.blue_outline" */
  styleId: string;
  /** 资源类型 */
  type: ResourceType;
  /** 剪映资源 ID（text_sticker/transition/audio_effect/music）；字幕样式无 resourceId */
  resourceId: string | null;
  /** 验证过的剪映版本 */
  verifiedJianyingVersion: string;
  /** 验证日期 */
  verifiedDate: string;
  /** 是否需要 VIP */
  vipRequired: boolean;
  /** 是否已购买 */
  isPurchased: boolean;
  /** 版权状态：builtin / purchased / unknown / code_defined */
  copyrightStatus: string;
  /** 必需资源缺失时是否停止；可选资源（false）缺失时才允许跳过/替换 */
  required: boolean;
  /** 预先配置并验证过的 fallback styleId；null 表示无 fallback（缺失即跳过/失败） */
  fallbackStyleId: string | null;
  /** Cache 探测规则（相对规则，不写绝对路径；null 表示不涉及资源下载） */
  cacheProbeRule: string | null;
}

/** ResourceMap 注册表 */
export interface ResourceMap {
  ref: string;
  version: string;
  jianyingVersion: string;
  entries: ResourceMapEntry[];
}

/** 资源解析结果 */
export interface ResourceResolveResult {
  entry: ResourceMapEntry;
  /** 实际使用的 styleId（可能是 fallback 替换后的） */
  resolvedStyleId: string;
  /** 是否发生了 fallback 替换 */
  usedFallback: boolean;
  /** 是否跳过（可选资源缺失且无 fallback） */
  skipped: boolean;
  warning?: string;
}

/**
 * 解析一个 styleId → 剪映资源。
 *
 * 规则（Phase C 已确认）：
 * - styleId 不存在 → RESOURCE_MISSING（配置错误，停止）
 * - 必需资源缺失（无法解析到有效资源）→ RESOURCE_MISSING（停止）
 * - 可选资源缺失：有 fallback 则替换（warning + manualReviewRequired），
 *   无 fallback 则跳过（warning + manualReviewRequired）
 * - 不得自动选择"相似资源"
 */
export function resolveResource(styleId: string): ResourceResolveResult | ContractError {
  const entry = getResourceEntry(styleId);
  if (!entry) {
    return {
      code: ErrorCode.RESOURCE_MISSING,
      message: `ResourceMap 中不存在 styleId "${styleId}"（配置错误，停止）`
    };
  }
  // 资源本身有 resourceId（或 code_defined）即视为可用（本轮不做剪映 Cache 存在性检查，
  // 剪映打开时会自动下载；缺失由 Phase D 实草稿验证）
  if (entry.resourceId || entry.copyrightStatus === 'code_defined') {
    return { entry, resolvedStyleId: entry.styleId, usedFallback: false, skipped: false };
  }

  // 资源不可用：尝试 fallback
  if (entry.fallbackStyleId) {
    const fb = getResourceEntry(entry.fallbackStyleId);
    if (fb && (fb.resourceId || fb.copyrightStatus === 'code_defined')) {
      return {
        entry: fb,
        resolvedStyleId: fb.styleId,
        usedFallback: true,
        skipped: false,
        warning: `styleId "${styleId}" 资源不可用，已使用预先配置的 fallback "${fb.styleId}"（需人工复核）`
      };
    }
  }

  // 必需资源无可用 fallback → 失败
  if (entry.required) {
    return {
      code: ErrorCode.RESOURCE_MISSING,
      message: `必需资源 styleId "${styleId}"（${entry.type}）不可用且无可用 fallback，停止生成`
    };
  }

  // 可选资源缺失 → 跳过
  return {
    entry,
    resolvedStyleId: entry.styleId,
    usedFallback: false,
    skipped: true,
    warning: `可选资源 styleId "${styleId}"（${entry.type}）缺失，已跳过（需人工复核）`
  };
}

/** 收集 Timeline 中所有引用到的 styleId（含字幕/标题/keyword/bgm/sfx） */
export function collectTimelineStyleIds(timeline: {
  subtitleTrack: Array<{ styleId: string }>;
  titleTrack: Array<{ styleId: string }>;
  keywordTrack?: Array<{ styleId: string }>;
}): string[] {
  const ids = new Set<string>();
  for (const s of timeline.subtitleTrack) ids.add(s.styleId);
  for (const s of timeline.titleTrack) ids.add(s.styleId);
  if (timeline.keywordTrack) {
    for (const s of timeline.keywordTrack) ids.add(s.styleId);
  }
  return [...ids];
}
