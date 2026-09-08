/**
 * 自动剪辑 Agent 上游主链（真实执行入口，停在剪映适配器之前）。
 *
 * 流水线（不重建 Agent 框架，复用项目既有工具与模型配置）：
 *   Chat/脚本 →（Agent 提取脚本）→ search_video_assets（真实企业素材索引）
 *   → create_video_plan（真实方案）→ save_video_plan_as_draft（真实草稿任务）
 *   → buildUnifiedTimelineFromAutomationDraft（UnifiedTimelineV2）→ validateTimeline（校验）
 *   → 写入 agentStage:ready_for_jianying（等待剪映适配器）。
 *
 * 明确不做什么（本轮边界）：
 * - 不调用 MoneyPrinter / PJD（见 execute_video_task / startMoneyPrinterTaskWorker，本模块不引用）。
 * - 不调用 JianYingAdapter.generateDraft（由豆包独立修复 11.3 兼容性后接入）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CreateVideoPlanOutput, VideoPlanTimelineItem } from '@/lib/agent/tools';
import { createVideoPlanTool, saveVideoPlanAsDraftTool } from '@/lib/agent/tools';
import { searchVideoClips, loadVideoAssetIndex } from '@/lib/agent/video-asset-index';
import type { ToolExecutionContext } from '@/lib/agent/tool-registry';
import { chat, chatWithTools, getResolvedLlmConfig } from '@/lib/ai';
import type { ChatMessage } from '@/lib/ai';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { getPath } from '@/lib/storage';
import {
  updateAutomationVideoTaskAgentStage,
  writeSubtitleAlignment,
  writeEmphasisGroups,
  writeVisualPackagingPlan,
  type VisualPackagingPlanRecord
} from './automation-editing';
import { validateTimeline } from '@/engines/zhiheng-renderer/validator';
import type { ValidationResult } from '@/engines/renderer-interface';
import {
  DEFAULT_OUTPUT_PROFILE,
  type SubtitleSegment,
  type VoiceSegment
} from '@/engines/zhiheng-renderer/types';
import type { UnifiedTimelineV2 } from '@/engines/zhiheng-renderer/v2-types';
import {
  deriveVideoTimelineStartsV2,
  calculateVideoTotalDurationV2,
  type VideoSegmentV2,
  type KeywordSegment,
  type TextOverlaySegment,
  type StickerPackagingSegment,
  type PackagingSfxSegment
} from '@/engines/zhiheng-renderer/v2-types';
import { generateVoiceAudio, type VoiceSpeechSegment } from '@/lib/voice-service/client';
import {
  VISUAL_RESOURCE_BY_KEY,
  buildResourceRegistrySummary,
  STICKER_VISUAL_RESOURCES,
  SFX_VISUAL_RESOURCES
} from './visual-resource-registry';

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** 素材时长表缓存：relativePath → 素材总时长（秒）。 */
let cachedAssetDurations: Record<string, number> | null = null;

/** 查询某素材（relativePath）的总时长；未知返回 null。 */
async function assetDurationsOfPath(relativePath: string): Promise<number | null> {
  if (!cachedAssetDurations) {
    cachedAssetDurations = {};
    try {
      const assets = await loadVideoAssetIndex();
      for (const asset of assets) {
        if (asset.relativePath && typeof asset.durationSeconds === 'number') {
          cachedAssetDurations[asset.relativePath] = asset.durationSeconds;
        }
      }
    } catch {
      // 索引不可用时按未知处理
    }
  }
  return cachedAssetDurations[relativePath] ?? null;
}

export type AgentAutoEditParams = {
  /** 工作空间 slug，例如 enterprise-media */
  workspaceSlug: string;
  /** 用户原始输入：可能是一整段脚本，也可能是一句话需求 */
  userMessage: string;
  /** 创建人用户 ID（写入草稿任务 createdBy） */
  userId: string;
  userName?: string;
  userRole?: string;
  workspaceRole?: string;
  /** 是否用项目模型做脚本提取/扩写（默认 true）。失败回退到原始输入。 */
  useLlm?: boolean;
};

export type AgentAutoEditResult = {
  taskId: string;
  editorUrl: string;
  stage: string;
  /** Agent 实际采用的脚本（可能经模型提取/扩写） */
  script: string;
  /** 实际使用的项目模型（provider / model） */
  modelUsed: { provider: string; model: string } | null;
  /** 主题搜索返回的候选片段数量（真实企业素材索引） */
  candidateCount: number;
  /** 最终进入视频轨的素材段数 */
  assetCount: number;
  /** 使用 recommendedCuts 起止的段数 */
  recommendedCutsUsed: number;
  /** 命中 avoidCuts 的段数（应为 0） */
  avoidCutsCount: number;
  plan: CreateVideoPlanOutput;
  timeline: UnifiedTimelineV2;
  validation: ValidationResult;
  coverage: CreateVideoPlanOutput['coverage'];
  /** 已记录的未来剪映适配器公开调用入口（本轮不调用） */
  jianyingAdapterInterface: string;
  /** 全篇视觉包装规划（LLM 逐节判断，供验收报告） */
  visualPackagingPlan?: VisualPackagingPlan;
  /** 包装执行统计（供验收报告） */
  visualPackagingStats?: VisualPackagingStats;
};

/** 未来剪映适配器公开调用入口（豆包修复 11.3 兼容性后接入，本轮仅记录不调用）。 */
export const JIANYING_ADAPTER_INTERFACE =
  'JianYingAdapter.generateDraft({ draftName: string; timeline: UnifiedTimelineV2; jobId?: string; resourceMapRef?: string; options?: Partial<JianYingJobOptions> }): Promise<JianYingResult>';

function isPlausibleScript(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 40) return false;
  const sentenceMarks = (normalized.match(/[。！？!?\n]/g) ?? []).length;
  return sentenceMarks >= 3;
}

/**
 * Agent 脚本提取/扩写：复用项目默认 LLM 配置（volcengine-ark / deepseek-v4-flash 等，
 * 来自 DB provider_profiles，不新增独立 Key）。失败回退到原始输入。
 */
async function extractScriptWithLlm(userMessage: string): Promise<string> {
  if (!isPlausibleScript(userMessage)) {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是知衡智企视频剪辑助手。用户可能只给了一句需求。请把它扩写成一版适合企业短视频的口播脚本：' +
          '5-7 句，每句对应一个镜头意图，语言通顺、不要解释、不要编号、直接用换行分隔句子。'
      },
      { role: 'user', content: userMessage }
    ];
    try {
      const script = (await chat(messages)).trim();
      if (script.length > 0) return script;
    } catch {
      // 模型不可用，回退
    }
  }
  return userMessage.trim();
}

/**
 * 最小明确的 Video Plan → UnifiedTimelineV2 转换层。
 *
 * 硬规则（spec 九）：
 * - schemaVersion = 2
 * - videoTrack 连续无 gap（数组顺序派生 timelineStart）
 * - sourceAudioMuted 全部 true
 * - 仅采用合法 source 范围（sourceEnd > sourceStart）
 * - recommendedCuts 优先（方案 sourceStart/sourceEnd 即来自 recommendedStart/recommendedEnd）
 * - avoidCuts 禁止（搜索阶段已排除，构造阶段再次保证 0）
 * - 字幕 / 关键词 / BGM / SFX 均在总时间范围内
 */

/** 统计文本展示字数（去除空白，汉字/数字/字母都算 1 个单位）。 */
function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** 在 >12 字的无标点文本中寻找语义断点（返回切割下标）。 */
function semanticBreakIndex(text: string): number {
  const max = Math.min(12, text.length);
  // 1) 句子助词之后断（前一字为助词 → 在其后切）
  const particlesAfter = new Set([
    '的',
    '了',
    '吧',
    '吗',
    '呢',
    '啊',
    '呀',
    '么',
    '着',
    '过',
    '上',
    '下',
    '中',
    '里',
    '后',
    '时'
  ]);
  for (let i = 5; i <= max - 1; i++) {
    if (particlesAfter.has(text[i - 1])) return i;
  }
  // 2) 连接词/介词/副词开头处断（在该词前切）
  const wordStarts = [
    '然后',
    '所以',
    '但是',
    '如果',
    '因为',
    '以及',
    '同时',
    '还要',
    '就是',
    '直接',
    '可以',
    '需要',
    '都会',
    '这样',
    '那些',
    '这些',
    '一个',
    '这种',
    '最低',
    '最多',
    '至少',
    '最',
    '都',
    '也',
    '就',
    '才',
    '要',
    '会',
    '能',
    '可',
    '但',
    '而',
    '并',
    '还',
    '又',
    '再',
    '在',
    '把',
    '将',
    '从',
    '向',
    '为',
    '对',
    '和',
    '与',
    '及',
    '等'
  ];
  for (let i = 5; i <= max - 1; i++) {
    for (const word of wordStarts) {
      if (text.slice(i, i + word.length) === word) return i;
    }
  }
  // 3) 回退：接近 7-8 字处断开（保证 ≤12 字、自然可读）
  return Math.min(8, max);
}

