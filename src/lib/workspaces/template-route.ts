/**
 * Template Route Orchestration —— 模板路线正式编排
 *
 * 按最新 SOP（docs/automation-editing-sop.md）：
 * - 正式自动剪辑只走模板路线：人工剪映草稿 → 蒸馏企业模板 → 按模板复用。
 * - Template Route：读企业模板资产 → LLM 按 Slot Constraint 生成文案 → 字数校验
 *   → 复制母版 + PJD 替换（step4_fill）→ 结构验证（step5_verify）。
 *
 * 边界：
 * - 未指定或未匹配企业模板时，不回退自由剪辑，要求先选择或蒸馏模板。
 * - PJD 只做确定性执行；语义决策（选什么文案/素材）由本编排层 + LLM 完成。
 * - 企业模板属于客户 Obsidian（resolveWorkspaceAsset('templateRoot')）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chat, getResolvedLlmConfig } from '@/lib/ai';
import { generateVoiceAudio } from '@/lib/voice-service/client';
import { resolveWorkspaceAsset } from '@/lib/system-assets';
import { loadTemplateAsset, listTemplateAssets, listUsableTemplateAssets } from '@/lib/templates';
import { searchVideoClips } from '@/lib/agent/video-asset-index';
import {
  validateReplacementText,
  countVisibleChineseChars,
  type TemplateAsset,
  type TemplateTextSlot
} from '@/lib/templates/asset-schema';
import { getWorkspaceBySlug } from './service';

// ============================================================================
// 路线决策
// ============================================================================

export type EditingRoute = 'template' | 'no_template';

export interface RouteDecision {
  route: EditingRoute;
  /** 指定/选中的模板 ID（template 路线） */
  templateId?: string;
  /** 决策原因 */
  reason: string;
}

/** 从用户请求提取显式模板指定（"按 XX 模板 / 用 XX 模板 / XX 模板"）。 */
export function extractTemplateRequest(userMessage: string): string | null {
  const m = userMessage.match(
    /按\s*([^\s，。,.]+?)\s*模板|用\s*([^\s，。,.]+?)\s*模板|([^\s，。,.]+?)\s*模板\s*(?:剪|做|生成|来)/
  );
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3])?.trim() || null;
}

/** 片段匹配（支持"0828避坑"= ID 前缀 + 名字片段的混合记忆）：拆成数字段/中文段，各段分别在候选中命中即可。 */
function segmentMatch(needle: string, haystack: string): boolean {
  if (!needle || needle.length < 2) return false;
  const segments = needle.match(/\d+|[^\d\s]+/g) ?? [];
  if (segments.length < 2) return false;
  return segments.every((seg) => (seg.length >= 2 ? haystack.includes(seg) : true));
}

/**
 * 早期分支决策：
 * 1) 用户显式指定模板 → 检查企业模板库是否可用
 * 2) 未指定 → 检索企业模板库（approved / 显式 testing）
 * 3) 无合适模板 → 阻断，要求先选择/蒸馏企业模板
 */
export async function decideRoute(
  workspaceSlug: string,
  userMessage: string
): Promise<RouteDecision> {
  const workspace = getWorkspaceBySlug(workspaceSlug);
  if (!workspace) return { route: 'no_template', reason: '工作空间不存在' };

  // 1) 显式指定：先按 templateId 精确查，再按 templateName 匹配（用户通常说模板名）
  const explicit = extractTemplateRequest(userMessage);
  if (explicit) {
    const byId = await loadTemplateAsset(workspace.id, explicit).catch(() => null);
    if (byId?.ok && byId.asset) {
      const a = byId.asset;
      if (a.status === 'approved' || a.status === 'testing') {
        return {
          route: 'template',
          templateId: a.templateId,
          reason: `用户指定模板 ${a.templateName}（${a.status}）`
        };
      }
      return {
        route: 'no_template',
        reason: `模板 ${a.templateId} 状态 ${a.status} 不可用于自动剪辑`
      };
    }
    // 按模板名（精确/包含）或 templateId 片段匹配（用户常记模板 ID 前缀/日期）
    const all = await listTemplateAssets(workspace.id);
    const byName = all.find(
      (l) =>
        l.ok &&
        l.asset &&
        (l.asset.templateName === explicit ||
          (l.asset.templateName && l.asset.templateName.includes(explicit)) ||
          (l.asset.templateName && explicit.includes(l.asset.templateName)) ||
          l.asset.templateId.includes(explicit) ||
          (l.asset.templateId && explicit.includes(l.asset.templateId)) ||
          segmentMatch(explicit, (l.asset.templateName ?? '') + ' ' + (l.asset.templateId ?? '')))
    );
    if (byName?.ok && byName.asset) {
      const a = byName.asset;
      if (a.status === 'approved' || a.status === 'testing') {
        return {
          route: 'template',
          templateId: a.templateId,
          reason: `用户指定模板 ${a.templateName}（${a.status}）`
        };
      }
      return {
        route: 'no_template',
        reason: `模板 ${a.templateId} 状态 ${a.status} 不可用于自动剪辑`
      };
    }
    return { route: 'no_template', reason: `指定模板 ${explicit} 不存在` };
  }

  // 2) 自动检索：仅当用户消息明确提到"模板"且非否定时才尝试自动匹配
  const negated = /(没有|不用|不要|无需|不需要|不想要).{0,3}模板/.test(userMessage);
  const wantsTemplate = /模板/.test(userMessage) && !negated;
  if (wantsTemplate) {
    const usable = await listUsableTemplateAssets(workspace.id, { includeTesting: true });
    if (usable.length > 0) {
      const kw = userMessage.toLowerCase();
      const matched =
        usable.find((a) => a.templateName && kw.includes(a.templateName)) ??
        usable.find((a) => a.templateInfo.contentType && kw.includes(a.templateInfo.contentType)) ??
        usable[0];
      return {
        route: 'template',
        templateId: matched.templateId,
        reason: `自动匹配企业模板 ${matched.templateName}（候选 ${usable.length} 个）`
      };
    }
  }

  return {
    route: 'no_template',
    reason: '未指定/未匹配企业模板，需要先选择已有企业模板或蒸馏剪映草稿'
  };
}

