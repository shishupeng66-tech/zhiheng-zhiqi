/**
 * JianYing Adapter —— ResourceMap V0 数据加载与正式 schema 校验。
 *
 * 数据单源：src/engines/jianying-adapter/resources/resource-map.v0.json（生产数据）
 * - 生产代码只读取正式资源文件，**不反向依赖 __fixtures__**。
 * - 测试 fixture 若需要，可复制/引用生产数据。
 *
 * 数据来源：PJD 多轮 PoC 在剪映 11.3.0.14362 下真实验证过的资源。
 *
 * 规则（Phase C / C.1 已确认）：
 * - 不写本机 Cache 绝对路径（cacheProbeRule 只描述相对探测规则）
 * - 必需资源（required=true）缺失 → RESOURCE_MISSING，停止
 * - 可选资源（required=false）缺失 → 仅当有明确 fallback 时替换，否则跳过并置 warning
 * - 不得自动选择"相似资源"
 * - VIP/已购/版权状态如实记录；unknown 表示需剪映打开时实际确认
 * - 加载时执行正式 schema 校验：重复 styleId、重复/空 resourceId、非法/自引用 fallback、
 *   缺少授权状态、code_defined 与剪映 resourceId 类型分离
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ResourceMap, ResourceMapEntry, ResourceType } from './resource-map';

/** ResourceMap 版本引用 */
export const RESOURCE_MAP_REF = 'zhiheng-resource-map.v0.1.0';

/** 生产资源数据文件相对本文件的路径：resource-map-data.ts → resources/resource-map.v0.json */
function getProductionResourceMapFile(): string {
  // Next.js Turbopack 打包下 __dirname 会变成虚拟 \ROOT\（无头 tsx 正常，Next 内失效），
  // 因此优先按 __dirname 解析，找不到时回退到进程工作目录的项目相对路径。
  const viaDirname = path.join(__dirname, 'resources', 'resource-map.v0.json');
  if (fs.existsSync(viaDirname)) return viaDirname;
  return path.join(
    process.cwd(),
    'src',
    'engines',
    'jianying-adapter',
    'resources',
    'resource-map.v0.json'
  );
}

/** code_defined（代码内置样式，如字幕）允许的类型集合 */
const CODE_DEFINED_ALLOWED_TYPES: ReadonlySet<string> = new Set(['subtitle']);

/** 授权相关字段必填集合 */
const LICENSE_FIELDS: ReadonlyArray<keyof ResourceMapEntry> = [
  'vipRequired',
  'isPurchased',
  'copyrightStatus'
];

/** ResourceMap 校验错误 */
export interface ResourceMapValidationIssue {
  /** 出错条目 styleId（或注册表级） */
  styleId: string;
  /** 问题描述 */
  message: string;
}

/** 校验结果 */
export interface ResourceMapValidationResult {
  ok: boolean;
  issues: ResourceMapValidationIssue[];
}

/** 加载生产 ResourceMap 数据 */
function loadResourceMapFile(): ResourceMap {
  const productionFile = getProductionResourceMapFile();
  if (!fs.existsSync(productionFile)) {
    throw new Error(`生产 ResourceMap 数据不存在: ${productionFile}`);
  }
  const raw = JSON.parse(fs.readFileSync(productionFile, 'utf-8')) as ResourceMap;
  return raw;
}

/**
 * ResourceMap 正式 schema 校验（启动时执行）。
 *
 * 检查项：
 * - ref / version / jianyingVersion 存在
 * - styleId 非空且唯一
 * - resourceId：非 code_defined 必须非空；code_defined 必须为 null 且 type 在允许集合内
 *   （禁止把 code-defined 样式伪造成空 resourceId 的普通资源）
 * - required / type 枚举合法
 * - fallbackStyleId：必须指向已存在条目、不得自引用、不得形成循环
 * - 授权状态字段（vipRequired / isPurchased / copyrightStatus）必须存在
 */