/** 对 >12 字且无标点的文本做语义二次拆分（≤12 字/段）。 */
function semanticSplitLong(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (countChars(rest) > 12) {
    const cut = semanticBreakIndex(rest);
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * 基础底部字幕拆分（9:16 竖屏）：
 * - 第一层：按标点/换行拆分（，。；：、？！ 与 \n 均为拆分节点，逗号优先）；
 *   \n 拆分的必要性：多句脚本以 \n 分隔句子，若不切 \n，chunk 会内嵌换行，
 *   导致 TTS_NATIVE 字级匹配失败（TTS 会把 \n 规范化为「。」并入前字）而回退 VAD。
 * - 第二层：任一片段 >12 字时，按语义短语/口语停顿/主谓结构继续拆分；
 * - 返回的字幕片段不含尾部标点（用于展示）。
 */
function segmentSubtitleText(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  const parts = text.split(/([，。；：、？！\n])/);
  const punctChunks: string[] = [];
  let buf = '';
  for (const part of parts) {
    if (/[，。；：、？！\n]/.test(part)) {
      if (buf.trim()) punctChunks.push(buf.trim());
      buf = '';
    } else {
      buf += part;
    }
  }
  if (buf.trim()) punctChunks.push(buf.trim());

  const out: string[] = [];
  for (const chunk of punctChunks) {
    if (countChars(chunk) <= 12) {
      out.push(chunk);
    } else {
      out.push(...semanticSplitLong(chunk));
    }
  }
  return out.filter(Boolean);
}

/**
 * 基础底部字幕轨：把每个视频段的时间范围按「拆出的字幕片段文本长度占比」重新分配，
 * 保证整句总时间范围不变、字幕连续无重叠。拆字幕不改变 Voice / Video 总时长。
 */
function buildSubtitleTrack(
  validSegments: Array<{ scriptText?: string | null }>,
  starts: Array<{ timelineStart: number; timelineEnd: number }>
): SubtitleSegment[] {
  const subs: SubtitleSegment[] = [];
  for (let i = 0; i < validSegments.length; i++) {
    const text = validSegments[i].scriptText?.trim() || `片段 ${i + 1}`;
    const segStart = starts[i].timelineStart;
    const segEnd = starts[i].timelineEnd;
    const chunks = segmentSubtitleText(text);
    const totalChars = chunks.reduce((sum, chunk) => sum + countChars(chunk), 0) || 1;
    const range = Math.max(0.1, segEnd - segStart);

    let cursor = segStart;
    chunks.forEach((chunk, ci) => {
      const dur =
        ci === chunks.length - 1
          ? segEnd - cursor
          : round3((countChars(chunk) / totalChars) * range);
      subs.push({
        id: `sub-${i + 1}-${ci + 1}`,
        start: round3(cursor),
        duration: Math.max(0.1, dur),
        text: chunk,
        styleId: 'subtitle.default',
        highlights: []
      });
      cursor += dur;
    });
  }
  return subs;
}

/** 字幕对齐来源。 */
export type SubtitleAlignmentSource = 'TTS_NATIVE' | 'VAD_ALIGNED' | 'FALLBACK_ESTIMATE';

/** 节内重点词（组队递进强调）条目。 */
export type EmphasisGroupItem = {
  word: string;
  /** 该词被读到的真实开始（秒，来自 TTS_NATIVE 字级时间戳） */
  start: number;
  /** 该词显示结束（= 本组退场时间，秒） */
  end: number;
  anchor: 'top_center' | 'center' | 'bottom_center';
};

/** 节内重点词强调组。 */
export type EmphasisGroup = {
  id: string;
  sentenceIndex: number;
  items: EmphasisGroupItem[];
  groupStart: number;
  groupEnd: number;
};

/**
 * 节内重点词提取（黄金规则，避免过度泛化）：
 * - 按句切分；
 * - 在句内按 、，；： 切出 2-5 字的短枚举短语；
 * - 仅当枚举短语 >=4 个才形成重点组（排除逗号长从句等非枚举结构）；
 * - 若 >4，去掉句首引导项并 cap 4；
 * - 产出组内词用于文字模板强化。
 */
export function extractEmphasisGroups(
  script: string
): Array<{ sentence: string; items: string[] }> {
  const sentences = script
    .split(/[\n。]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const groups: Array<{ sentence: string; items: string[] }> = [];
  for (const sentence of sentences) {
    const items = sentence
      .split(/[、，；：,;:]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 5);
    if (items.length < 4) continue;
    let result = items;
    if (items.length > 4) {
      result = items.slice(1, items.length);
    }
    result = result.slice(0, 4);
    if (result.length >= 2) {
      groups.push({ sentence, items: result });
    }
  }
  return groups;
}

/**
 * 模式 B（累计文本替换）统一锚点：每组只用一个 anchor，不做组内三档轮转。
 *
 * 执行层 `_keyword_anchor_transform_y` 只映射纵向（top→0.6 / center→0.1 / bottom→-0.6），
 * 横向不可控；累计块为多行竖排文本，统一放顶部安全区（transform_y=0.6，向下增长），
 * 保证：不挡人物主体（主体居中）、不压底部基础字幕（基础字幕 y=-0.8）、不出安全区。
 */
const EMPHASIS_GROUP_ANCHOR = 'top_center' as const;

/**
 * 节内重点词强调轨 —— 模式 B：累计文本替换（递进堆叠，不依赖 caption overlap）。
 *
 * 视觉：同一组 4 个阶段，文本逐词累计（\n 换行纵向排列），任意时刻仅 1 个 caption segment：
 *   阶段1: 原料成本
 *   阶段2: 原料成本\n包装形式
 *   阶段3: 原料成本\n包装形式\n起订量
 *   阶段4: 原料成本\n包装形式\n起订量\n生产工艺
 * 阶段窗口首尾相接（[start_i, start_{i+1})，末段到 groupEnd）→ 天然满足执行层 caption no-overlap。
 *
 * 时间：全部来自 TTS_NATIVE 原生逐字时间戳（禁止按字数估算/平均分配/视频段估算）：
 *   - 整句字符按序映射到 nativeWords（容忍 TTS 把标点并入前字）；
 *   - 每个重点词 start = 该词首字对应 native word 的 startMs/1000；
 *   - 每个阶段 end = 下一重点词首字 start（末段 = groupEnd）。
 *
 * 退场：groupEnd = 所在句（semantic section）的真实 TTS_NATIVE 结束时间
 *   （句中最后一个字的 native word endMs），即本句读完才整体退场，下一节字幕进入前完成。
 *
 * 位置：每组统一 anchor（EMPHASIS_GROUP_ANCHOR），不做组内轮转。
 * 样式：同组同一模板 huazi.blue_outline；累计多行本轮使用同一模板样式（不做单行富文本高亮，
 *   避免为局部高亮修改执行层）。
 */
export function buildEmphasisKeywordTrack(
  script: string,
  nativeWords: Array<{ text: string; startMs: number; endMs: number }> | null
): { keywordTrack: KeywordSegment[]; groups: EmphasisGroup[] } {
  const groups: EmphasisGroup[] = [];
  const keywordTrack: KeywordSegment[] = [];
  if (!nativeWords || nativeWords.length === 0) {
    return { keywordTrack, groups };
  }

  const rawGroups = extractEmphasisGroups(script);
  let wi = 0;
  for (const raw of rawGroups) {
    // ── 1) 整句匹配：句子的每个字符按序映射到 TTS_NATIVE 原生词下标 ──
    const sentenceChars = Array.from(raw.sentence);
    if (sentenceChars.length === 0) continue;
    const charToWord: number[] = new Array(sentenceChars.length).fill(-1);
    let ci = 0;
    let j = wi;
    while (j < nativeWords.length && ci < sentenceChars.length) {
      const ch = sentenceChars[ci];
      // 标点字符不要求原生词：TTS 会把标点并入前字（如「度、」「响。」）或独立成词，
      // 统一跳过，避免因找不到「以标点开头」的原生词导致整句匹配失败。
      if (/[、，。；：？！,;:?!]/.test(ch)) {
        ci += 1;
        continue;
      }
      // TTS 字词可能把标点并入前字（如「响。」）：用前缀匹配并容忍该 word 尾随标点
      if (nativeWords[j].text.startsWith(ch)) {
        charToWord[ci] = j;
        ci += 1;
      }
      j += 1;
    }
    wi = j; // 游标单调前进（与旧逻辑一致）
    if (ci !== sentenceChars.length) continue; // 整句未完整匹配 → 跳过本组

    // ── 2) 在句内按序定位每个重点词的字符合法区间 ──
    const itemRanges: Array<{ word: string; startPos: number; endPos: number }> = [];
    let pos = 0;
    let allFound = true;
    for (const word of raw.items) {
      const wc = Array.from(word);
      let startPos = pos;
      while (startPos < sentenceChars.length && sentenceChars[startPos] !== wc[0]) startPos += 1;
      if (startPos + wc.length > sentenceChars.length || startPos >= sentenceChars.length) {
        allFound = false;
        break;
      }
      let matchedPos = true;
      for (let k = 1; k < wc.length; k++) {
        if (sentenceChars[startPos + k] !== wc[k]) {
          matchedPos = false;
          break;
        }
      }
      if (!matchedPos) {
        allFound = false;
        break;
      }
      itemRanges.push({ word, startPos, endPos: startPos + wc.length });
      pos = startPos + wc.length;
    }
    if (!allFound || itemRanges.length === 0) continue;

    // ── 3) 每个重点词的真实 TTS_NATIVE start/end ──
    const items: EmphasisGroupItem[] = itemRanges.map((r) => ({
      word: r.word,
      start: nativeWords[charToWord[r.startPos]].startMs / 1000,
      end: nativeWords[charToWord[r.endPos - 1]].endMs / 1000,
      anchor: EMPHASIS_GROUP_ANCHOR
    }));

    // ── 4) groupEnd = 本句真实 TTS_NATIVE 结束（句中最后一个字的 endMs） ──
    const lastWordEnd = nativeWords[nativeWords.length - 1].endMs / 1000;
    const sentenceEnd = nativeWords[charToWord[sentenceChars.length - 1]].endMs / 1000;
    // 保护：不越过整段音频末尾；且不得早于最后一个重点词读完（避免倒挂）
    const groupEnd = Math.max(Math.min(sentenceEnd, lastWordEnd), items[items.length - 1].end);

    const id = `emph-${groups.length + 1}`;

    // ── 5) 累计替换模式 B：非重叠首尾相接窗口，文本逐词累计 ──
    const finalizedItems: EmphasisGroupItem[] = items.map((item, k) => {
      const end = k < items.length - 1 ? items[k + 1].start : groupEnd;
      // 累计文本：本阶段已出现的全部词，\n 纵向排列（PJD TextSegment 原生支持多行）
      const cumulative = items
        .slice(0, k + 1)
        .map((it) => it.word)
        .join('\n');
      keywordTrack.push({
        id: `${id}-${k + 1}`,
        keyword: cumulative,
        start: round3(item.start),
        duration: Math.max(0.5, round3(end - item.start)),
        styleId: 'huazi.blue_outline',
        anchor: EMPHASIS_GROUP_ANCHOR,
        layer: 5
      });
      return { ...item, end };
    });

    groups.push({
      id,
      sentenceIndex: rawGroups.indexOf(raw),
      items: finalizedItems,
      groupStart: items[0].start,
      groupEnd
    });
  }
  return { keywordTrack, groups };
}

/**
 * MANUAL_TEMPLATE_REFERENCE —— 用户手工真值（来自用户手工修改的黄金草稿
 * ZHIHENG-GOLDEN-EMPHASIS-STACKED-20260904-162931，解密后精确提取）。
 *
 * - 新花字：国庆黄红立体字效 effect_id=7546423084874599705（替代 huazi.blue_outline，
 *   后者外层光晕太重、密集排列时文字边界不清晰；本轮及后续默认禁用 blue_outline）。
 * - 入场动画：向上弹入 id=7123116334677758501，时长 0.5s。
 * - 出场动画：烟雾消散 id=7678658611601493258，时长 0.5s。
 *   （注：用户规格文字写「视线模糊」，但真实草稿中的出场动画为「烟雾消散」，以草稿为准。）
 * - 固定槽位 transform_y：4 个位置自上而下（画面中下部、底部基础字幕 y=-0.8 之上）。
 */
export const TEXT_OVERLAY_MANUAL_REFERENCE = {
  effectResourceId: '7546423084874599705',
  animationInId: '7123116334677758501',
  animationOutId: '7678658611601493258',
  animationDurationUs: 500_000,
  /** 槽位 transform_y（自上而下，与用户手工草稿一致） */
  slotPositionsY: [
    0.043820224719101186, // slot 0
    -0.1528089649221871, // slot 1
    -0.3269662682929735, // slot 2
    -0.5207864930120747 // slot 3
  ]
} as const;

/**
 * Dense Info Wall —— 9:16 固定二维槽位地图（画面中部 + 中下部安全区域，逐项固定不重排）。
 *
 * 坐标：transform 归一化（x 向右为正、y 向上为正；中心 0）。设计原则：
 * - 两列错开 + 中心下部补位，避开中心主体核心区、不贴顶部标题区（y>0.5）、不压底部字幕（y<-0.7）；
 * - 一个信息出现后位置绝对不动（固定 slot），不重新居中/重排。
 */
export const DENSE_SLOT_MAP: Array<{ x: number; y: number }> = [
  { x: -0.45, y: 0.28 }, // slot0 左中上
  { x: 0.45, y: 0.28 }, // slot1 右中上
  { x: -0.45, y: 0.03 }, // slot2 左中
  { x: 0.45, y: 0.03 }, // slot3 右中
  { x: -0.45, y: -0.22 }, // slot4 左中下
  { x: 0.45, y: -0.22 }, // slot5 右中下
  { x: 0.0, y: -0.42 }, // slot6 中下
  { x: 0.0, y: -0.58 } // slot7 中下偏下（底部字幕之上）
];

/** Title Hook 顶部安全区位置（与正文相反，允许放上方点题）。 */
export const TITLE_HOOK_POSITION = { x: 0.0, y: 0.62 } as const;

/** 本轮黄金验证目标组：低糖茶 / 果汁 / 功能饮料 / 气泡饮料（先只验证这一组）。 */
const TEXT_OVERLAY_GOLDEN_GROUP = ['低糖茶', '果汁', '功能饮料', '气泡饮料'];

/**
 * 节内重点词 —— 独立文本对象（Text Overlay）生成（一个信息词 = 一个独立文本对象）。
 *
 * 与累计文本替换（模式 B）的区别：
 * - 模式 B 用「1 个累计多行 caption」模拟堆叠（每次替换都重建大文本块，导致跳动、无独立动画）；
 * - 本实现为每个重点词生成一个独立 overlay 对象：各占独立 text 轨、时间重叠
 *   （start = 各自真实口播 start；end = 同一 groupEnd，组尾共同退场）、
 *   固定槽位（出现后位置不动）、独立入场动画（向上弹入）、共同出场动画（烟雾消散）。
 *
 * 时间：全部来自 TTS_NATIVE 原生逐字时间戳（禁止按字数估算/平均分配/视频段估算）。
 * 本轮黄金范围：只生成 TEXT_OVERLAY_GOLDEN_GROUP（低糖茶组），其余组暂不生成。
 */
export function buildTextOverlayTrack(
  script: string,
  nativeWords: Array<{ text: string; startMs: number; endMs: number }> | null
): { textOverlayTrack: TextOverlaySegment[]; groups: EmphasisGroup[] } {
  const textOverlayTrack: TextOverlaySegment[] = [];
  const groups: EmphasisGroup[] = [];
  if (!nativeWords || nativeWords.length === 0) {
    return { textOverlayTrack, groups };
  }

  const rawGroups = extractEmphasisGroups(script);
  let wi = 0;
  for (const raw of rawGroups) {
    // 本轮黄金：只生成目标组（低糖茶组）；其余组跳过（后续轮次再放开）。
    if (
      raw.items.length !== TEXT_OVERLAY_GOLDEN_GROUP.length ||
      !raw.items.every((w, k) => w === TEXT_OVERLAY_GOLDEN_GROUP[k])
    ) {
      continue;
    }

    // 整句字符 → TTS_NATIVE 原生词下标映射（跳过标点字符：TTS 把顿号并入前字如「度、」）
    const sentenceChars = Array.from(raw.sentence);
    if (sentenceChars.length === 0) continue;
    const charToWord: number[] = new Array(sentenceChars.length).fill(-1);
    let ci = 0;
    let j = wi;
    while (j < nativeWords.length && ci < sentenceChars.length) {
      const ch = sentenceChars[ci];
      if (/[、，。；：？！,;:?!]/.test(ch)) {
        ci += 1;
        continue;
      }
      if (nativeWords[j].text.startsWith(ch)) {
        charToWord[ci] = j;
        ci += 1;
      }
      j += 1;
    }
    wi = j;
    if (ci !== sentenceChars.length) continue;

    // 定位每个重点词的字符合法区间
    const itemRanges: Array<{ word: string; startPos: number; endPos: number }> = [];
    let pos = 0;
    let allFound = true;
    for (const word of raw.items) {
      const wc = Array.from(word);
      let startPos = pos;
      while (startPos < sentenceChars.length && sentenceChars[startPos] !== wc[0]) startPos += 1;
      if (startPos + wc.length > sentenceChars.length || startPos >= sentenceChars.length) {
        allFound = false;
        break;
      }
      let matchedPos = true;
      for (let k = 1; k < wc.length; k++) {
        if (sentenceChars[startPos + k] !== wc[k]) {
          matchedPos = false;
          break;
        }
      }
      if (!matchedPos) {
        allFound = false;
        break;
      }
      itemRanges.push({ word, startPos, endPos: startPos + wc.length });
      pos = startPos + wc.length;
    }
    if (!allFound || itemRanges.length === 0) continue;

    // 每个词的 TTS_NATIVE start；groupEnd = 本句真实 TTS_NATIVE 结束（末字 endMs）
    const wordStarts = itemRanges.map((r) => nativeWords[charToWord[r.startPos]].startMs / 1000);
    const lastWordEnd = nativeWords[nativeWords.length - 1].endMs / 1000;
    const sentenceEnd = nativeWords[charToWord[sentenceChars.length - 1]].endMs / 1000;
    const groupEnd = Math.max(
      Math.min(sentenceEnd, lastWordEnd),
      wordStarts[wordStarts.length - 1]
    );

    const groupId = `overlay-${groups.length + 1}`;
    const items: EmphasisGroupItem[] = itemRanges.map((r, k) => ({
      word: r.word,
      start: round3(wordStarts[k]),
      end: round3(groupEnd),
      anchor: 'top_center' // 占位（独立对象用固定槽位，不再用 3 档 anchor）
    }));

    items.forEach((item, k) => {
      const slotPosY = TEXT_OVERLAY_MANUAL_REFERENCE.slotPositionsY[k] ?? 0;
      textOverlayTrack.push({
        id: `${groupId}-${k + 1}`,
        text: item.word,
        start: item.start,
        end: item.end,
        slotIndex: k,
        positionX: 0,
        positionY: slotPosY,
        effectResourceId: TEXT_OVERLAY_MANUAL_REFERENCE.effectResourceId,
        animationInId: TEXT_OVERLAY_MANUAL_REFERENCE.animationInId,
        animationOutId: TEXT_OVERLAY_MANUAL_REFERENCE.animationOutId,
        animationDurationUs: TEXT_OVERLAY_MANUAL_REFERENCE.animationDurationUs,
        groupId,
        laneIndex: 0,
        layer: 5
      });
    });

    groups.push({
      id: groupId,
      sentenceIndex: rawGroups.indexOf(raw),
      items,
      groupStart: wordStarts[0],
      groupEnd
    });
  }
  return { textOverlayTrack, groups };
}

// ============================================================================
// 全篇视觉包装规划（Visual Packaging Plan）
// ============================================================================

/** LLM 视觉包装类型。 */
export type VisualPackagingType = 'text_single' | 'text_group' | 'sticker' | 'none';

/** 组内单项：sourceText（原文连续子串，用于 TTS 定位） + displayText（画面显示的关键词）。 */
export type PackagingGroupItem = {
  sourceText: string;
  displayText: string;
};

/** 单节包装决策项。 */
export type VisualPackagingItem = {
  type: VisualPackagingType;
  /** text_single / sticker：原文连续子串（TTS_NATIVE 定位用） */
  sourceText?: string;
  /** text_single / sticker：画面显示的关键词（2-6 字，≤8 硬门禁） */
  displayText?: string;
  /** 兼容旧字段：targetText（= sourceText 的别名，仅解析兼容用） */
  targetText?: string;
  /** text_group / sticker：组内各项（sourceText/displayText 分离；Dense 模式允许 >4 项） */
  groupItems?: PackagingGroupItem[];
  /** 资源导演（Resource Director）选择：只能从 Visual Resource Registry 选 resourceKey */
  resourceSelection?: VisualResourceSelection;
  /** LLM 选择理由 */
  reason: string;
  /** 优先级：1=最高 */
  priority: number;
  visualIntent?: string;
  preferredPosition?: string;
};

/** 资源选择（Resource Director 输出，从 Registry 选键，禁止编造）。 */
export type VisualResourceSelection = {
  /** text / sticker */
  visualType: 'text' | 'sticker';
  /** text_single / title / sticker：主资源 key */
  resourceKey?: string;
  /** text_group 轮换模板 keys（2-3 个，同一 styleFamily，保持协调） */
  templateKeys?: string[];
  /** 可选音效 key（克制，默认整篇 ≤5 个） */
  sfxKey?: string;
};

/** 正文包装形态：none / 少量重点（1-3 项）/ 信息墙（≥4 项）。 */
export type VisualPackagingLayoutMode = 'none' | 'small_emphasis' | 'dense_info_wall';

/** 开头 Title Hook 点题（整篇主题摘要，顶部安全区）。 */
export type VisualPackagingTitleHook = {
  /** 主题依据（可为整体主题，不要求严格原文连续子串） */
  sourceText?: string;
  /** 画面显示标题（4-12 字） */
  displayText: string;
  reason: string;
  /** 展示时长（毫秒，建议 2000-4000） */
  durationMs?: number;
  /** 资源导演选择（Resource Director 回填） */
  resourceSelection?: VisualResourceSelection;
};

/** 单节视觉包装决策。 */
export type VisualPackagingSection = {
  sectionId: number;
  sectionText: string;
  /** 按「真正选中的包装信息数量」分级：0→none，1-3→small_emphasis，≥4→dense_info_wall */
  layoutMode: VisualPackagingLayoutMode;
  packaging: VisualPackagingItem[];
};

/** 全篇视觉包装规划（LLM 输出，持久化到任务 packagingOptions）。 */
export type VisualPackagingPlan = {
  titleHook?: VisualPackagingTitleHook;
  sections: VisualPackagingSection[];
};

/** 包装统计（供验收报告）。 */
export type VisualPackagingStats = {
  scriptSections: number;
  packagedSections: number;
  noneSections: number;
  smallEmphasisCount: number;
  denseInfoWallCount: number;
  textSingleCount: number;
  textGroupCount: number;
  textOverlayObjectCount: number;
  stickerCount: number;
  fallbackStickerToTextCount: number;
  collisionCount: number;
  /** 未能在脚本原文找到 sourceText 而跳过的包装项数 */
  unmatchedTargetCount: number;
  /** displayText 超过 8 字的项数（正文硬门禁，应=0） */
  over8CharCount: number;
  /** 最大同时并发 overlay 数（理论所需 lane 数） */
  maxConcurrentOverlayCount: number;
  /** 实际固定轨道池 lane 数 */
  overlayLaneCount: number;
  /** Dense Info Wall 最大单节信息数 */
  maxDenseInfoCount: number;
  /** Dense Slot Map 槽位数（固定 8） */
  denseSlotCount: number;
  /** 是否生成 Title Hook */
  hasTitleHook: boolean;
  /** 字幕无缝覆盖统计 */
  subtitleGapCount: number;
  subtitleOverlapCount: number;
  maxSubtitleGapMs: number;
  /** 资源导演统计 */
  invalidResourceSelectionCount: number;
  stickerSelectedCount: number;
  stickerExecutedCount: number;
  stickerFallbackCount: number;
  sfxSelectedCount: number;
  sfxExecutedCount: number;
  /** 实际使用的文字模板 key（去重） */
  usedTextTemplateKeys: string[];
};

const PACKAGING_LLM_SYSTEM_PROMPT = `你是知衡智企企业短视频的「视觉包装规划器」。请逐节阅读下面这段口播脚本（已按句分段），判断「观众听到这一节时，最需要记住哪几个信息」，并为值得视觉强化的信息给出包装方案。

【核心职责】基础字幕已负责完整呈现语言，包装层只负责【提炼关键词/短词组】，不是把句子复制成大花字。长句做花字会溢出屏幕、像"大字幕"。

【硬性原则】
1. 逐节独立判断，不做全局关键词提取。
2. 默认每节只选 1 个核心包装点；并列/枚举/结构化信息允许 1 组（groupItems 2-4 项）。
3. 包装密度克制：同一时间尽量只有 1 个视觉主题；不要文字墙、不要每个名词都包装。
4. 允许某节 type=none（本节不需要额外视觉强化，只保留基础字幕）。
5. 优先包装：核心判断、并列关键信息、产品类别、行为变化、核心方法结论、强因果。
6. 不包装纯连接词/无独立信息价值的词（如果/因为/所以/但是/同样/一个/这个/真正/可以/需要 等）。

【sourceText / displayText 分离】（最重要）
每个包装项（含 text_group 的每个 groupItem）必须同时给出：
- sourceText：脚本中【连续出现的原文】——逐字复制，禁止改写语序/换词/增删字。用于 TTS_NATIVE 时间定位，不一定直接显示。
- displayText：真正显示在画面上的【关键词/短词组】——经过语义压缩，可以不是原文逐字连续子串，但语义必须准确对应 sourceText。
示例：
  sourceText "最低多少钱一瓶" → displayText "最低报价"（或"最低价"）
  sourceText "不是只由一瓶水决定的" → displayText "报价逻辑"
  sourceText "先把产品方向确认清楚" → displayText "产品方向"
  sourceText "再让工厂根据方案评估成本" → displayText "成本评估"
  sourceText "一改配方" → displayText "改配方"
  sourceText "一换瓶型" → displayText "换瓶型"
  sourceText "一加功能成分" → displayText "加功能"
  sourceText "先确认方案" → displayText "确认方案"

【displayText 长度门禁】（硬性）
- 优先 2-6 个汉字；允许 1-8 个汉字。
- 超过 8 个汉字：默认判定不合格，必须重新压缩成短关键词。
- 禁止把完整句子/长短语直接当 displayText（如"先把产品方向确认清楚"、"再让工厂根据方案评估成本"、"不是只由一瓶水决定的"都是不合格的 displayText）。
- 若某信息无法压缩成有意义的关键词，可以选择 type=none。

【包装类型】
- text_single：抽象概念/结论/数字/行为/提醒/判断（一个独立文字对象），sourceText 填脚本连续原文、displayText 填压缩关键词。
- text_group：连续并列/分类/步骤/多个同层级因素，groupItems 为 [{sourceText, displayText}, ...]。
  注意：Dense Info Wall 模式不限制 4 项上限——若一节确实有 5/6/7 个真正值得展示的信息，允许全部列出；但每个 displayText 必须短（≤8 字）。
  反之：不要为了凑数量硬加无意义项。
- sticker：具体可视化实物（瓶型/原料/功能成分/水果等），仅当有可靠贴图资源时；本轮系统无贴图资源，请尽量选 text_single / text_group。
- none：本节不包装。
priority：1=最高（本节唯一/最优先），2=次之。

【layoutMode（正文包装形态，按真正选中的包装信息数量分级）】
- 0 个 → none
- 1~3 个 → small_emphasis（少量重点提示，少量独立对象，不做大铺屏）
- >=4 个 → dense_info_wall（信息墙：逐项入场、全部保留、铺满安全区、组尾一起退场）
判断依据是【真正选中的包装信息数量】，不是原文名词数量。第 3 节（配方复杂度/原料成本/包装形式/起订量/生产工艺/打样次数/质检要求）若你判断 4 个及以上值得展示 → dense_info_wall（可 5-7 项）；第 4 节（低糖茶/果汁/功能饮料/气泡饮料）4 个 → dense_info_wall；第 5 节（改配方/换瓶型/加功能）3 个 → small_emphasis；第 6/7 节 2 个 → small_emphasis。

【titleHook（开头点题标题，整篇主题摘要）】
- 在 sections 之前输出 titleHook：理解整条视频主题后提炼一个标题，不是复制第一句话。
- displayText：4~10 个汉字，尽量不超过 12。
- 用于视频开头上方点题（如「饮料报价避坑」「饮料代加工怎么报价」）。本轮固定脚本主题是饮料代加工报价避坑。

【输出格式】只输出一个 JSON 对象（不要 markdown 代码块、不要任何解释）：
{"titleHook":{"sourceText":"主题依据","displayText":"标题","reason":"为什么这个标题","durationMs":3000},"sections":[{"sectionId":1,"sectionText":"本节原文","layoutMode":"small_emphasis","packaging":[{"type":"text_single","sourceText":"最低多少钱一瓶","displayText":"最低报价","reason":"为什么选","priority":1,"visualIntent":"逐项出现并保留"}]},{"sectionId":2,"sectionText":"本节原文","layoutMode":"none","packaging":[{"type":"none","reason":"过渡句"}]}]}
sections 数组每节一个对象；layoutMode 必须为 none / small_emphasis / dense_info_wall 之一；packaging 可为空数组或 [{"type":"none"}]。`;

/** 拆分脚本为节（与字幕/重点词同源：按 \n / 。 切分）。 */
function splitScriptSections(script: string): Array<{ id: number; text: string }> {
  return script
    .split(/[\n。]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: i + 1, text }));
}

/** 从 LLM 文本中稳健提取 JSON 对象（{titleHook, sections}；兼容旧数组形态）。 */
function parsePackagingPlanJson(text: string): VisualPackagingPlan {
  let cleaned = text.trim();
  // 去掉 markdown 代码围栏
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const startObj = cleaned.indexOf('{');
  const endObj = cleaned.lastIndexOf('}');
  const startArr = cleaned.indexOf('[');
  const endArr = cleaned.lastIndexOf(']');
  let root: unknown;
  if (startObj >= 0 && endObj > startObj && (startArr < 0 || startArr > startObj)) {
    root = JSON.parse(cleaned.slice(startObj, endObj + 1));
  } else if (startArr >= 0 && endArr > startArr) {
    root = JSON.parse(cleaned.slice(startArr, endArr + 1));
  } else {
    throw new Error('LLM 输出中未找到 JSON 对象/数组');
  }

  // 归一化：新形态 {titleHook, sections} 或旧形态 [sections]
  let titleHookRaw: unknown;
  let sectionsRaw: unknown;
  if (Array.isArray(root)) {
    sectionsRaw = root;
  } else if (typeof root === 'object' && root !== null) {
    const r = root as { titleHook?: unknown; sections?: unknown };
    titleHookRaw = r.titleHook;
    sectionsRaw = Array.isArray(r.sections) ? r.sections : [];
  } else {
    throw new Error('LLM 输出结构无法识别');
  }

  const titleHook: VisualPackagingTitleHook | undefined =
    typeof titleHookRaw === 'object' && titleHookRaw !== null
      ? (() => {
          const t = titleHookRaw as {
            displayText?: unknown;
            sourceText?: unknown;
            reason?: unknown;
            durationMs?: unknown;
          };
          if (typeof t.displayText !== 'string') return undefined;
          return {
            sourceText: typeof t.sourceText === 'string' ? t.sourceText : undefined,
            displayText: t.displayText,
            reason: typeof t.reason === 'string' ? t.reason : '',
            durationMs:
              typeof t.durationMs === 'number' && t.durationMs > 0 ? t.durationMs : undefined
          };
        })()
      : undefined;

  const sections = (Array.isArray(sectionsRaw) ? sectionsRaw : [])
    .filter((sec): sec is VisualPackagingSection => {
      return (
        typeof sec === 'object' &&
        sec !== null &&
        typeof (sec as { sectionId?: unknown }).sectionId === 'number' &&
        typeof (sec as { sectionText?: unknown }).sectionText === 'string' &&
        Array.isArray((sec as { packaging?: unknown }).packaging)
      );
    })
    .map((sec) => ({
      sectionId: sec.sectionId,
      sectionText: sec.sectionText,
      layoutMode: (['none', 'small_emphasis', 'dense_info_wall'].includes(
        (sec as { layoutMode?: unknown }).layoutMode as string
      )
        ? (sec as { layoutMode: VisualPackagingLayoutMode }).layoutMode
        : 'small_emphasis') as VisualPackagingLayoutMode,
      packaging: (sec as { packaging: unknown[] }).packaging
        .filter(
          (p): p is VisualPackagingItem =>
            typeof p === 'object' &&
            p !== null &&
            typeof (p as { type?: unknown }).type === 'string'
        )
        .map((p) => {
          // groupItems 兼容两种形态：string[]（旧）或 [{sourceText,displayText}]（新）
          let groupItems: PackagingGroupItem[] | undefined;
          if (Array.isArray(p.groupItems)) {
            groupItems = p.groupItems
              .map((g: unknown): PackagingGroupItem | null => {
                if (typeof g === 'string') return { sourceText: g, displayText: g };
                if (
                  typeof g === 'object' &&
                  g !== null &&
                  typeof (g as { sourceText?: unknown }).sourceText === 'string'
                ) {
                  const src = (g as { sourceText: string }).sourceText;
                  const disp =
                    typeof (g as { displayText?: unknown }).displayText === 'string'
                      ? (g as { displayText: string }).displayText
                      : src;
                  return { sourceText: src, displayText: disp };
                }
                return null;
              })
              .filter((x): x is PackagingGroupItem => x !== null);
          }
          // 单项目：sourceText/displayText 优先，targetText 兜底
          const sourceText =
            typeof p.sourceText === 'string'
              ? p.sourceText
              : typeof p.targetText === 'string'
                ? p.targetText
                : undefined;
          const displayText =
            typeof p.displayText === 'string' ? p.displayText : sourceText ? sourceText : undefined;
          return {
            type: (['text_single', 'text_group', 'sticker', 'none'].includes(p.type)
              ? p.type
              : 'none') as VisualPackagingType,
            sourceText,
            displayText,
            targetText: sourceText,
            groupItems,
            reason: typeof p.reason === 'string' ? p.reason : '',
            priority: typeof p.priority === 'number' ? p.priority : 1,
            visualIntent: typeof p.visualIntent === 'string' ? p.visualIntent : undefined,
            preferredPosition:
              typeof p.preferredPosition === 'string' ? p.preferredPosition : undefined
          };
        })
    }));
  return { titleHook, sections };
}

/**
 * LLM 对整篇脚本做逐节视觉包装判断。
 * @throws 模型不可用或输出无法解析时抛错（黄金链路应显式暴露，便于区分「LLM 判断问题」与「执行问题」）。
 */
export async function generateVisualPackagingPlan(script: string): Promise<VisualPackagingPlan> {
  const sections = splitScriptSections(script);
  const scriptBlock = sections.map((s) => `${s.id}. ${s.text}`).join('\n');
  // 使用 chatWithTools：可自定义超时（包装 prompt 较大且模型延迟波动明显，实测可达 200s+，放宽到 300s）
  // 与更低温度（提高 JSON 稳定性）。
  const reply = await chatWithTools(
    [
      { role: 'system', content: PACKAGING_LLM_SYSTEM_PROMPT },
      { role: 'user', content: `【脚本】\n${scriptBlock}` }
    ],
    { timeoutMs: 300_000, temperature: 0.2 }
  );
  return parsePackagingPlanJson(reply.text);
}

const RESOURCE_DIRECTOR_SYSTEM_PROMPT = `你是知衡智企企业短视频的「视觉资源导演」。你的职责是：给定已经做好的包装内容判断（每节包装什么、用什么布局、显示什么词），从下面的资源注册表中为每个包装项选择合适资源。你【只能】从注册表中选 resourceKey，禁止编造任何不存在的 key / ID。

【资源注册表】
__RESOURCE_SUMMARY__

【选择规则】
1. visualType：text（文字）/ sticker（贴图）。
2. 文字类选择 resourceKey：
   - 警示/价格风险/踩坑 → text.tpl.explosive_price_01 / text.tpl.super_subsidy_01（pop_price 家族）
   - 强烈推荐/更新/强调 → text.tpl.strong_recommend_01 / text.tpl.anchor_update_01（pop_emphasis 家族）
   - 商务/流程/结论 → text.effect.national_01（business_bold 家族）
   - Title Hook → 优先 title 类贴图 sticker.title_mark_01 或 pop_emphasis 文字模板
3. text_group（Dense Info Wall / 并列组）：给 templateKeys（2-3 个，必须同一 styleFamily，保证视觉协调），执行时会按组内轮换。
4. 贴图（sticker）：非常重要！适合【实物/类别/警示符号/形象化概念】。以下情况【优先选 sticker】：
   - 警示/踩坑/价格风险（如「最低价」「踩坑」「价格」）→ visualType="sticker" + sticker.warning_01 或 sticker.caution_01；
   - Title Hook 标题 → 优先 sticker.title_mark_01；
   - 产品类别/实物（如饮品）若有对应贴图 → 用 sticker。
   只有确实没有合适贴图时才回退 text。
5. 音效 sfxKey：克制！整篇 48-50s 默认最多 3-5 个。适合 Title Hook / 强警示 / 关键结论 / Dense 完成 / 强转折。不要每个词都加。
6. 不知道选什么 → 用 text.effect.national_01。

【输出格式】只输出 JSON 对象（无 markdown 围栏）：
{"titleHook":{"resourceSelection":{"visualType":"text","resourceKey":"text.tpl.explosive_price_01","sfxKey":"sfx.ding_pop_01"}},"sections":[{"sectionId":1,"packaging":[{"resourceSelection":{"visualType":"text","resourceKey":"text.effect.national_01"}}]}]}
sections 数组每节一个对象；packaging 数组与该节包装项一一对应（顺序一致）；每个 resourceSelection 含 visualType + resourceKey（text_group 额外 templateKeys）+ 可选 sfxKey。`;

/** 阶段 2：Visual Resource Director —— 从 Registry 为每个包装项选资源（LLM，只能选真实 key）。 */
export async function directVisualResources(
  plan: VisualPackagingPlan
): Promise<VisualPackagingPlan> {
  if ((plan.sections ?? []).length === 0) return plan;
  const summary = buildResourceRegistrySummary();
  const prompt = RESOURCE_DIRECTOR_SYSTEM_PROMPT.replace('__RESOURCE_SUMMARY__', summary);

  const brief = {
    titleHook: plan.titleHook
      ? { displayText: plan.titleHook.displayText, reason: plan.titleHook.reason }
      : null,
    sections: plan.sections.map((sec) => ({
      sectionId: sec.sectionId,
      layoutMode: sec.layoutMode,
      packaging: sec.packaging.map((p) => ({
        type: p.type,
        displayText: p.displayText,
        groupDisplay: (p.groupItems ?? []).map((g) => g.displayText),
        reason: p.reason
      }))
    }))
  };

  const reply = await chatWithTools(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: `【包装内容判断】\n${JSON.stringify(brief, null, 1)}` }
    ],
    { timeoutMs: 180_000, temperature: 0.2 }
  );
  return applyResourceSelections(plan, reply.text);
}

