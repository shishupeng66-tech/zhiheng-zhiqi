/**
 * Visual Resource Registry（视觉资源注册表）—— 第一版
 *
 * 来源：反向解析用户手工修改后的剪映草稿
 *   ZHIHENG-GOLDEN-PACKAGING-COMPACT-20260905-175026（剪映 11.3 保存后加密，已用 PJD draft_crypto + videoeditor.dll 解密）。
 *
 * 原则：
 * - resourceId / material 结构全部来自真实草稿（禁止凭空猜 ID）；
 * - semanticTags / visualStyle / recommendedUse 基于资源名称 + 用户在草稿中的使用上下文生成（第一版人工标注）；
 * - 只收录用户手工草稿中已实际使用、且能被剪映保存的资源；
 * - 执行时 text 类资源通过 overlay 文本 material 的 effectStyle.id 注入（text_effect 已验证可渲染；
 *   text_template 为 best-effort，需剪映 GUI 复核渲染效果）。
 *
 * 本文件放在业务层（不放进 PJD fork）。
 */

export type VisualResourceType = 'text_effect' | 'text_template' | 'sticker' | 'sfx';

export interface VisualResource {
  /** 语义化唯一键（LLM 只能选它，禁止裸 ID） */
  resourceKey: string;
  resourceType: VisualResourceType;
  /** 剪映真实 resource / effect id（来自手工草稿） */
  resourceId: string;
  /** 展示名称（能解析则记录） */
  displayName: string;
  semanticTags: string[];
  /** 视觉风格家族（Dense Wall 在同一 family 内轮换，保证协调） */
  styleFamily?: string;
  visualStyle?: string[];
  recommendedUse?: string[];
  avoidUse?: string[];
  /** 本地缓存路径（当前机器；贴图/音效必需） */
  assetPath?: string;
  /** 音效时长（微秒，sfx 用） */
  durationUs?: number;
  /** 来源草稿 */
  source: string;
  sourceDraft: string;
  /** 是否已验证可正常渲染（text_effect=是；text_template=待 GUI 复核） */
  verified: boolean;
}

/** 动画资源（入场/出场，已人工验收）。 */
export interface VisualAnimationResource {
  resourceKey: string;
  resourceType: 'animation_in' | 'animation_out';
  resourceId: string;
  displayName: string;
  durationUs: number;
  source: string;
  verified: boolean;
}

const SOURCE = 'manual_jianying_draft';
const SOURCE_DRAFT = 'ZHIHENG-GOLDEN-PACKAGING-COMPACT-20260905-175026';

/** 文字资源（text_effect + text_template）。 */
export const TEXT_VISUAL_RESOURCES: VisualResource[] = [
  {
    resourceKey: 'text.effect.national_01',
    resourceType: 'text_effect',
    resourceId: '7546423084874599705',
    displayName: '国庆黄红立体字效',
    semanticTags: ['商务', '醒目', '黄红', '立体', '高对比'],
    styleFamily: 'business_bold',
    visualStyle: ['高对比', '立体', '黄红配色'],
    recommendedUse: ['报价逻辑', '流程词', '结论词', '商务信息'],
    avoidUse: ['密集信息墙', '长句'],
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: true
  },
  {
    resourceKey: 'text.tpl.strong_recommend_01',
    resourceType: 'text_template',
    resourceId: '7481212496670641433',
    displayName: '强烈推荐-美食',
    semanticTags: ['推荐', '强调', '美食', '醒目'],
    styleFamily: 'pop_emphasis',
    visualStyle: ['强烈推荐', '高饱和'],
    recommendedUse: ['产品方向', '关键结论', '强烈推荐'],
    avoidUse: ['密集信息墙', '长句'],
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: false
  },
  {
    resourceKey: 'text.tpl.explosive_price_01',
    resourceType: 'text_template',
    resourceId: '7474542699467705625',
    displayName: '电商-惊爆价',
    semanticTags: ['价格', '惊爆', '促销', '警示'],
    styleFamily: 'pop_price',
    visualStyle: ['价格强调', '促销'],
    recommendedUse: ['最低价', '价格风险', '惊爆价', '价格警示'],
    avoidUse: ['密集信息墙', '长句'],
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: false
  },
  {
    resourceKey: 'text.tpl.super_subsidy_01',
    resourceType: 'text_template',
    resourceId: '7563041008318090558',
    displayName: '电商-超级补贴日',
    semanticTags: ['补贴', '促销', '价格'],
    styleFamily: 'pop_price',
    visualStyle: ['补贴促销', '价格'],
    recommendedUse: ['最低价', '价格', '补贴'],
    avoidUse: ['密集信息墙', '长句'],
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: false
  },
  {
    resourceKey: 'text.tpl.anchor_update_01',
    resourceType: 'text_template',
    resourceId: '7371420503120088370',
    displayName: '主播更新啦',
    semanticTags: ['更新', '提醒', '主播', '强调'],
    styleFamily: 'pop_emphasis',
    visualStyle: ['更新提醒', '强调'],
    recommendedUse: ['更新', '提醒', '流程', '要点'],
    avoidUse: ['密集信息墙', '长句'],
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: false
  }
];