// ============================================================================
// LLM 受约束文案生成
// ============================================================================

export const MAX_LLM_RETRY = 3;

export interface SlotFillInput {
  slotId: string;
  originalText: string;
  originalCharCount: number;
  role?: string;
  resourceType?: string;
  constraintMode: string;
}

export interface SlotFillResult {
  slotId: string;
  originalText: string;
  replacementText: string;
  valid: boolean;
  reason?: string;
}

/**
 * 为单个文字槽生成受约束替换文案。
 * LLM 只负责语义生成；字数校验由 validateReplacementText 硬约束。
 */
export async function generateConstrainedSlotText(
  slot: TemplateTextSlot,
  businessContext: string
): Promise<SlotFillResult> {
  const expected = slot.constraint?.exactCharCount ?? slot.originalCharCount;
  const mode = slot.constraint?.mode ?? 'EXACT_CHAR_COUNT';

  let lastReason = '';
  for (let attempt = 0; attempt < MAX_LLM_RETRY; attempt++) {
    const system =
      '你是企业短视频模板的文字适配助手。' +
      '你的唯一任务：根据槽位原文与业务上下文，生成【完全符合字数要求】的新文本。' +
      `约束：${mode}，必须恰好 ${expected} 个可见字符（中文=1，标点=1，忽略空格）。` +
      '要求：语义自然、贴合企业/工厂/产品语境、口语化、不浮夸。' +
      '只输出文本本身，不要解释、不要引号、不要标点修饰。';

    const user = [
      `槽位原文：${slot.originalText}（${slot.originalCharCount}字）`,
      slot.role ? `视觉角色：${slot.role}` : '',
      slot.resourceType ? `资源类型：${slot.resourceType}` : '',
      `目标字数：${expected} 字（必须严格相等）`,
      `业务上下文：${businessContext}`,
      `请生成替换文本：`
    ]
      .filter(Boolean)
      .join('\n');

    let candidate = '';
    try {
      const res = await chat([
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]);
      candidate = (res ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
    } catch {
      candidate = '';
    }
    if (!candidate) {
      lastReason = 'LLM 无输出';
      continue;
    }

    const check = validateReplacementText(
      { originalCharCount: slot.originalCharCount, constraint: slot.constraint },
      candidate
    );
    if (check.valid) {
      return {
        slotId: slot.slotId,
        originalText: slot.originalText,
        replacementText: candidate,
        valid: true
      };
    }
    lastReason = check.reason ?? '字数不符';
  }
  return {
    slotId: slot.slotId,
    originalText: slot.originalText,
    replacementText: '',
    valid: false,
    reason: `CONSTRAINT_UNSATISFIED: ${lastReason}`
  };
}

/**
 * 为全部文字槽生成替换文案（组内槽位用同一语义域，由 businessContext 统一驱动）。
 * 提速策略：批量生成 —— 每批 8 个槽位一次 LLM 调用（返回 JSON），逐条字数校验，
 * 不合格的槽位单独重试。36 个槽位从逐条串行（100s+）降到约 4~5 次调用。
 */
export async function generateTextFillPlan(
  asset: TemplateAsset,
  businessContext: string
): Promise<{ plan: Record<string, string>; results: SlotFillResult[] }> {
  const plan: Record<string, string> = {};
  const results: SlotFillResult[] = [];
  // FIXED_TEXT 槽不参与生成
  const fillable = asset.textSlots.filter(
    (s) => s.constraint?.mode !== 'FIXED_TEXT' && s.resourceType !== 'plain_text'
  );
  // plain_text 字幕槽：默认保留原文（不替换字幕语义，保持时间线结构）
  const plainSlots = asset.textSlots.filter((s) => s.resourceType === 'plain_text');

  const BATCH = 8;
  for (let i = 0; i < fillable.length; i += BATCH) {
    const batch = fillable.slice(i, i + BATCH);
    const batchResults = await generateBatchSlotTexts(batch, businessContext);
    for (const r of batchResults) {
      results.push(r);
      if (r.valid && r.replacementText) {
        plan[r.slotId] = r.replacementText;
      }
    }
  }

  // plain 槽保留原文（写入原文 = 不改变）
  for (const s of plainSlots) {
    plan[s.slotId] = s.originalText;
  }
  return { plan, results };
}

/** 一批槽位一次 LLM 调用：输出 JSON {slotId: text}，逐条校验；不合格槽位单独重试。 */
async function generateBatchSlotTexts(
  slots: TemplateTextSlot[],
  businessContext: string
): Promise<SlotFillResult[]> {
  const results: SlotFillResult[] = [];
  const list = slots
    .map(
      (s, idx) =>
        `${idx + 1}. [${s.slotId}] 原文：${s.originalText}（${s.originalCharCount}字，必须恰好 ${s.constraint?.exactCharCount ?? s.originalCharCount} 个可见字符）`
    )
    .join('\n');

  const system =
    '你是企业短视频模板的文字适配助手。你的唯一任务：为每个槽位生成【完全符合字数要求】的新文本。' +
    '要求：语义自然、贴合企业/工厂/产品语境、口语化、不浮夸。' +
    '必须严格按槽位 slotId 一一对应，每个槽位字数必须与标注的字符数完全相等（中文=1，标点=1，忽略空格）。' +
    '只输出一个 JSON 对象（不要 markdown、不要解释、不要多余文字），格式：{"槽位slotId": "新文本"}。';

  const user = [
    `业务上下文：${businessContext}`,
    '',
    '槽位列表：',
    list,
    '',
    '请生成替换文本 JSON：'
  ].join('\n');

  let parsed: Record<string, string> | null = null;
  try {
    const res = await chat([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]);
    const cleaned = (res ?? '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, string>;
    }
  } catch {
    parsed = null;
  }

  for (const slot of slots) {
    const candidate =
      parsed && typeof parsed[slot.slotId] === 'string'
        ? parsed[slot.slotId].trim().replace(/^["'“”]+|["'“”]+$/g, '')
        : '';
    if (candidate) {
      const check = validateReplacementText(
        { originalCharCount: slot.originalCharCount, constraint: slot.constraint },
        candidate
      );
      if (check.valid) {
        results.push({
          slotId: slot.slotId,
          originalText: slot.originalText,
          replacementText: candidate,
          valid: true
        });
        continue;
      }
    }
    // 批次内不合格/缺失 → 单独重试（最多一轮）
    const retry = await generateConstrainedSlotText(slot, businessContext);
    results.push(retry);
  }
  return results;
}

// ============================================================================
// Template Route 执行
// ============================================================================

export interface TemplateRouteParams {
  workspaceSlug: string;
  templateId: string;
  businessContext: string;
  /**
   * 执行阶段（SOP 分步：先文案 → 再素材 → 最后生成）：
   * - 'script'：只生成文字填充计划（快），不检索素材、不生成草稿（第一步）
   * - 'media' ：使用已确认的 explicitTextPlan 生成素材替换计划（第二步）
   * - 'final' ：使用 explicitTextPlan + mediaPlan 完整生成剪映草稿（第三步；缺省）
   */
  stage?: 'script' | 'media' | 'final';
  /** 可选的替换方案（直接提供则跳过 LLM 生成） */
  explicitTextPlan?: Record<string, string>;
  /** 素材替换方案（media materialId → asset） */
  mediaPlan?: Record<
    string,
    {
      assetPath: string;
      assetDurationSec: number;
      width?: number;
      height?: number;
      fileName?: string;
    }
  >;
  draftName?: string;
}

export interface TemplateRouteResult {
  ok: boolean;
  route: 'template';
  templateId: string;
  draftName?: string;
  draftPath?: string;
  textFillCount: number;
  textFillTotal: number;
  constraintFailures: SlotFillResult[];
  mediaPlanCount: number;
  /** plan 阶段返回：slotId → 适配后文本（供用户确认后回传 explicitTextPlan） */
  textPlan?: Record<string, string>;
  /** plan 阶段返回：素材槽填充计划（materialId → 素材信息） */
  mediaPlan?: Record<string, MediaSlotPlan>;
  structureVerified?: boolean;
  verifyReport?: unknown;
  voice?: { ok: boolean; output?: string; error?: string } | null;
  narrationSource?: string;
  error?: string;
}

// ============================================================================
// 客户机路径重映射：素材根 / 模板根一律以「workspace 数据存储设置」为准
// ============================================================================

const MEDIA_ROOT_MARK = '30_素材资源/视频库';

/** 把资产内置素材绝对路径重映射到当前 workspace 数据存储设置的视频库根。 */
type MediaSlotPlan = {
  assetPath: string;
  assetDurationSec: number;
  width?: number;
  height?: number;
  fileName?: string;
};

function remapMediaPlanPaths(
  mediaPlan: Record<string, MediaSlotPlan>,
  videoRoot: string
): Record<string, MediaSlotPlan> {
  const out: Record<string, MediaSlotPlan> = {};
  for (const [matId, info] of Object.entries(mediaPlan)) {
    const orig = info.assetPath ?? '';
    const idx = orig.indexOf(MEDIA_ROOT_MARK);
    const rel =
      idx >= 0
        ? orig.slice(idx + MEDIA_ROOT_MARK.length).replace(/^[\\/]+/, '')
        : path.basename(orig);
    out[matId] = { ...info, assetPath: path.join(videoRoot, rel) };
  }
  return out;
}

/**
 * 素材填充计划（第二步：匹配素材）。
 * 策略：
 * 1) 用 mediaSlot.originalPath 的文件名/目录关键词在「企业视频素材库（videos）」中检索；
 * 2) 检索无果时，按槽位时长顺序从素材库兜底分配；
 * 3) 素材库索引缺失/为空时返回空计划（前端提示配置视频素材库）。
 * 只负责「选素材」；真正写进草稿由 step4_fill 确定性完成。
 */
async function generateMediaFillPlan(
  asset: TemplateAsset,
  businessContext: string
): Promise<Record<string, MediaSlotPlan>> {
  const plan: Record<string, MediaSlotPlan> = {};
  const slots = (asset.mediaSlots ?? []).filter(
    (s) => s.mediaType === 'video' || s.mediaType === 'image'
  );
  if (slots.length === 0) return plan;

  const videoRoot = (await resolveWorkspaceAsset('', 'videoRoot')).path;

  // 文件名/目录关键词：如 F:/视频/PANDA装货/36.mp4 → ["PANDA装货", "36"]
  function keywordsFromPath(originalPath: string): string[] {
    const norm = (originalPath ?? '').replace(/\\/g, '/');
    const parts = norm.split('/');
    const fileName = parts[parts.length - 1] ?? '';
    const dirName = parts.length > 1 ? (parts[parts.length - 2] ?? '') : '';
    const base = fileName.replace(/\.[^.]+$/, '').replace(/^\d+_/, '');
    return [dirName, base, fileName].filter((k) => k && k.length >= 2);
  }

  // 全部候选（一次索引加载，多次复用）
  let candidates: Awaited<ReturnType<typeof searchVideoClips>> = [];
  try {
    candidates = await searchVideoClips({
      query: businessContext,
      limit: 200,
      requireFileExists: false
    });
  } catch {
    candidates = [];
  }

  const used = new Set<string>();
  for (const slot of slots) {
    const kws = keywordsFromPath(slot.originalPath);
    let picked: (typeof candidates)[number] | undefined;
    // 1) 关键词命中（文件名包含）
    if (kws.length > 0 && candidates.length > 0) {
      picked = candidates.find(
        (c) =>
          !used.has(c.relativePath) &&
          kws.some((k) => c.fileName.toLowerCase().includes(k.toLowerCase()))
      );
    }
    // 2) 同目录兜底
    if (!picked && candidates.length > 0) {
      picked = candidates.find(
        (c) =>
          !used.has(c.relativePath) &&
          kws.some((k) => c.relativePath.toLowerCase().includes(k.toLowerCase()))
      );
    }
    // 3) 顺序兜底：按时长接近优先
    if (!picked && candidates.length > 0) {
      picked = candidates.find((c) => !used.has(c.relativePath));
    }
    if (picked) {
      used.add(picked.relativePath);
      const assetPath = path.join(videoRoot, picked.relativePath);
      const duration = slot.durationSec ?? slot.segmentDurationSec ?? picked.clipDuration ?? 5;
      plan[slot.materialId] = {
        assetPath,
        assetDurationSec: duration,
        fileName: picked.fileName
      };
    }
  }
  return plan;
}

/**
 * 解析母版草稿目录：优先 workspace 模板根下的 <templateId>/source
 * （客户机企业数据包：模板目录由用户在数据存储页设置），否则回退资产原始路径（开发机）。
 */
async function resolveSourceDraftDir(
  workspaceId: string,
  templateId: string,
  assetSourceDir: string
): Promise<string> {
  try {
    const tplRoot = (await resolveWorkspaceAsset(workspaceId, 'templateRoot')).path;
    // 兼容两种存放结构：
    // 1) <templateRoot>/<templateId>/source/
    // 2) <templateRoot>/企业模板/<templateId>/source/（当前企业模板实际存放结构）
    const candidates = [
      path.join(tplRoot, templateId, 'source'),
      path.join(tplRoot, '企业模板', templateId, 'source')
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    /* 回退 */
  }
  return assetSourceDir;
}

/**
 * 执行 Template Route 全流程（编排层）。
 * 依赖 scripts/template-pipeline 的 step4_fill / step5_verify（已多轮实测验证）。
 */
export async function runTemplateRoute(params: TemplateRouteParams): Promise<TemplateRouteResult> {
  const workspace = getWorkspaceBySlug(params.workspaceSlug);
  if (!workspace)
    return {
      ok: false,
      route: 'template',
      templateId: params.templateId,
      textFillCount: 0,
      textFillTotal: 0,
      constraintFailures: [],
      mediaPlanCount: 0,
      error: '工作空间不存在'
    };

  const loaded = await loadTemplateAsset(workspace.id, params.templateId);
  if (!loaded.ok || !loaded.asset) {
    return {
      ok: false,
      route: 'template',
      templateId: params.templateId,
      textFillCount: 0,
      textFillTotal: 0,
      constraintFailures: [],
      mediaPlanCount: 0,
      error: loaded.error ?? '模板资产加载失败'
    };
  }
  const asset = loaded.asset;

  const stage = params.stage ?? 'final';

  // 1) 文字填充计划（LLM 或显式）
  let textPlan: Record<string, string>;
  let constraintFailures: SlotFillResult[] = [];
  if (params.explicitTextPlan) {
    textPlan = params.explicitTextPlan;
  } else {
    const { plan, results } = await generateTextFillPlan(asset, params.businessContext);
    textPlan = plan;
    constraintFailures = results.filter((r) => !r.valid);
  }

  // 第一步：script —— 只生成文案，立即返回（前端展示给用户确认，不检索素材）
  if (stage === 'script') {
    return {
      ok: true,
      route: 'template',
      templateId: params.templateId,
      textFillCount: Object.keys(textPlan).length,
      textFillTotal: asset.textSlots.length,
      constraintFailures,
      mediaPlanCount: 0,
      textPlan
    };
  }

  // 2) 素材替换计划：显式优先；media 阶段/缺省时从企业视频素材库按槽位检索
  let mediaPlan: Record<string, MediaSlotPlan> = {};
  if (params.mediaPlan && Object.keys(params.mediaPlan).length > 0) {
    mediaPlan = params.mediaPlan as Record<string, MediaSlotPlan>;
  } else if (stage === 'media' || stage === 'final') {
    try {
      mediaPlan = await generateMediaFillPlan(asset, params.businessContext);
    } catch {
      mediaPlan = (asset.replacementPlan?.media as Record<string, MediaSlotPlan>) ?? {};
    }
  } else {
    mediaPlan = (asset.replacementPlan?.media as Record<string, MediaSlotPlan>) ?? {};
  }
  {
    const videoRoot = (await resolveWorkspaceAsset(workspace.id, 'videoRoot')).path;
    mediaPlan = remapMediaPlanPaths(mediaPlan, videoRoot);
  }

  // 第二步：media —— 返回素材计划，供用户确认后再 finalize
  if (stage === 'media') {
    return {
      ok: true,
      route: 'template',
      templateId: params.templateId,
      textFillCount: Object.keys(textPlan).length,
      textFillTotal: asset.textSlots.length,
      constraintFailures,
      mediaPlanCount: Object.keys(mediaPlan).length,
      textPlan,
      mediaPlan
    };
  }

  // 3) 生成草稿名
  const draftName =
    params.draftName ??
    `ZHIHENG-TEMPLATE-${asset.templateId}-${Date.now().toString(36).toUpperCase()}`;

  // 4) 准备明文草稿：加密母版先解密（step1），明文存在则跳过
  const sourceDraftDir = await resolveSourceDraftDir(
    workspace.id,
    asset.templateId,
    asset.templateInfo.sourceDraftDir
  );
  const plainContentPath = path.join(sourceDraftDir, 'draft_content-decrypted.json');
  if (!fs.existsSync(plainContentPath)) {
    const dec = await runPythonScript(buildStep1Command(sourceDraftDir));
    if (!dec.ok) {
      return {
        ok: false,
        route: 'template',
        templateId: params.templateId,
        draftName,
        textFillCount: Object.keys(textPlan).length,
        textFillTotal: asset.textSlots.length,
        constraintFailures,
        mediaPlanCount: Object.keys(mediaPlan).length,
        error: `step1 母版解密失败: ${dec.error}`
      };
    }
  }

  // 5) 写入本次填充计划到临时资产文件（step4_fill 从磁盘资产 JSON 读 replacementPlan）
  //    关键：不能改企业模板资产原件，也不能让 step4 读到旧 plan。
  const assetPath = loaded.path ?? '';
  const planPayload = buildPlanPayloadAsset(assetPath, textPlan, mediaPlan, draftName);
  const step4 = buildStep4Command(
    asset,
    textPlan,
    mediaPlan,
    draftName,
    planPayload,
    plainContentPath
  );
  const step4Result = await runPythonScript(step4);
  if (!step4Result.ok) {
    return {
      ok: false,
      route: 'template',
      templateId: params.templateId,
      draftName,
      textFillCount: Object.keys(textPlan).length,
      textFillTotal: asset.textSlots.length,
      constraintFailures,
      mediaPlanCount: Object.keys(mediaPlan).length,
      error: `step4_fill 失败: ${step4Result.error}`
    };
  }

  // 6) step5_verify（结构 diff：母版明文 vs 填充后草稿）
  const outputDraftDir = path.join(getDraftRoot(), draftName);
  const outputDraftContent = path.join(outputDraftDir, 'draft_content.json');
  const step5 = buildStep5Command(plainContentPath, outputDraftContent);
  const verify = await runPythonScript(step5);
  if (!verify.ok) {
    return {
      ok: false,
      route: 'template',
      templateId: params.templateId,
      draftName,
      draftPath: outputDraftDir,
      textFillCount: Object.keys(textPlan).length,
      textFillTotal: asset.textSlots.length,
      constraintFailures,
      mediaPlanCount: Object.keys(mediaPlan).length,
      structureVerified: false,
      verifyReport: verify.output,
      error: `step5_verify: ${verify.error}`
    };
  }

  // 7) TTS 配音 + 字幕（SOP 第 5 步）——失败则整体失败（首版 TTS 是硬需求）
  let voicePlanPath = '';
  let voiceResult: { ok: boolean; output?: string; error?: string } | null = null;
  let narrationSource = '';
  try {
    const { plan, narrationSource: src } = await generateVoicePlan(
      asset,
      textPlan,
      params.businessContext,
      workspace.id,
      draftName
    );
    narrationSource = src;
    const plansDir = path.join(process.cwd(), 'logs', 'template-route-plans');
    fs.mkdirSync(plansDir, { recursive: true });
    voicePlanPath = path.join(plansDir, `${draftName}.voice.json`);
    fs.writeFileSync(voicePlanPath, JSON.stringify(plan, null, 2), 'utf-8');

    // step6 前快照（step7 diff 基准）
    const beforeVoice = path.join(plansDir, `${draftName}.before-voice.json`);
    fs.copyFileSync(outputDraftContent, beforeVoice);

    const step6 = buildStep6Command(outputDraftDir, voicePlanPath);
    const step6Result = await runPythonScript(step6);
    if (!step6Result.ok) {
      voiceResult = { ok: false, error: `step6_voice 失败: ${step6Result.error}` };
    } else {
      const step7 = buildStep7Command(beforeVoice, outputDraftContent);
      const step7Result = await runPythonScript(step7);
      voiceResult = { ok: step7Result.ok, output: step7Result.output, error: step7Result.error };
    }
  } catch (e) {
    voiceResult = {
      ok: false,
      error: `TTS 配音失败: ${e instanceof Error ? e.message : String(e)}`
    };
  }

  return {
    ok: verify.ok && (voiceResult?.ok ?? false),
    route: 'template',
    templateId: params.templateId,
    draftName,
    draftPath: outputDraftDir,
    textFillCount: Object.keys(textPlan).length,
    textFillTotal: asset.textSlots.length,
    constraintFailures,
    mediaPlanCount: Object.keys(mediaPlan).length,
    structureVerified: verify.ok,
    verifyReport: verify.output,
    voice: voiceResult
      ? { ok: voiceResult.ok, output: voiceResult.output, error: voiceResult.error }
      : null,
    narrationSource,
    error:
      voiceResult && !voiceResult.ok
        ? voiceResult.error
        : verify.ok
          ? undefined
          : `step5_verify: ${verify.error}`
  };
}

// ============================================================================
// Python 脚本调用（实验脚本 → 正式编排桥）
// ============================================================================

// 模板管线执行层：桌面客户机 → bundled CLI EXE（argv 兼容）；开发机 → 开发 venv python
const PIPELINE_DIR =
  process.env.ZHIHENG_TEMPLATE_PIPELINE_DIR || 'D:\\知衡智企\\scripts\\template-pipeline';
const PYTHON =
  process.env.ZHIJING_TEMPLATE_CLI ||
  process.env.ZHIJING_PYTHON ||
  'D:\\剪映智剪测试\\poc-venv\\Scripts\\python.exe';

/** 脚本名 → CLI 子命令映射（EXE argv 协议：cli.exe <type> <args...>） */
const STEP_TYPE: Record<string, string> = {
  'step1_decrypt.py': 'decrypt',
  'step4_fill.py': 'fill',
  'step5_verify.py': 'verify',
  'step6_voice.py': 'voice',
  'step7_verify_voice.py': 'verify_voice'
};

/** 统一构造模板管线命令：EXE（客户机 bundled CLI）直接调用；否则 python + 脚本。 */
function buildStepCommand(scriptName: string, args: string[]): string {
  const cli = PYTHON.trim();
  if (/\.exe$/i.test(cli)) {
    const type = STEP_TYPE[scriptName] || scriptName.replace(/\.py$/, '');
    return [`"${cli}"`, type, ...args].join(' ');
  }
  return [`"${cli}"`, `"${PIPELINE_DIR}\\${scriptName}"`, ...args].join(' ');
}

/**
 * 剪映草稿根目录（运行时解析）。
 * 注意：不可写成可直接静态求值的常量字符串——Turbopack 会对 `path.join(常量, 变量)`
 * 创建 context module 并在编译期扫描整个草稿目录（Windows 下会把 zip/cover 等误判为
 * 指向根外的 symlink 导致 build 失败）。用环境变量 + 数组 join 阻断常量传播。
 */
function getDraftRoot(): string {
  if (process.env.ZHIHENG_DRAFT_ROOT) return process.env.ZHIHENG_DRAFT_ROOT;
  return [
    'C:',
    'Users',
    'Administrator',
    'AppData',
    'Local',
    'JianyingPro',
    'User Data',
    'Projects',
    'com.lveditor.draft'
  ].join('\\');
}

interface Step4BuildInput {
  sourceDraftDir: string;
  plainContentPath: string;
  assetPath: string;
  draftName: string;
}

// ============================================================================
// TTS 配音 + 字幕（SOP 第 5 步：TTS → 配音轨 + 底部字幕轨）
// ============================================================================

const VOICE_ID = process.env.VOICE_DEFAULT_ID || 'zh_male_guanggaojieshuo_uranus_bigtts';
const MAX_VOICE_SEGMENTS = 8;
const MAX_VOICE_CHUNK_CHARS = 60;

/** 生成完整口播文案：LLM 优先（SOP：先解决说什么）；LLM 未配置时按槽位时间序拼接（兜底）。 */
async function buildNarrationText(
  asset: TemplateAsset,
  textPlan: Record<string, string>,
  businessContext: string
): Promise<{ text: string; source: 'LLM' | 'ASSET_CONCAT' }> {
  const cfg = await getResolvedLlmConfig();
  if (cfg) {
    try {
      const system =
        '你是企业短视频口播文案撰稿人。根据业务上下文，生成一段【完整口播旁白】，约 180-220 字。' +
        '要求：口语化、有钩子、信息密度高、贴合企业/工厂/产品语境；不要分镜说明，不要标记，只要旁白正文。';
      const res = await chat([
        { role: 'system', content: system },
        { role: 'user', content: `业务上下文：${businessContext}\n请生成口播旁白：` }
      ]);
      const text = (res ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
      if (text.length >= 20) return { text, source: 'LLM' };
    } catch {
      /* fall through */
    }
  }
  // 兜底：按槽位时间序拼接替换后文案，去重连续重复
  const slots = [...asset.textSlots].sort((a, b) => a.startSec - b.startSec);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const slot of slots) {
    const txt = (textPlan[slot.slotId] ?? slot.originalText).trim();
    if (!txt || seen.has(txt)) continue;
    seen.add(txt);
    parts.push(txt);
  }
  const joined = parts.join('。');
  return { text: joined.slice(0, 220), source: 'ASSET_CONCAT' };
}

/** 口播分段：按标点拆句，每段不超过 MAX_VOICE_CHUNK_CHARS 字，最多 MAX_VOICE_SEGMENTS 段。 */
function splitNarration(text: string): string[] {
  const cleaned = text.replace(/\s+/g, '');
  if (!cleaned) return [];
  const sentences = cleaned
    .split(/(?<=[。！？；，])/)
    .map((x) => x.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const sent of sentences) {
    if ((cur + sent).length <= MAX_VOICE_CHUNK_CHARS && chunks.length + 1 <= MAX_VOICE_SEGMENTS) {
      cur += sent;
    } else {
      if (cur) chunks.push(cur);
      cur = sent;
    }
  }
  if (cur && chunks.length < MAX_VOICE_SEGMENTS) chunks.push(cur);
  // 超长兜底：硬切
  while (
    chunks.length < MAX_VOICE_SEGMENTS &&
    cur.length > MAX_VOICE_CHUNK_CHARS &&
    chunks.length === 0
  ) {
    chunks.push(cur.slice(0, MAX_VOICE_CHUNK_CHARS));
    cur = cur.slice(MAX_VOICE_CHUNK_CHARS);
  }
  return chunks.filter(Boolean);
}

interface VoicePlan {
  segments: Array<{ text: string; audioPath: string; durationSec: number; startSec: number }>;
  subtitle: Array<{ text: string; startMs: number; endMs: number }>;
}

/** 逐段调用豆包 TTS，生成配音文件（放 workspace 音频库）+ 字幕计划。 */
async function generateVoicePlan(
  asset: TemplateAsset,
  textPlan: Record<string, string>,
  businessContext: string,
  workspaceId: string,
  draftName: string
): Promise<{ plan: VoicePlan; narrationSource: string }> {
  const { text, source } = await buildNarrationText(asset, textPlan, businessContext);
  const chunks = splitNarration(text);
  if (chunks.length === 0) throw new Error('口播文案为空');

  const voiceRoot = (await resolveWorkspaceAsset(workspaceId, 'voiceRoot')).path;
  fs.mkdirSync(voiceRoot, { recursive: true });
  const tag = draftName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);

  const segments: VoicePlan['segments'] = [];
  const subtitle: VoicePlan['subtitle'] = [];
  let cursorSec = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const audio = await generateVoiceAudio({
      text: chunk,
      voiceId: VOICE_ID,
      speed: 1.3,
      volume: 1.0
    });
    const fileName = `voice_${tag}_${String(i + 1).padStart(2, '0')}.mp3`;
    const dest = path.join(voiceRoot, fileName);
    fs.copyFileSync(audio.audio_path, dest);
    segments.push({
      text: chunk,
      audioPath: dest,
      durationSec: Math.max(0.1, audio.duration),
      startSec: cursorSec
    });
    // 字幕时间：优先 TTS_NATIVE 字级时间戳校准，否则用整段时长
    let startMs = cursorSec * 1000;
    let endMs = (cursorSec + audio.duration) * 1000;
    if (
      audio.timing?.source === 'TTS_NATIVE' &&
      Array.isArray(audio.timing.words) &&
      audio.timing.words.length > 0
    ) {
      const ws = audio.timing.words;
      startMs = cursorSec * 1000 + (ws[0].startMs ?? 0);
      endMs = cursorSec * 1000 + (ws[ws.length - 1].endMs ?? audio.duration * 1000);
    }
    subtitle.push({ text: chunk, startMs, endMs });
    cursorSec += audio.duration;
  }

  return { plan: { segments, subtitle }, narrationSource: source };
}

/** 构造本次填充用临时资产 JSON：读取企业模板资产原件 → 覆盖 replacementPlan → 写临时文件（logs 下，不污染企业资产）。 */
function buildPlanPayloadAsset(
  assetPath: string,
  textPlan: Record<string, string>,
  mediaPlan: Record<string, unknown>,
  draftName: string
): string {
  const raw = JSON.parse(fs.readFileSync(assetPath, 'utf-8')) as Record<string, unknown>;
  const payload: Record<string, unknown> = { ...raw };
  payload.replacementPlan = { text: textPlan, media: mediaPlan };
  const outDir = path.join(process.cwd(), 'logs', 'template-route-plans');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${draftName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  return outPath;
}

/** step1_decrypt.py <母版草稿目录> <输出明文目录> */
function buildStep1Command(sourceDraftDir: string): string {
  const outDir = sourceDraftDir; // 明文写回母版目录（draft_content-decrypted.json）
  return buildStepCommand('step1_decrypt.py', [`"${sourceDraftDir}"`, `"${outDir}"`]);
}

/** step4_fill.py <母版草稿目录> <明文draft_content.json> <资产JSON> <输出草稿名> */
function buildStep4Command(
  asset: TemplateAsset,
  textPlan: Record<string, string>,
  mediaPlan: Record<string, unknown>,
  draftName: string,
  assetPath: string,
  plainContentPath: string
): string {
  // 母版草稿目录 = 明文 draft_content.json 所在目录（source/），不再依赖 asset 中可能缺失的 sourceDraftDir
  const sourceDraftDir = path.dirname(plainContentPath);
  return buildStepCommand('step4_fill.py', [
    `"${sourceDraftDir}"`,
    `"${plainContentPath}"`,
    `"${assetPath}"`,
    `"${draftName}"`
  ]);
}

/** step5_verify.py <母版明文draft_content.json> <填充后draft_content.json> */
function buildStep6Command(draftDir: string, voicePlanPath: string): string {
  const styleTpl = path.join(PIPELINE_DIR, 'subtitle-style.default.json');
  return buildStepCommand('step6_voice.py', [
    `"${draftDir}"`,
    `"${voicePlanPath}"`,
    `"${styleTpl}"`
  ]);
}

/** step7_verify_voice.py <step5后草稿> <step6后草稿> */
function buildStep7Command(beforeVoicePath: string, afterVoicePath: string): string {
  return buildStepCommand('step7_verify_voice.py', [`"${beforeVoicePath}"`, `"${afterVoicePath}"`]);
}
function buildStep5Command(plainContentPath: string, outputDraftContent: string): string {
  return buildStepCommand('step5_verify.py', [`"${plainContentPath}"`, `"${outputDraftContent}"`]);
}

/** 执行 Python 脚本（Node child_process）。 */
async function runPythonScript(
  command: string
): Promise<{ ok: boolean; error?: string; output?: string; outputDraftDir?: string }> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  try {
    // 简化：解析命令字符串
    const parts =
      command.match(/"([^"]+)"|'([^']+)'|(\S+)/g)?.map((s) => s.replace(/^["']|["']$/g, '')) ?? [];
    const [exe, ...rest] = parts;
    const { stdout } = await exec(exe, rest, {
      timeout: 300_000,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    return { ok: true, output: stdout, outputDraftDir: getDraftRoot() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, error: err.stderr || err.message || '脚本执行失败', output: err.stdout };
  }
}

export { countVisibleChineseChars };