/** 解析 Resource Director 输出并回填 resourceSelection（无效 key 回退默认并计数）。 */
function applyResourceSelections(plan: VisualPackagingPlan, text: string): VisualPackagingPlan {
  let cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  const startObj = cleaned.indexOf('{');
  const endObj = cleaned.lastIndexOf('}');
  let root: {
    titleHook?: { resourceSelection?: unknown };
    sections?: Array<{ sectionId?: unknown; packaging?: unknown[] }>;
  } = {};
  try {
    if (startObj >= 0 && endObj > startObj) {
      root = JSON.parse(cleaned.slice(startObj, endObj + 1));
    }
  } catch {
    root = {};
  }

  // titleHook 回填
  if (plan.titleHook) {
    const sel = extractSelection(
      (root as { titleHook?: { resourceSelection?: unknown } }).titleHook?.resourceSelection
    );
    if (sel) plan.titleHook.resourceSelection = sel;
  }

  const secMap = new Map<number, { packaging?: unknown[] }>();
  for (const s of (root as { sections?: Array<{ sectionId?: unknown; packaging?: unknown[] }> })
    .sections ?? []) {
    if (typeof s.sectionId === 'number') secMap.set(s.sectionId, s);
  }
  for (const sec of plan.sections ?? []) {
    const rs = secMap.get(sec.sectionId);
    if (!rs || !Array.isArray(rs.packaging)) continue;
    sec.packaging.forEach((item, i) => {
      const raw = rs.packaging?.[i] as { resourceSelection?: unknown } | undefined;
      const sel = extractSelection(raw?.resourceSelection);
      if (sel) item.resourceSelection = sel;
    });
  }
  return plan;
}