/** 贴图资源（sticker）。 */
export const STICKER_VISUAL_RESOURCES: VisualResource[] = [
  {
    resourceKey: 'sticker.title_mark_01',
    resourceType: 'sticker',
    resourceId: '7389869431041658139',
    displayName: '标题点缀贴图（手工草稿 title 区使用）',
    semanticTags: ['标题', '标记', '装饰', '点题'],
    visualStyle: ['点缀', '装饰'],
    recommendedUse: ['Title Hook', '标题点题', '开场'],
    avoidUse: ['密集信息墙'],
    assetPath:
      'C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/artistEffect/7389869431041658139/8d07136cdc8c08f7ff6dc9d6cc3dc6e2',
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: true
  },
  {
    resourceKey: 'sticker.warning_01',
    resourceType: 'sticker',
    resourceId: '7033050779762052388',
    displayName: '警示贴图（手工草稿最低价区使用）',
    semanticTags: ['警示', '提醒', '价格', '注意'],
    visualStyle: ['警示', '注意'],
    recommendedUse: ['最低价', '价格风险', '踩坑', '警示'],
    avoidUse: ['密集信息墙'],
    assetPath:
      'C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/artistEffect/7033050779762052388/5b5239b31742f25163a7418eacd19ca2',
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: true
  },
  {
    resourceKey: 'sticker.caution_01',
    resourceType: 'sticker',
    resourceId: '7011389149450095880',
    displayName: '踩坑贴图（手工草稿踩坑区使用）',
    semanticTags: ['踩坑', '警示', '感叹', '注意'],
    visualStyle: ['警示', '感叹'],
    recommendedUse: ['踩坑', '警示', '错误行为'],
    avoidUse: ['密集信息墙'],
    assetPath:
      'C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/artistEffect/7011389149450095880/2bc25b8b607e992eb078f33ccabc4784',
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: true
  }
];

/** 音效资源（sfx）。 */
export const SFX_VISUAL_RESOURCES: VisualResource[] = [
  {
    resourceKey: 'sfx.ding_pop_01',
    resourceType: 'sfx',
    resourceId: '6896680544193514760',
    displayName: 'Ding，可爱提示音',
    semanticTags: ['提示', '弹出', '轻响', '叮'],
    visualStyle: ['短促', '轻提示'],
    recommendedUse: ['Title Hook', '强警示', '关键结论', 'Dense 完成', '强转折'],
    avoidUse: ['每个词都加'],
    assetPath:
      'C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/music/b8884ca9ac88f31ed37004737e63a961.mp3',
    durationUs: 1566666,
    source: SOURCE,
    sourceDraft: SOURCE_DRAFT,
    verified: true
  }
];

/** 动画资源（入场/出场，已人工验收）。 */
export const ANIMATION_VISUAL_RESOURCES: VisualAnimationResource[] = [
  {
    resourceKey: 'anim.pop_up_01',
    resourceType: 'animation_in',
    resourceId: '7123116334677758501',
    displayName: '向上弹入',
    durationUs: 500000,
    source: SOURCE,
    verified: true
  },
  {
    resourceKey: 'anim.smoke_out_01',
    resourceType: 'animation_out',
    resourceId: '7678658611601493258',
    displayName: '烟雾消散',
    durationUs: 500000,
    source: SOURCE,
    verified: true
  }
];

/** 完整注册表。 */
export const VISUAL_RESOURCE_REGISTRY = {
  textTemplates: TEXT_VISUAL_RESOURCES,
  stickers: STICKER_VISUAL_RESOURCES,
  sfx: SFX_VISUAL_RESOURCES,
  animations: ANIMATION_VISUAL_RESOURCES
};

/** 所有资源按 resourceKey 索引。 */
export const VISUAL_RESOURCE_BY_KEY: Record<string, VisualResource> = Object.fromEntries(
  [...TEXT_VISUAL_RESOURCES, ...STICKER_VISUAL_RESOURCES, ...SFX_VISUAL_RESOURCES].map((r) => [
    r.resourceKey,
    r
  ])
);

/** 给 LLM 的可用资源摘要（只暴露 resourceKey / 类型 / 语义，不暴露路径）。 */
export function buildResourceRegistrySummary(): string {
  const lines: string[] = ['AVAILABLE_VISUAL_RESOURCES:'];
  lines.push('TEXT:');
  for (const r of TEXT_VISUAL_RESOURCES) {
    lines.push(
      `- ${r.resourceKey}  (${r.displayName})  tags: ${r.semanticTags.join('/')}  family: ${r.styleFamily ?? '-'}`
    );
  }
  lines.push('STICKER:');
  for (const r of STICKER_VISUAL_RESOURCES) {
    lines.push(`- ${r.resourceKey}  (${r.displayName})  tags: ${r.semanticTags.join('/')}`);
  }
  lines.push('SFX:');
  for (const r of SFX_VISUAL_RESOURCES) {
    lines.push(`- ${r.resourceKey}  (${r.displayName})  tags: ${r.semanticTags.join('/')}`);
  }
  lines.push('ANIMATION:');
  for (const r of ANIMATION_VISUAL_RESOURCES) {
    lines.push(`- ${r.resourceKey}  (${r.displayName})`);
  }
  return lines.join('\n');
}

// ============================================================================
// System Asset Registry 接入：视觉资源库 / 模板库根目录统一解析
// ============================================================================
import { resolveSystemAsset } from '../system-assets';

/** 视觉资源库根目录（resolveSystemAsset('visualResourceRegistryRoot')）。 */
export async function resolveVisualResourceRegistryRoot(): Promise<string> {
  const r = await resolveSystemAsset('visualResourceRegistryRoot');
  return r.path;
}

/** 花字校准目录（视觉资源库/calibration）。 */
export async function resolveCalibrationRoot(): Promise<string> {
  const r = await resolveSystemAsset('resourceCalibrationRoot');
  return r.path;
}

/** 资源检索索引目录（视觉资源库/indexes）。 */
export async function resolveResourceIndexRoot(): Promise<string> {
  const r = await resolveSystemAsset('resourceIndexRoot');
  return r.path;
}

/** 剪映模板库根目录（resolveSystemAsset('jianyingTemplateRoot')）。 */
export async function resolveJianyingTemplateRoot(): Promise<string> {
  const r = await resolveSystemAsset('jianyingTemplateRoot');
  return r.path;
}