export function validateResourceMap(map: ResourceMap): ResourceMapValidationResult {
  const issues: ResourceMapValidationIssue[] = [];
  const seen = new Set<string>();
  const entries = Array.isArray(map.entries) ? map.entries : [];

  if (!map.ref || !map.version || !map.jianyingVersion) {
    issues.push({
      styleId: '<registry>',
      message: 'ResourceMap 缺少 ref / version / jianyingVersion'
    });
  }

  const byStyle = new Map<string, ResourceMapEntry>();
  for (const e of entries) {
    // styleId 非空且唯一
    if (!e.styleId) {
      issues.push({ styleId: '<empty>', message: '存在空 styleId 条目' });
      continue;
    }
    if (seen.has(e.styleId)) {
      issues.push({ styleId: e.styleId, message: `重复 styleId` });
      continue;
    }
    seen.add(e.styleId);
    byStyle.set(e.styleId, e);

    // type 合法
    const validTypes: ReadonlyArray<ResourceType> = [
      'huazi',
      'transition',
      'sfx',
      'bgm',
      'subtitle'
    ];
    if (!validTypes.includes(e.type as ResourceType)) {
      issues.push({ styleId: e.styleId, message: `非法 type: ${e.type}` });
    }

    // resourceId 规则：code_defined 与剪映 resourceId 分离
    if (e.copyrightStatus === 'code_defined') {
      if (e.resourceId !== null && e.resourceId !== undefined && e.resourceId !== '') {
        issues.push({
          styleId: e.styleId,
          message: 'code_defined 样式不得携带剪映 resourceId（伪造为普通资源）'
        });
      }
      if (!CODE_DEFINED_ALLOWED_TYPES.has(e.type)) {
        issues.push({
          styleId: e.styleId,
          message: `code_defined 仅允许 type 属于 ${[...CODE_DEFINED_ALLOWED_TYPES].join('/')}，实际为 ${e.type}`
        });
      }
    } else if (!e.resourceId || typeof e.resourceId !== 'string') {
      issues.push({ styleId: e.styleId, message: `非 code_defined 资源缺少非空 resourceId` });
    }

    // 授权状态字段
    for (const f of LICENSE_FIELDS) {
      if (e[f] === undefined || e[f] === null) {
        issues.push({ styleId: e.styleId, message: `缺少授权状态字段: ${String(f)}` });
      }
    }
    if (typeof e.required !== 'boolean') {
      issues.push({ styleId: e.styleId, message: 'required 必须为 boolean' });
    }
  }

  // fallback：存在性 / 自引用 / 循环
  for (const e of entries) {
    const fb = e.fallbackStyleId;
    if (!fb) continue;
    if (fb === e.styleId) {
      issues.push({ styleId: e.styleId, message: 'fallback 自引用' });
      continue;
    }
    if (!byStyle.has(fb)) {
      issues.push({ styleId: e.styleId, message: `fallback 指向不存在的 styleId: ${fb}` });
      continue;
    }
    // 循环检测（沿 fallback 链走，最多 entries.length 步）
    let cur = e.styleId;
    let guard = byStyle.size + 1;
    const chain = new Set<string>();
    while (guard-- > 0 && cur && !chain.has(cur)) {
      chain.add(cur);
      const nxt = byStyle.get(cur)?.fallbackStyleId;
      if (!nxt) break;
      if (nxt === e.styleId) {
        issues.push({ styleId: e.styleId, message: `fallback 链形成循环（回指自身）` });
        break;
      }
      cur = nxt;
    }
  }

  return { ok: issues.length === 0, issues };
}

/** ResourceMap V0 完整数据（生产） */
export const RESOURCE_MAP_V0: ResourceMap = (() => {
  const map = loadResourceMapFile();
  const check = validateResourceMap(map);
  if (!check.ok) {
    throw new Error(
      `ResourceMap V0 正式校验失败（${check.issues.length} 个问题）: ` +
        check.issues.map((i) => `[${i.styleId}] ${i.message}`).join('; ')
    );
  }
  return map;
})();

/** 按 styleId 索引 */
const BY_STYLE_ID: Map<string, ResourceMapEntry> = new Map(
  RESOURCE_MAP_V0.entries.map((e) => [e.styleId, e])
);

/** 按 type 索引 */
const BY_TYPE: Map<ResourceType, ResourceMapEntry[]> = (() => {
  const m = new Map<ResourceType, ResourceMapEntry[]>();
  for (const e of RESOURCE_MAP_V0.entries) {
    if (!m.has(e.type)) m.set(e.type, []);
    m.get(e.type)!.push(e);
  }
  return m;
})();

export function getResourceEntry(styleId: string): ResourceMapEntry | undefined {
  return BY_STYLE_ID.get(styleId);
}

export function getResourceEntriesByType(type: ResourceType): ResourceMapEntry[] {
  return BY_TYPE.get(type) ?? [];
}

export function getAllResourceEntries(): ResourceMapEntry[] {
  return RESOURCE_MAP_V0.entries;
}