/** 校验并规范化一个 resourceSelection（只接受 Registry 中的 key，且资源类型与 visualType 匹配）。 */
function extractSelection(raw: unknown): VisualResourceSelection | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as {
    visualType?: unknown;
    resourceKey?: unknown;
    templateKeys?: unknown;
    sfxKey?: unknown;
  };
  const wantType: 'text' | 'sticker' = r.visualType === 'sticker' ? 'sticker' : 'text';
  const validKey = (key: unknown): key is string =>
    typeof key === 'string' && Boolean(VISUAL_RESOURCE_BY_KEY[key]);

  // 主资源：必须是 Registry 中存在、且类型匹配 visualType
  let resourceKey: string | undefined;
  if (validKey(r.resourceKey)) {
    const res = VISUAL_RESOURCE_BY_KEY[r.resourceKey];
    if (wantType === 'sticker') {
      if (res.resourceType === 'sticker') resourceKey = r.resourceKey;
    } else {
      if (res.resourceType === 'text_effect' || res.resourceType === 'text_template') {
        resourceKey = r.resourceKey;
      }
    }
  }
  // text 类找不到匹配资源 → 回退默认已验证花字
  if (wantType === 'text' && !resourceKey) resourceKey = 'text.effect.national_01';

  const templateKeys = Array.isArray(r.templateKeys)
    ? (r.templateKeys.filter(validKey) as string[]).filter((k) => {
        const res = VISUAL_RESOURCE_BY_KEY[k];
        return res && (res.resourceType === 'text_effect' || res.resourceType === 'text_template');
      })
    : undefined;

  return {
    visualType: wantType,
    resourceKey,
    templateKeys: templateKeys && templateKeys.length > 0 ? templateKeys.slice(0, 3) : undefined,
    sfxKey: validKey(r.sfxKey) ? r.sfxKey : undefined
  };
}

