import fs from 'node:fs';
import path from 'node:path';
import { resolveSystemAsset, resolveWorkspaceAsset } from '@/lib/system-assets';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';

/**
 * 剪映草稿定位器（draft-locator）
 * ------------------------------------------------------------------
 * 统一负责「用户说了一个草稿名/路径 → 找到真实草稿目录」的解析规则，
 * 供两处使用：
 *   1) 自动剪辑工作台执行入口 agent-run/route.ts（蒸馏意图）
 *   2) 知衡助手对话工具 parse_template（蒸馏草稿）
 *
 * 解析顺序（固定优先级）：
 *   1. 消息中的显式绝对路径（最可靠，D:\...）
 *   2. 剪映草稿根目录（%LOCALAPPDATA%\JianyingPro\...\com.lveditor.draft）
 *      按「名称精确 → 归一化精确 → 包含」匹配
 *   3. 企业模板研究区 resolveSystemAsset('jianyingTemplateRoot')
 *      （即 05_模板\剪映模板库，用户解压待蒸馏草稿的常用位置）
 *      同样按「名称精确 → 归一化精确 → 包含」匹配
 *   4. 多个候选命中 → 不猜测，返回候选列表由用户确认
 */

export type DraftLocateResult =
  | { ok: true; draftDir: string; draftName: string }
  | {
      ok: false;
      error: string;
      candidates?: Array<{ draftDir: string; draftName: string; root: string }>;
    };

/** 名称归一化：去掉首尾空白、全角空格、全部空格；全角括号 → 半角括号；统一小写。 */
export function normalizeDraftName(name: string): string {
  return (name ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（【】）]/g, (ch) => {
      switch (ch) {
        case '（':
          return '(';
        case '）':
          return ')';
        case '【':
          return '[';
        case '】':
          return ']';
        default:
          return ch;
      }
    })
    .toLowerCase();
}

/** 从消息中提取可能的草稿名（「」【】“”『』包裹 / "草稿/模板：xxx" / 直接词） */
export function extractDraftNameCandidates(message: string): string[] {
  const out: string[] = [];
  const stripWrap = (s: string) => s.replace(/^[“『「【（(]+|[”』」】）\)]+$/g, '').trim();
  // 0) 日期型草稿名（最常见：9月5日 (1) / 8月3日（1）/ 4月14日(2)）——高优先级，尽量保留序号
  const dateMatch = message.match(/(\d{1,2}\s*月\s*\d{1,2}\s*日)\s*[（(]?\s*(\d+)?\s*[）)]?/);
  if (dateMatch) {
    const base = dateMatch[1].replace(/\s+/g, '');
    out.push(dateMatch[2] ? base + ' (' + dateMatch[2] + ')' : base);
  }
  // 1) 「」【】”『』包裹内容
  const wrapMatch = message.match(/[「『【（(]\s*([^」』】）\(\)\s，。！？]+)\s*[」』】）\)]/);
  if (wrapMatch) out.push(stripWrap(wrapMatch[1]));
  // 2) 草稿/模板：xxx
  const draftPattern = message.match(/(?:草稿|模板)\s*[:：]?\s*([^\s，。！？，]+)/);
  if (draftPattern) out.push(stripWrap(draftPattern[1]));
  // 3) 去掉引号后的裸词（最后兜底，仅取第一个候选，避免误抓整句）
  if (out.length === 0) {
    const bare = message
      .replace(/[“『「【（）」』】]/g, ' ')
      .replace(/[()]/g, ' ')
      .replace(/(分析|提取|解析|导入|识别|蒸馏|帮我|请|把|这个|那|的)/g, ' ')
      .replace(/[，。！？!?,.:：、\s]+/g, ' ')
      .trim();
    if (bare) out.push(bare.split(' ')[0]);
  }
  return out.filter(Boolean);
}

function draftRootDefault(): string {
  return (
    process.env.ZHIHENG_DRAFT_ROOT ||
    path.join(
      process.env.LOCALAPPDATA || 'C:\\Users\\Administrator\\AppData\\Local',
      'JianyingPro',
      'User Data',
      'Projects',
      'com.lveditor.draft'
    )
  );
}

/** 扫描根目录下所有含 draft_content.json 的子目录，返回 { rawName, normalized, dir } */
function scanDraftDirs(root: string): Array<{ rawName: string; normalized: string; dir: string }> {
  if (!fs.existsSync(root)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Array<{ rawName: string; normalized: string; dir: string }> = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (fs.existsSync(path.join(root, ent.name, 'draft_content.json'))) {
      out.push({
        rawName: ent.name,
        normalized: normalizeDraftName(ent.name),
        dir: path.join(root, ent.name)
      });
    }
  }
  return out;
}