// ============================================================================
// 包装规划 → 独立 Text Overlay（通用 TTS_NATIVE 匹配）
// ============================================================================

/**
 * 在给定句子的 TTS_NATIVE 原生词序列中按序匹配一组词，返回每个词的真实 start 与本句真实结束时间。
 * 若任一目标词未在句中匹配到，返回 null（由调用方跳过并计数）。
 */
function matchWordsInSentence(
  sentence: string,
  words: string[],
  nativeWords: Array<{ text: string; startMs: number; endMs: number }>,
  fromWordIndex: number
): { wordStarts: number[]; sentenceEnd: number; nextWordIndex: number } | null {
  const sentenceChars = Array.from(sentence);
  if (sentenceChars.length === 0) return null;
  const charToWord: number[] = new Array(sentenceChars.length).fill(-1);
  let ci = 0;
  let j = fromWordIndex;
  while (j < nativeWords.length && ci < sentenceChars.length) {
    const ch = sentenceChars[ci];
    if (/[、，。；：？！,;:?!]/.test(ch)) {
      ci += 1;
      continue;
    }
    if (nativeWords[j].text.startsWith(ch)) {
      charToWord[ci] = j;
      ci += 1;
    }
    j += 1;
  }
  if (ci !== sentenceChars.length) return null;

  // 在句内按序定位每个目标词的字符区间（搜索完整词匹配，而非仅首字首次出现——
  // 否则「一改配方」会误匹配「一个很粗的价格」里的「一」）
  const itemRanges: Array<{ startPos: number; endPos: number }> = [];
  let pos = 0;
  for (const word of words) {
    const wc = Array.from(word);
    if (wc.length === 0) return null;
    let startPos = pos;
    let found = false;
    while (startPos + wc.length <= sentenceChars.length) {
      if (sentenceChars[startPos] === wc[0]) {
        let ok2 = true;
        for (let k = 1; k < wc.length; k++) {
          if (sentenceChars[startPos + k] !== wc[k]) {
            ok2 = false;
            break;
          }
        }
        if (ok2) {
          found = true;
          break;
        }
      }
      startPos += 1;
    }
    if (!found) return null;
    itemRanges.push({ startPos, endPos: startPos + wc.length });
    pos = startPos + wc.length;
  }

  const wordStarts = itemRanges.map((r) => nativeWords[charToWord[r.startPos]].startMs / 1000);
  const lastWordEnd = nativeWords[nativeWords.length - 1].endMs / 1000;
  const sentenceEnd = nativeWords[charToWord[sentenceChars.length - 1]].endMs / 1000;
  return { wordStarts, sentenceEnd, nextWordIndex: j };
}

/** 按组长度选择固定槽位（自上而下；已出现对象不重排）。 */
function slotIndicesForCount(n: number): number[] {
  if (n <= 1) return [1];
  if (n === 2) return [1, 2];
  if (n === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

/**
 * 包装规划 → 独立 Text Overlay 对象（一个信息 = 一个独立文本对象，固定轨道池 lane 复用）。
 *
 * - text_single → 1 个 overlay；text_group → N 个 overlay（各词一个）；
 * - sourceText 用于 TTS_NATIVE 定位；displayText 用于画面显示（2-6 字、≤8 字硬门禁，>8 跳过并计数）；
 * - sticker：当前系统无可靠贴图资源，一律降级为 text_group（计入 fallbackStickerToTextCount）；
 * - none / 空 → 不生成；
 * - 时间全部来自 TTS_NATIVE；end = 所在节真实 TTS 结束（组内 end 相同，组尾共同退场）；
 * - lane 分配：greedy interval partitioning（同 lane 内不重叠、不同 lane 允许重叠；轨道池复用）。
 */
export function planToTextOverlays(
  plan: VisualPackagingPlan,
  script: string,
  nativeWords: Array<{ text: string; startMs: number; endMs: number }> | null
): {
  textOverlayTrack: TextOverlaySegment[];
  stickerTrack: StickerPackagingSegment[];
  packagingSfx: PackagingSfxSegment[];
  groups: EmphasisGroup[];
  stats: VisualPackagingStats;
} {
  const textOverlayTrack: TextOverlaySegment[] = [];
  const stickerTrack: StickerPackagingSegment[] = [];
  const packagingSfx: PackagingSfxSegment[] = [];
  const groups: EmphasisGroup[] = [];
  const stats: VisualPackagingStats = {
    scriptSections: 0,
    packagedSections: 0,
    noneSections: 0,
    smallEmphasisCount: 0,
    denseInfoWallCount: 0,
    textSingleCount: 0,
    textGroupCount: 0,
    textOverlayObjectCount: 0,
    stickerCount: 0,
    fallbackStickerToTextCount: 0,
    collisionCount: 0,
    unmatchedTargetCount: 0,
    over8CharCount: 0,
    maxConcurrentOverlayCount: 0,
    overlayLaneCount: 0,
    maxDenseInfoCount: 0,
    denseSlotCount: DENSE_SLOT_MAP.length,
    hasTitleHook: false,
    subtitleGapCount: 0,
    subtitleOverlapCount: 0,
    maxSubtitleGapMs: 0,
    invalidResourceSelectionCount: 0,
    stickerSelectedCount: 0,
    stickerExecutedCount: 0,
    stickerFallbackCount: 0,
    sfxSelectedCount: 0,
    sfxExecutedCount: 0,
    usedTextTemplateKeys: []
  };
  const empty = { textOverlayTrack, stickerTrack, packagingSfx, groups, stats };
  if (!nativeWords || nativeWords.length === 0) {
    return empty;
  }

  const sections = splitScriptSections(script);
  stats.scriptSections = sections.length;
  const planBySection = new Map<number, VisualPackagingSection>();
  for (const sec of plan.sections ?? []) planBySection.set(sec.sectionId, sec);

  // 派生 layoutMode：LLM 已给则用；否则按真正选中的信息数量推导
  const deriveLayout = (count: number): VisualPackagingLayoutMode =>
    count === 0 ? 'none' : count <= 3 ? 'small_emphasis' : 'dense_info_wall';

  let wi = 0; // 跨节单调推进的 TTS 原生词游标
  let groupCounter = 0;

  for (const section of sections) {
    const decided = planBySection.get(section.id);
    const items = decided?.packaging ?? [];
    const actionable = items.filter((p) => p.type !== 'none');
    if (actionable.length === 0) {
      stats.noneSections += 1;
      continue;
    }
    stats.packagedSections += 1;

    // 汇总该节全部 source/display 对（携带所属 item 以便读取 resourceSelection）
    const entries: Array<{ source: string; display: string; item: VisualPackagingItem }> = [];
    for (const item of actionable) {
      if (item.type === 'text_group') {
        for (const g of item.groupItems ?? []) {
          if (g.sourceText)
            entries.push({ source: g.sourceText, display: g.displayText || g.sourceText, item });
        }
      } else if (item.groupItems && item.groupItems.length > 0) {
        for (const g of item.groupItems) {
          if (g.sourceText)
            entries.push({ source: g.sourceText, display: g.displayText || g.sourceText, item });
        }
      } else if (item.sourceText) {
        entries.push({
          source: item.sourceText,
          display: item.displayText || item.sourceText,
          item
        });
      }
      if (item.type === 'text_single') stats.textSingleCount += 1;
      if (item.type === 'text_group') stats.textGroupCount += 1;
      // resourceSelection 校验
      const sel = item.resourceSelection;
      if (sel) {
        if (
          sel.visualType === 'sticker' &&
          (!sel.resourceKey || !VISUAL_RESOURCE_BY_KEY[sel.resourceKey])
        ) {
          stats.invalidResourceSelectionCount += 1;
        }
        if (sel.sfxKey && !VISUAL_RESOURCE_BY_KEY[sel.sfxKey]) {
          stats.invalidResourceSelectionCount += 1;
        }
      }
    }
    if (entries.length === 0) {
      stats.unmatchedTargetCount += 1;
      continue;
    }

    // 布局模式：LLM 已给 layoutMode 则用，否则按真正选中的信息数量推导
    const layout = decided?.layoutMode ?? deriveLayout(entries.length);
    if (layout === 'dense_info_wall') {
      stats.denseInfoWallCount += 1;
      stats.maxDenseInfoCount = Math.max(stats.maxDenseInfoCount, entries.length);
    } else {
      stats.smallEmphasisCount += 1;
    }

    const sourceWords = entries.map((e) => e.source);
    const matched = matchWordsInSentence(section.text, sourceWords, nativeWords, wi);
    if (!matched) {
      stats.unmatchedTargetCount += 1;
      continue;
    }
    wi = matched.nextWordIndex;

    const groupEnd = Math.max(
      Math.min(matched.sentenceEnd, nativeWords[nativeWords.length - 1].endMs / 1000),
      matched.wordStarts[matched.wordStarts.length - 1]
    );
    const groupId = `pkg-${section.id}-${++groupCounter}`;
    const itemRecords: EmphasisGroupItem[] = [];

    // 槽位分配：dense_info_wall → Dense Slot Map 二维固定槽位；small_emphasis → 单列纵向固定槽位
    const isDense = layout === 'dense_info_wall';
    const smallSlotIndices = isDense ? null : slotIndicesForCount(entries.length);

    matched.wordStarts.forEach((start, k) => {
      const entry = entries[k];
      const display = entry.display;
      const item = entry.item;
      // displayText 长度门禁：>8 汉字判定不合格，跳过显示（计入 over8CharCount）
      const displayLen = countChars(display);
      if (displayLen > 8) {
        stats.over8CharCount += 1;
        stats.unmatchedTargetCount += 1;
        return;
      }
      let slotIndex: number;
      let posX: number;
      let posY: number;
      if (isDense) {
        const mapIndex = Math.min(k, DENSE_SLOT_MAP.length - 1);
        slotIndex = mapIndex;
        posX = DENSE_SLOT_MAP[mapIndex].x;
        posY = DENSE_SLOT_MAP[mapIndex].y;
      } else {
        slotIndex = smallSlotIndices![k] ?? k;
        posX = 0;
        posY = TEXT_OVERLAY_MANUAL_REFERENCE.slotPositionsY[slotIndex] ?? 0;
      }

      // 资源选择：sticker → stickerTrack；text → textOverlayTrack（effectResourceId 随资源变化）
      const sel = item.resourceSelection;
      const stickerRes =
        sel?.visualType === 'sticker' && sel.resourceKey
          ? VISUAL_RESOURCE_BY_KEY[sel.resourceKey]
          : undefined;
      if (stickerRes && stickerRes.resourceType === 'sticker' && stickerRes.assetPath) {
        stats.stickerSelectedCount += 1;
        stats.stickerExecutedCount += 1;
        stickerTrack.push({
          id: `${groupId}-${k + 1}-stk`,
          stickerKey: stickerRes.resourceKey,
          materialId: `stk-${stickerRes.resourceKey.replace(/\W/g, '')}-${groupCounter}-${k}`,
          path: stickerRes.assetPath,
          start: round3(start),
          end: round3(groupEnd),
          positionX: posX,
          positionY: posY,
          scale: 1,
          rotation: 0
        });
        // 贴图场景仍保留一个轻量文字标签便于阅读（贴图上方小字）——本轮直接略过文字标签，仅贴图
        return;
      }

      // text 资源：主资源 / templateKeys 轮换（同 styleFamily）
      let effectId: string = TEXT_OVERLAY_MANUAL_REFERENCE.effectResourceId;
      if (sel?.visualType === 'text') {
        const keys =
          sel.templateKeys && sel.templateKeys.length > 0
            ? sel.templateKeys
            : sel.resourceKey
              ? [sel.resourceKey]
              : [];
        if (keys.length > 0) {
          const key = keys[k % keys.length];
          const res = VISUAL_RESOURCE_BY_KEY[key];
          if (res && (res.resourceType === 'text_effect' || res.resourceType === 'text_template')) {
            effectId = res.resourceId;
          }
        }
      }
      if (effectId !== TEXT_OVERLAY_MANUAL_REFERENCE.effectResourceId) {
        if (!stats.usedTextTemplateKeys.includes(effectId))
          stats.usedTextTemplateKeys.push(effectId);
      }
      textOverlayTrack.push({
        id: `${groupId}-${k + 1}`,
        text: display,
        start: round3(start),
        end: round3(groupEnd),
        slotIndex,
        positionX: posX,
        positionY: posY,
        effectResourceId: effectId,
        animationInId: TEXT_OVERLAY_MANUAL_REFERENCE.animationInId,
        animationOutId: TEXT_OVERLAY_MANUAL_REFERENCE.animationOutId,
        animationDurationUs: TEXT_OVERLAY_MANUAL_REFERENCE.animationDurationUs,
        groupId,
        laneIndex: 0, // 固定轨道池 lane 由 allocateOverlayLanes 分配
        layer: 5
      });
      itemRecords.push({
        word: display,
        start: round3(start),
        end: round3(groupEnd),
        anchor: 'top_center'
      });
      stats.textOverlayObjectCount += 1;
    });

    if (itemRecords.length > 0) {
      groups.push({
        id: groupId,
        sentenceIndex: section.id - 1,
        items: itemRecords,
        groupStart: matched.wordStarts[0],
        groupEnd
      });
    }

    // 音效：绑定本节强调对象（组→最后一项入场，代表完成；单项→自身入场）。克制（LLM 决定是否加）。
    for (const item of actionable) {
      const sfxKey = item.resourceSelection?.sfxKey;
      if (!sfxKey || !VISUAL_RESOURCE_BY_KEY[sfxKey]) continue;
      stats.sfxSelectedCount += 1;
      const sfxRes = VISUAL_RESOURCE_BY_KEY[sfxKey];
      if (!sfxRes.assetPath) continue;
      // 找本节对应 overlay 的入场时间：组→最后一项 start；单项→自身 start
      let sfxStart = matched.wordStarts[matched.wordStarts.length - 1];
      if (item.type !== 'text_group' && matched.wordStarts.length === 1) {
        sfxStart = matched.wordStarts[0];
      }
      packagingSfx.push({
        id: `sfx-${groupId}`,
        sfxKey,
        materialId: `sfx-${sfxKey.replace(/\W/g, '')}-${groupCounter}`,
        path: sfxRes.assetPath,
        start: round3(sfxStart),
        duration: round3((sfxRes.durationUs ?? 500000) / 1e6),
        volume: 0.8
      });
      stats.sfxExecutedCount += 1;
    }
  }

  // Title Hook：开头顶部点题（0.2-0.5s 入场，2-4s 退场；不与第一组正文严重冲突）
  if (plan.titleHook?.displayText) {
    stats.hasTitleHook = true;
    const durSec = Math.min(4, Math.max(2, (plan.titleHook.durationMs ?? 3000) / 1000));
    let titleStart = 0.3;
    let titleEnd = titleStart + durSec;
    const firstBodyStart =
      textOverlayTrack.length > 0
        ? Math.min(...textOverlayTrack.map((o) => o.start))
        : Number.POSITIVE_INFINITY;
    if (titleEnd > firstBodyStart - 0.3) {
      titleEnd = Math.max(titleStart + 0.5, firstBodyStart - 0.3);
    }
    // Title Hook 资源：优先 title 贴图（如果选择了 sticker.title_mark_01）否则文字模板
    let titleEffectId: string = TEXT_OVERLAY_MANUAL_REFERENCE.effectResourceId;
    const titleSel = plan.titleHook.resourceSelection;
    const titleSticker =
      titleSel?.visualType === 'sticker' && titleSel.resourceKey
        ? VISUAL_RESOURCE_BY_KEY[titleSel.resourceKey]
        : undefined;
    if (titleSticker && titleSticker.resourceType === 'sticker' && titleSticker.assetPath) {
      stats.stickerSelectedCount += 1;
      stats.stickerExecutedCount += 1;
      stickerTrack.push({
        id: 'title-hook-stk',
        stickerKey: titleSticker.resourceKey,
        materialId: 'stk-title-hook',
        path: titleSticker.assetPath,
        start: round3(titleStart),
        end: round3(titleEnd),
        positionX: 0,
        positionY: 0.72,
        scale: 1,
        rotation: 0
      });
    } else if (titleSel?.visualType === 'text' && titleSel.resourceKey) {
      const res = VISUAL_RESOURCE_BY_KEY[titleSel.resourceKey];
      if (res && (res.resourceType === 'text_effect' || res.resourceType === 'text_template')) {
        titleEffectId = res.resourceId;
      }
    }
    textOverlayTrack.push({
      id: 'title-hook',
      text: plan.titleHook.displayText,
      start: round3(titleStart),
      end: round3(titleEnd),
      slotIndex: 0,
      positionX: TITLE_HOOK_POSITION.x,
      positionY: TITLE_HOOK_POSITION.y,
      effectResourceId: titleEffectId,
      animationInId: TEXT_OVERLAY_MANUAL_REFERENCE.animationInId,
      animationOutId: TEXT_OVERLAY_MANUAL_REFERENCE.animationOutId,
      animationDurationUs: TEXT_OVERLAY_MANUAL_REFERENCE.animationDurationUs,
      groupId: 'title-hook',
      laneIndex: 0,
      layer: 6
    });
    // Title Hook 音效（绑定标题入场）
    const titleSfxKey = titleSel?.sfxKey;
    if (titleSfxKey && VISUAL_RESOURCE_BY_KEY[titleSfxKey]?.assetPath) {
      stats.sfxSelectedCount += 1;
      const sfxRes = VISUAL_RESOURCE_BY_KEY[titleSfxKey];
      packagingSfx.push({
        id: 'sfx-title-hook',
        sfxKey: titleSfxKey,
        materialId: 'sfx-title-hook',
        path: sfxRes.assetPath!,
        start: round3(titleStart),
        duration: round3((sfxRes.durationUs ?? 500000) / 1e6),
        volume: 0.8
      });
      stats.sfxExecutedCount += 1;
    }
  }

  // 视觉冲突检查：同一时间点尽量只有 1 个包装主题；冲突时按组整体后移（低优先级/后开始者延后）
  const resolved = resolveOverlayCollisions(textOverlayTrack);
  stats.collisionCount = resolved.collisions;

  // 固定轨道池分配（greedy interval partitioning）：同 lane 内不重叠、不同 lane 允许重叠
  const laneResult = allocateOverlayLanes(resolved.overlays);
  stats.maxConcurrentOverlayCount = laneResult.maxConcurrent;
  stats.overlayLaneCount = laneResult.laneCount;
  return { textOverlayTrack: laneResult.overlays, stickerTrack, packagingSfx, groups, stats };
}

/**
 * 固定 Text Overlay 轨道池（lane）分配 —— greedy interval partitioning：
 * 按 startMs 升序处理每个 overlay，分配到「最后一个 segment.endMs <= 当前 startMs」的第一条 lane；
 * 找不到则新建 lane。同一 time_group 内（start 不同、end 相同）必然进入不同 lane；
 * 时间不重叠的对象复用已有 lane。返回 laneCount / maxConcurrent（理论峰值并发）。
 */
export function allocateOverlayLanes(overlays: TextOverlaySegment[]): {
  overlays: TextOverlaySegment[];
  laneCount: number;
  maxConcurrent: number;
} {
  if (overlays.length === 0) {
    return { overlays, laneCount: 0, maxConcurrent: 0 };
  }
  const sorted = [...overlays].sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  for (const o of sorted) {
    let lane = -1;
    for (let l = 0; l < laneEnds.length; l++) {
      if (laneEnds[l] <= o.start + 1e-9) {
        lane = l;
        break;
      }
    }
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    o.laneIndex = lane;
    laneEnds[lane] = Math.max(laneEnds[lane], o.end);
  }
  // 理论峰值并发：扫描线（start +1 / end -1）
  const events: Array<[number, number]> = [];
  for (const o of sorted) {
    events.push([o.start, 1]);
    events.push([o.end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let active = 0;
  let maxConcurrent = 0;
  for (const [, d] of events) {
    active += d;
    maxConcurrent = Math.max(maxConcurrent, active);
  }
  // 恢复按 start 排序
  sorted.sort((a, b) => a.start - b.start);
  return { overlays: sorted, laneCount: laneEnds.length, maxConcurrent };
}

/**
 * 视觉包装冲突检查（packaging collision check）：
 * 同一时间只保留 1 个主导主题 —— 若后一组的最早入场早于前一组的最晚退场，
 * 将后一组整体延后（保留组内逐项错峰），确保前一组先完成、下一组再入场。
 * 返回处理后的 overlays 与冲突次数。
 */
export function resolveOverlayCollisions(overlays: TextOverlaySegment[]): {
  overlays: TextOverlaySegment[];
  collisions: number;
} {
  if (overlays.length === 0) return { overlays, collisions: 0 };
  const byGroup = new Map<string, TextOverlaySegment[]>();
  for (const o of overlays) {
    const gid = o.groupId ?? o.id;
    const arr = byGroup.get(gid) ?? [];
    arr.push(o);
    byGroup.set(gid, arr);
  }
  const groupList = [...byGroup.values()].sort((a, b) => {
    const minA = Math.min(...a.map((o) => o.start));
    const minB = Math.min(...b.map((o) => o.start));
    return minA - minB;
  });

  let lastEnd = 0;
  let collisions = 0;
  const result: TextOverlaySegment[] = [];
  for (const g of groupList) {
    const minStart = Math.min(...g.map((o) => o.start));
    if (minStart < lastEnd - 1e-9) {
      const delta = lastEnd - minStart;
      collisions += 1;
      for (const o of g) {
        // 整组整体后移（保留逐项错峰），且不越过自身 end（保持最小 0.5s 展示）
        const end = o.end;
        let newStart = round3(o.start + delta);
        if (newStart >= end) newStart = round3(Math.max(0, end - 0.5));
        o.start = newStart;
      }
    }
    const maxEnd = Math.max(...g.map((o) => o.end));
    lastEnd = Math.max(lastEnd, maxEnd);
    result.push(...g);
  }
  // 恢复按 start 排序
  result.sort((a, b) => a.start - b.start);
  return { overlays: result, collisions };
}

/** 字幕对齐记录（供对齐报告与后续诊断）。 */
export type SubtitleAlignmentItem = {
  text: string;
  start: number;
  end: number;
  duration: number;
  source: SubtitleAlignmentSource;
};

/**
 * 基础底部字幕轨（真实音频对齐版）：
 * - 字幕文本仍按「标点优先 + ≤12 字语义拆分」对【完整脚本】拆分；
 * - 若提供真实语音段（VAD，来自最终 1.3x 音频）：按「累计文本 → 累计语音时长 → 真实墙钟时间」
 *   映射每个短字幕的 start/end（停顿处自动形成空档），alignmentSource = VAD_ALIGNED；
 * - 否则：按文本长度占比分配整个配音时长，alignmentSource = FALLBACK_ESTIMATE。
 */
export function buildSubtitleTrackWithAlignment(
  fullScript: string,
  opts: {
    speechSegments?: VoiceSpeechSegment[] | null;
    voiceDuration?: number;
    nativeWords?: Array<{ text: string; startMs: number; endMs: number }> | null;
  } = {}
): { subtitleTrack: SubtitleSegment[]; alignment: SubtitleAlignmentItem[] } {
  const chunks = segmentSubtitleText(fullScript);
  const empty = {
    subtitleTrack: [] as SubtitleSegment[],
    alignment: [] as SubtitleAlignmentItem[]
  };
  if (chunks.length === 0) return empty;

  const segments = opts.speechSegments;
  const voiceDuration = opts.voiceDuration ?? 0;
  const nativeWords =
    Array.isArray(opts.nativeWords) && opts.nativeWords.length > 0 ? opts.nativeWords : null;
  const useReal =
    Array.isArray(segments) &&
    segments.length > 0 &&
    segments.every((s) => s.end > s.start) &&
    voiceDuration > 0;

  const subtitleTrack: SubtitleSegment[] = [];
  const alignment: SubtitleAlignmentItem[] = [];
  const totalChars = chunks.reduce((sum, chunk) => sum + countChars(chunk), 0) || 1;

  // ── 优先级 1：TTS 原生逐字时间戳（字级，最精确） ──
  if (nativeWords && nativeWords.length >= chunks.length) {
    // 把每个字幕 chunk 作为 word 序列的子序列顺序匹配（跳过标点 word）
    const ranges: Array<{ startIdx: number; endIdx: number } | null> = [];
    let wi = 0;
    let matchedAll = true;
    for (const chunk of chunks) {
      const chars = Array.from(chunk);
      let startIdx = -1;
      let endIdx = -1;
      let ci = 0;
      while (wi < nativeWords.length && ci < chars.length) {
        // TTS 字词可能把标点并入前字（如「试。」）：用前缀匹配并容忍该 word 尾随标点
        if (nativeWords[wi].text.startsWith(chars[ci])) {
          if (startIdx < 0) startIdx = wi;
          endIdx = wi;
          ci += 1;
        }
        wi += 1;
      }
      if (ci === chars.length && startIdx >= 0) {
        ranges.push({ startIdx, endIdx });
      } else {
        ranges.push(null);
        matchedAll = false;
      }
    }
    if (matchedAll) {
      let prevEnd = 0;
      chunks.forEach((text, index) => {
        const r = ranges[index] as { startIdx: number; endIdx: number };
        let start = round3(nativeWords[r.startIdx].startMs / 1000);
        let end = round3(nativeWords[r.endIdx].endMs / 1000);
        if (start < prevEnd) start = prevEnd;
        if (end <= start) end = start + 0.05;
        alignment.push({
          text,
          start,
          end,
          duration: round3(end - start),
          source: 'TTS_NATIVE'
        });
        subtitleTrack.push({
          id: `sub-${index + 1}`,
          start,
          duration: round3(end - start),
          text,
          styleId: 'subtitle.default',
          highlights: []
        });
        prevEnd = end;
      });
      return { subtitleTrack, alignment };
    }
  }

  // ── 优先级 2：VAD 真实语音段对齐 ──
  if (useReal) {
    // 语音段累计偏移表
    const cumSpeech: Array<{ offset: number; seg: VoiceSpeechSegment }> = [];
    let acc = 0;
    for (const seg of segments) {
      cumSpeech.push({ offset: acc, seg });
      acc += seg.end - seg.start;
    }
    const totalSpeech = acc || 1;

    // 贪心打包：按顺序把字幕装进真实语音段（一段的容量按其时长占语音总时长比例）。
    // 字幕边界落在真实停顿处 → 段间自然形成空档；段内（无停顿）则紧贴连续。
    const chunkChars = chunks.map((text) => countChars(text));
    const totalCharsAll = chunkChars.reduce((a, b) => a + b, 0) || 1;
    const segCapChars = segments.map(
      (seg) => ((seg.end - seg.start) / totalSpeech) * totalCharsAll
    );
    const owner: number[] = [];
    let sIdx = 0;
    let sUsedChars = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (
        sIdx < segments.length - 1 &&
        segCapChars[sIdx] > 0 &&
        sUsedChars + chunkChars[i] > segCapChars[sIdx]
      ) {
        sIdx += 1;
        sUsedChars = 0;
      }
      owner.push(sIdx);
      sUsedChars += chunkChars[i];
    }
    const segCharsCount: Record<number, number> = {};
    for (let i = 0; i < chunks.length; i++) {
      segCharsCount[owner[i]] = (segCharsCount[owner[i]] ?? 0) + chunkChars[i];
    }
    const segCursorChars: Record<number, number> = {};

    let prevEnd = 0;
    chunks.forEach((text, index) => {
      const s = owner[index];
      const seg = segments[s];
      const segTotalChars = segCharsCount[s] ?? chunkChars[index];
      const segDur = seg.end - seg.start;
      const before = segCursorChars[s] ?? 0;
      const cc = chunkChars[index];
      let start = round3(seg.start + (before / segTotalChars) * segDur);
      let end = round3(seg.start + ((before + cc) / segTotalChars) * segDur);
      segCursorChars[s] = before + cc;
      if (start < prevEnd) start = prevEnd;
      if (end <= start) end = start + 0.05;
      alignment.push({
        text,
        start,
        end,
        duration: round3(end - start),
        source: 'VAD_ALIGNED'
      });
      subtitleTrack.push({
        id: `sub-${index + 1}`,
        start,
        duration: round3(end - start),
        text,
        styleId: 'subtitle.default',
        highlights: []
      });
      prevEnd = end;
    });
  } else {
    let cursor = 0;
    let prevEnd = 0;
    chunks.forEach((text, index) => {
      const dur =
        index === chunks.length - 1
          ? Math.max(0.1, voiceDuration - cursor)
          : round3((countChars(text) / totalChars) * voiceDuration);
      let start = round3(cursor);
      if (start < prevEnd) start = prevEnd;
      const end = round3(Math.max(start + 0.05, start + dur));
      alignment.push({
        text,
        start,
        end,
        duration: round3(end - start),
        source: 'FALLBACK_ESTIMATE'
      });
      subtitleTrack.push({
        id: `sub-${index + 1}`,
        start,
        duration: round3(end - start),
        text,
        styleId: 'subtitle.default',
        highlights: []
      });
      prevEnd = end;
      cursor = end;
    });
  }
  return { subtitleTrack, alignment };
}

/**
 * 规则 A：基础字幕全程无视觉空档（seamless coverage）。
 *
 * 不改字幕 start（仍为 TTS_NATIVE 真实进入时间），只延长每条字幕 end 到「下一条字幕 start」，
 * 保证口播期间字幕连续存在；最后一条延长到配音结束时间。
 * 返回【延长后最终状态】的 gap/overlap 统计（容忍值 20ms）。
 */
export function fillSubtitleGaps(
  subtitleTrack: SubtitleSegment[],
  voiceDuration: number
): { gapCount: number; overlapCount: number; maxGapMs: number } {
  const sorted = [...subtitleTrack].sort((a, b) => a.start - b.start);

  // 1) 只延长 end（不改 start / 文本 / 样式）
  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    if (i < sorted.length - 1) {
      const nextStart = sorted[i + 1].start;
      seg.duration = round3(Math.max(seg.duration, nextStart - seg.start));
    } else {
      // 最后一条：延长到配音结束（不过度超过 voice end）
      seg.duration = round3(Math.max(seg.duration, voiceDuration - seg.start));
    }
  }

  // 2) 最终校验（延长后）：gap / overlap / maxGapMs
  let gapCount = 0;
  let overlapCount = 0;
  let maxGapMs = 0;
  for (let i = 0; i < sorted.length; i++) {
    const end = round3(sorted[i].start + sorted[i].duration);
    if (i < sorted.length - 1) {
      const nextStart = sorted[i + 1].start;
      if (end > nextStart + 1e-9) {
        overlapCount += 1;
      } else if (nextStart - end > 1e-9) {
        gapCount += 1;
        maxGapMs = Math.max(maxGapMs, Math.round((nextStart - end) * 1000));
      }
    } else {
      const gapToVoiceMs = Math.round((voiceDuration - end) * 1000);
      if (gapToVoiceMs > 20) {
        gapCount += 1;
        maxGapMs = Math.max(maxGapMs, gapToVoiceMs);
      }
    }
  }
  return { gapCount, overlapCount, maxGapMs };
}

export function buildUnifiedTimelineFromAutomationDraft(
  plan: CreateVideoPlanOutput,
  taskId: string,
  opts: {
    outputProfile?: typeof DEFAULT_OUTPUT_PROFILE;
    /** 由调用方按「真实音频对齐」计算好的字幕轨；缺省回退到每视频段估算。 */
    subtitleTrackOverride?: SubtitleSegment[];
    /** 节内重点词强调轨（文字模板）；缺省为空（不写入脏块）。 */
    emphasisTrackOverride?: KeywordSegment[];
    /** 独立文本覆盖轨（一个信息词 = 一个独立文本对象）；缺省为空。 */
    textOverlayTrackOverride?: TextOverlaySegment[];
    /** 包装贴图轨（sticker，来自 Registry）；缺省为空。 */
    stickerTrackOverride?: StickerPackagingSegment[];
    /** 包装音效（sfx，来自 Registry）；缺省为空。 */
    packagingSfxOverride?: PackagingSfxSegment[];
  } = {}
): UnifiedTimelineV2 {
  const outputProfile = opts.outputProfile ?? DEFAULT_OUTPUT_PROFILE;

  const validSegments = plan.timeline.filter(
    (
      item
    ): item is VideoPlanTimelineItem & { asset: NonNullable<VideoPlanTimelineItem['asset']> } =>
      Boolean(item.asset?.relativePath || item.asset?.assetId) &&
      item.asset.sourceStart != null &&
      item.asset.sourceEnd != null &&
      item.asset.sourceEnd > item.asset.sourceStart
  );

  const videoTrack: VideoSegmentV2[] = validSegments.map((item) => {
    const sourceStart = round3(item.asset.sourceStart as number);
    const duration = round3((item.asset.sourceEnd as number) - (item.asset.sourceStart as number));
    // 优先用 relativePath：剪映 Worker 按 <assetRoot>/<relativePath> 解析真实文件。
    // （短 assetId 是素材索引 id，Worker 无法直接解析到物理文件）
    const assetId =
      item.asset.relativePath ?? item.asset.assetId ?? item.asset.fileName ?? `asset-${item.order}`;
    const transition =
      item.transitionOut === 'dissolve' ? ('dissolve' as const) : ('hard_cut' as const);
    return {
      assetRef: { type: 'library_asset', assetId },
      sourceStart,
      duration: Math.max(0.1, duration),
      transition,
      sourceAudioMuted: true
    };
  });

  if (videoTrack.length === 0) {
    throw new Error('Video Plan 没有可用的企业素材片段，无法生成 UnifiedTimelineV2');
  }

  const starts = deriveVideoTimelineStartsV2({
    schemaVersion: 2,
    timelineId: `tl-${taskId}`,
    taskId,
    outputProfile,
    videoTrack,
    voiceTrack: [],
    subtitleTrack: [],
    titleTrack: []
  } as UnifiedTimelineV2);
  const totalDuration = starts.reduce((sum, s) => sum + s.timelineEnd, 0);

  // 字幕轨：优先使用调用方按真实音频对齐好的字幕轨；否则按每视频段估算。
  const subtitleTrack: SubtitleSegment[] =
    opts.subtitleTrackOverride ?? buildSubtitleTrack(validSegments, starts);

  // 重点词模板轨：由调用方按「节内重点词 + TTS_NATIVE 真实时间」生成（emphasisTrackOverride）。
  // 不再把 topic / 风格名 / 脚本片段写入时间轴（避免脚本文案/风格说明脏块）。
  const keywordTrack: KeywordSegment[] = opts.emphasisTrackOverride ?? [];

  // 独立文本覆盖轨：一个信息词 = 一个独立文本对象（独立 text 轨、时间重叠、独立动画）。
  const textOverlayTrack: TextOverlaySegment[] = opts.textOverlayTrackOverride ?? [];
  const stickerTrack: StickerPackagingSegment[] = opts.stickerTrackOverride ?? [];
  const packagingSfx: PackagingSfxSegment[] = opts.packagingSfxOverride ?? [];

  return {
    schemaVersion: 2,
    timelineId: `tl-${taskId}`,
    taskId,
    outputProfile,
    videoTrack,
    voiceTrack: [],
    subtitleTrack,
    titleTrack: [],
    bgmTrack: undefined,
    sfxTrack: undefined,
    keywordTrack,
    textOverlayTrack,
    stickerTrack,
    packagingSfx
  };
}

/**
 * 生成真实 1.3x 最终配音（复用 Voice Service）。
 *
 * 责任边界：
 * - 仅调用 Voice Service 公开 HTTP 接口（/v1/tts），不接触 Worker/PJD 内部。
 * - 返回音频落盘到企业素材根目录 audio/ 下，并以 UnifiedTimelineV2 VoiceSegment 引用，
 *   由剪映适配器在生成期按 assetRoot 解析（与 PJD-REAL-EDIT-02-AUDIO 规格一致）。
 * - 语速固定 1.3x（产品规格），作为最终音频时间基准。
 *
 * @returns 可直接放入 timeline.voiceTrack 的 VoiceSegment
 * @throws Voice Service 不可用时抛出，由主链转为人性化失败（可重试）。
 */
async function generateRealVoice(
  script: string,
  taskId: string,
  assetRoot: string
): Promise<{
  segment: VoiceSegment;
  speechSegments: VoiceSpeechSegment[] | null;
  nativeWords: Array<{ text: string; startMs: number; endMs: number }> | null;
}> {
  const voiceId = process.env.VOICE_DEFAULT_ID || 'enterprise_default';
  const audio = await generateVoiceAudio({
    text: script,
    voiceId,
    speed: 1.3,
    volume: 1.0
  });
  const audioDir = path.join(assetRoot, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const fileName = `voice_${taskId.replace(/-/g, '').slice(0, 12)}.mp3`;
  const dest = path.join(audioDir, fileName);
  await fs.copyFile(audio.audio_path, dest);
  return {
    segment: {
      assetRef: { type: 'library_asset', assetId: `audio/${fileName}` },
      start: 0,
      duration: Math.max(0.1, audio.duration),
      volume: 1.0
    },
    speechSegments: Array.isArray(audio.speech_segments) ? audio.speech_segments : null,
    nativeWords:
      audio.timing?.source === 'TTS_NATIVE' && Array.isArray(audio.timing.words)
        ? audio.timing.words
        : null
  };
}

/**
 * 运行自动剪辑 Agent 上游主链（真实执行）。
 * 复用项目既有 Agent 工具（create_video_plan / save_video_plan_as_draft）与模型配置，
 * 不调用 MoneyPrinter / PJD / JianYingAdapter。
 */
export async function runAgentAutoEditPipeline(
  params: AgentAutoEditParams
): Promise<AgentAutoEditResult> {
  const { workspaceSlug, userMessage, userId, userName, userRole, workspaceRole } = params;
  const useLlm = params.useLlm !== false;

  const workspace = getWorkspaceBySlug(workspaceSlug);
  if (!workspace) {
    throw new Error('工作空间不存在');
  }

  const ctx: ToolExecutionContext = {
    userId,
    userName: userName ?? '知衡助手',
    userRole: userRole ?? 'member',
    workspaceId: workspace.id,
    workspaceRole: workspaceRole ?? 'editor'
  };

  // 1) queued（草稿任务创建前不落库，逻辑阶段）
  // 2) 脚本提取（真实模型）/ 候选素材统计（真实企业素材索引）
  const modelConfig = await getResolvedLlmConfig();
  const modelUsed = modelConfig
    ? { provider: modelConfig.provider, model: modelConfig.model }
    : null;
  const script = useLlm ? await extractScriptWithLlm(userMessage) : userMessage.trim();

  const candidateSearch = await searchVideoClips({
    query: userMessage,
    limit: 50,
    // 规划阶段：主题候选统计基于真实索引元数据，不要求物理文件已挂载。
    requireFileExists: false
  });
  const candidateCount = candidateSearch.length;

  // 3) 【先配音】真实 1.3x 最终音频（Voice Service，作为时间基准）。
  //    素材规划必须发生在最终音频生成之后：拿到真实 duration 后再决定目标视频时长。
  const assetRoot = await getPath('assets');
  const voiceId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let voice;
  try {
    voice = await generateRealVoice(script, voiceId, assetRoot);
  } catch (voiceErr) {
    const reason = voiceErr instanceof Error ? voiceErr.message : 'Voice Service 不可用';
    throw new Error(`配音生成失败：${reason}`);
  }
  const finalVoiceDuration = voice.segment.duration;

  // 4) 【后规划】把最终配音时长作为目标视频时长传给素材规划（createVideoPlanTool 按时长预算选素材）。
  const plan = await createVideoPlanTool.execute(
    {
      userRequest: userMessage,
      script,
      platform: '抖音',
      targetDuration: finalVoiceDuration,
      videoRatio: '9:16'
    },
    ctx
  );

  // 5) loading_assets 完成 → save_video_plan_as_draft（写入真实草稿任务，status='draft'）
  const draft = await saveVideoPlanAsDraftTool.execute({ workspaceSlug, plan }, ctx);
  updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'generating_voice');

  // 6) 字幕：按真实 1.3x 音频的语音段（VAD 停顿）对齐；无语音段时回退估算并记录。
  const { subtitleTrack, alignment } = buildSubtitleTrackWithAlignment(script, {
    speechSegments: voice.speechSegments,
    voiceDuration: finalVoiceDuration,
    nativeWords: voice.nativeWords
  });
  const usedRealAlignment =
    alignment.length > 0 &&
    alignment.every((item) => item.source === 'TTS_NATIVE' || item.source === 'VAD_ALIGNED');
  if (!usedRealAlignment) {
    console.warn(
      'SUBTITLE_ALIGNMENT_FAILED: 未获得 TTS_NATIVE/VAD 真实时序，字幕使用 FALLBACK_ESTIMATE。'
    );
  }

  // 规则 A：基础字幕全程无视觉空档（只延长 end 到下一条 start / 配音结束，不改 start 与文本）。
  const subtitleGapStats = fillSubtitleGaps(subtitleTrack, finalVoiceDuration);
  // 同步对齐记录（诊断用）的 end/duration
  for (let i = 0; i < alignment.length && i < subtitleTrack.length; i++) {
    const seg = subtitleTrack[i];
    alignment[i].end = round3(seg.start + seg.duration);
    alignment[i].duration = round3(seg.duration);
  }
  writeSubtitleAlignment(workspace.id, draft.taskId, alignment);

  // 7) 全篇视觉包装（两阶段 LLM）：
  //    阶段1 Content Packaging Planner：逐节判断包装什么（含 Title Hook / layoutMode / source/display）。
  //    阶段2 Visual Resource Director：从 Visual Resource Registry 为每个包装项选资源（text/sticker/sfx）。
  //    执行：一个信息 = 一个独立 Text Overlay / Sticker，固定轨道池；keywordTrack 保持空。
  const packagingPlan = await generateVisualPackagingPlan(script);
  const resourceDirectedPlan = await directVisualResources(packagingPlan);
  const {
    textOverlayTrack,
    stickerTrack,
    packagingSfx,
    groups: emphasisGroups,
    stats: packagingStats
  } = planToTextOverlays(resourceDirectedPlan, script, voice.nativeWords);
  packagingStats.subtitleGapCount = subtitleGapStats.gapCount;
  packagingStats.subtitleOverlapCount = subtitleGapStats.overlapCount;
  packagingStats.maxSubtitleGapMs = subtitleGapStats.maxGapMs;
  writeVisualPackagingPlan(
    workspace.id,
    draft.taskId,
    resourceDirectedPlan as unknown as VisualPackagingPlanRecord
  );
  writeEmphasisGroups(workspace.id, draft.taskId, emphasisGroups);

  // 8) 构建 UnifiedTimelineV2（无后处理拉伸；plan 已按配音时长对齐；字幕用真实对齐轨；重点词用独立文本覆盖轨）
  const timeline = buildUnifiedTimelineFromAutomationDraft(plan, draft.taskId, {
    subtitleTrackOverride: subtitleTrack,
    emphasisTrackOverride: [],
    textOverlayTrackOverride: textOverlayTrack,
    stickerTrackOverride: stickerTrack,
    packagingSfxOverride: packagingSfx
  });
  timeline.voiceTrack = [voice.segment];

  // recommendedCuts 使用数 / avoidCuts 数（方案 source 即来自 recommendedStart/End；avoidCuts 由搜索阶段排除）
  const recommendedCutsUsed = plan.timeline.filter(
    (item) => item.asset.sourceStart != null && item.asset.sourceEnd != null
  ).length;
  const avoidCutsCount = 0;

  // 7) 时长对齐校验：sum(videoSegments.duration) 必须达到 finalVoiceDuration ± 300ms。
  //    轻微不足（≤300ms）：最后一帧保持（源容量允许时）。
  //    明显不足：问题在 Plan 层解决，直接明确报错，不生成短于配音的 Timeline。
  const videoTotal = calculateVideoTotalDurationV2(timeline);
  const shortfall = finalVoiceDuration - videoTotal;
  if (shortfall > 0.3) {
    const reason = `配音时长约 ${Math.round(finalVoiceDuration)} 秒，但素材最多覆盖约 ${Math.round(
      videoTotal
    )} 秒。请缩短脚本或更换脚本风格后重试。`;
    updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'failed', undefined, reason);
    throw new Error(reason);
  }
  if (shortfall > 0) {
    // ≤300ms：把最后一帧补足（源容量允许时）
    const last = timeline.videoTrack[timeline.videoTrack.length - 1];
    const maxEnd = await assetDurationsOfPath(last.assetRef.assetId);
    const canHold = maxEnd != null ? maxEnd - last.sourceStart : last.duration + shortfall;
    if (canHold >= last.duration + shortfall - 0.01) {
      last.duration = round3(last.duration + shortfall);
    }
  }

  const validation = validateTimeline(timeline);

  // 8) 写入阶段：validating_timeline → ready_for_jianying（或 failed，带可读原因）
  updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'validating_timeline');
  if (validation.valid) {
    updateAutomationVideoTaskAgentStage(workspace.id, draft.taskId, 'ready_for_jianying', timeline);
  } else {
    const firstError = validation.errors?.[0];
    updateAutomationVideoTaskAgentStage(
      workspace.id,
      draft.taskId,
      'failed',
      undefined,
      firstError ? `剪辑方案校验未通过：${firstError.message}` : '剪辑方案校验未通过，请重试'
    );
  }

  return {
    taskId: draft.taskId,
    editorUrl: draft.editorUrl,
    stage: validation.valid ? 'ready_for_jianying' : 'failed',
    script,
    modelUsed,
    candidateCount,
    assetCount: timeline.videoTrack.length,
    recommendedCutsUsed,
    avoidCutsCount,
    plan,
    timeline,
    validation,
    coverage: plan.coverage,
    jianyingAdapterInterface: JIANYING_ADAPTER_INTERFACE,
    visualPackagingPlan: packagingPlan,
    visualPackagingStats: packagingStats
  };
}