/** 在候选集中按优先级匹配：精确 → 归一化精确 → 包含 */
function matchInCandidates(
  candidates: Array<{ rawName: string; normalized: string; dir: string }>,
  needleRaw: string
): Array<{ rawName: string; dir: string }> {
  const needle = normalizeDraftName(needleRaw);
  if (!needle) return [];
  // 1) 精确匹配（归一化后完全相等）
  const exact = candidates.filter((c) => c.normalized === needle);
  if (exact.length > 0) return exact.map((c) => ({ rawName: c.rawName, dir: c.dir }));
  // 2) 前缀匹配（草稿名以目标开头，目标至少 2 个字符）
  if (needle.length >= 2) {
    const prefix = candidates.filter((c) => c.normalized.startsWith(needle));
    if (prefix.length > 0) return prefix.map((c) => ({ rawName: c.rawName, dir: c.dir }));
  }
  // 3) 包含匹配（双向包含，仅当目标足够长时启用，避免误抓无关草稿）
  if (needle.length >= 4) {
    const contains = candidates.filter(
      (c) => c.normalized.includes(needle) || needle.includes(c.normalized)
    );
    if (contains.length > 0) return contains.map((c) => ({ rawName: c.rawName, dir: c.dir }));
  }
  return [];
}

/** 从用户消息定位剪映草稿目录（统一入口）。 */
export async function findDraftDir(
  message: string,
  workspaceSlug?: string
): Promise<DraftLocateResult> {
  // 0) 空消息
  if (!message?.trim()) {
    return { ok: false, error: '请告诉我要分析哪个剪映草稿（草稿名或路径）。' };
  }

  // 1) 显式绝对路径
  const pathMatch = message.match(/[A-Za-z]:\\[^\s，。！？、""''（）()]+/);
  if (pathMatch) {
    const p = pathMatch[0].replace(/^"|"$/g, '');
    if (fs.existsSync(p)) {
      if (fs.existsSync(path.join(p, 'draft_content.json'))) {
        return { ok: true, draftDir: p, draftName: path.basename(p) };
      }
      return { ok: false, error: `路径不是剪映草稿（缺少 draft_content.json）: ${p}` };
    }
  }

  // 2) 收集所有可扫描根目录
  const roots: Array<{ root: string; label: string }> = [
    { root: draftRootDefault(), label: '剪映草稿根' }
  ];
  if (workspaceSlug) {
    try {
      const ws = getWorkspaceBySlug(workspaceSlug);
      if (ws) {
        const tplRoot = (await resolveWorkspaceAsset(ws.id, 'templateRoot')).path;
        if (tplRoot && tplRoot !== roots[0].root) {
          roots.push({ root: tplRoot, label: '模板库' });
          const researchSub = path.join(tplRoot, '剪映模板库');
          if (fs.existsSync(researchSub)) {
            roots.push({ root: researchSub, label: '模板库-剪映草稿' });
          }
        }
      }
    } catch {
      /* 忽略 */
    }
  }
  try {
    const researchRoot = (await resolveSystemAsset('jianyingTemplateRoot')).path;
    if (researchRoot && researchRoot !== roots[0].root) {
      roots.push({ root: researchRoot, label: '模板库' });
    }
  } catch {
    /* 忽略 */
  }

  // 3) 提取候选名字并逐名匹配
  const nameCandidates = extractDraftNameCandidates(message);
  if (nameCandidates.length === 0) {
    return { ok: false, error: '无法从消息中识别草稿名称，请直接提供草稿名或完整路径。' };
  }

  const allHits: Array<{ draftDir: string; draftName: string; root: string }> = [];
  for (const name of nameCandidates) {
    for (const { root, label } of roots) {
      const scanned = scanDraftDirs(root);
      const hits = matchInCandidates(scanned, name);
      for (const h of hits) {
        allHits.push({ draftDir: h.dir, draftName: h.rawName, root: label });
      }
    }
    if (allHits.length > 0) break; // 第一个候选名命中即停
  }

  // 4) 唯一命中 → 返回
  if (allHits.length === 1) {
    return { ok: true, draftDir: allHits[0].draftDir, draftName: allHits[0].draftName };
  }
  // 5) 多个候选 → 不猜测，列出让用户确认
  if (allHits.length > 1) {
    const candidates = allHits.map((h) => ({
      draftDir: h.draftDir,
      draftName: h.draftName,
      root: h.root
    }));
    return {
      ok: false,
      error: `找到 ${allHits.length} 个匹配草稿，请确认要解析哪一个：\n${allHits
        .map((h, i) => `${i + 1}. ${h.draftName}（${h.root}：${h.draftDir}）`)
        .join('\n')}`,
      candidates
    };
  }

  return {
    ok: false,
    error: `未找到草稿「${nameCandidates[0]}」。请在剪映草稿根或模板库目录中确认草稿存在，或直接提供完整路径。`
  };
}
