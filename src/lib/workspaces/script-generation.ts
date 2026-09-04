/**
 * 自动剪辑 —— 视频脚本草案生成（服务端）。
 *
 * 职责：根据「用户需求/主题 + 脚本风格 + 当前企业素材库」调用项目当前配置模型，
 * 生成一条完整、可直接用于 TTS 配音、素材匹配与剪辑的企业短视频口播脚本。
 *
 * 边界（任务收口）：
 * - 只做脚本生成，不进入 TTS / 素材搜索 / Timeline / JianYingAdapter（那属于「一键生成」）。
 * - 不修改执行层（JianYingAdapter / Python Worker / PJD / Contract / Preflight）。
 * - 企业知识：注入素材库现有场景分类，让脚本与可匹配素材对齐。
 */
import { chat } from '@/lib/ai';
import { loadVideoAssetIndex } from '@/lib/agent/video-asset-index';
import type { VideoScriptStyle } from '@/features/workspaces/automation-editing/script-styles';

/** 脚本草案结果 */
export type VideoScriptDraft = {
  styleId: string;
  styleName: string;
  keywords: string[];
  /** 完整脚本文案（可直接阅读 / 配音） */
  script: string;
  /** 脚本字数 */
  charCount: number;
  /** 预计配音时长（秒）：按 1.3x 语速估算，约 7.8 字/秒 */
  estimatedDurationSec: number;
};

/** 按 1.3x 语速估算中文口播时长：326 字 ≈ 42 秒（≈7.8 字/秒） */
const CHARS_PER_SECOND_AT_1_3X = 7.8;

/** 汇总企业素材库场景分类（作为「企业知识」上下文，最多取 8 类） */
async function collectMaterialContext(): Promise<string> {
  try {
    const assets = await loadVideoAssetIndex();
    const categories = [
      ...new Set(
        assets
          .map((asset) => asset.normalizedCategory || asset.sourceCategory)
          .filter((value): value is string => Boolean(value))
      )
    ].slice(0, 8);
    if (categories.length === 0) return '';
    return `企业素材库现有素材场景：${categories.join('、')}。请让脚本尽量贴合这些可用的画面场景。`;
  } catch {
    return '';
  }
}

/**
 * 生成视频脚本草案。
 *
 * @param opts.topic 用户需求/主题（可为空，空时生成通用企业宣传脚本）
 * @param opts.style 脚本风格（策略）
 */
export async function generateVideoScriptDraft(opts: {
  topic?: string;
  style: VideoScriptStyle;
}): Promise<VideoScriptDraft> {
  const topic = (opts.topic ?? '').trim();
  const materialContext = await collectMaterialContext();

  const system =
    '你是知衡智企的企业短视频口播脚本撰写助手。' +
    '请根据用户给出的视频主题与指定脚本风格，生成一条完整的企业短视频口播脚本。' +
    '要求：5-7 句，每句对应一个镜头意图；语言通顺、口语化、可直接用于 TTS 配音与素材匹配；' +
    '只输出脚本文案本身，不要解释、不要编号、不要加标题、不要用 markdown。';

  const user = [
    `视频主题/需求：${topic || '（未提供主题，请生成一条通用的企业宣传短视频脚本）'}`,
    `脚本风格：${opts.style.name}（策略：${opts.style.strategy}）`,
    materialContext,
    '请直接输出完整脚本文案，每句用换行分隔。'
  ]
    .filter(Boolean)
    .join('\n');

  const script = (
    await chat([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ])
  ).trim();

  if (!script) {
    throw new Error('模型未返回脚本内容，请重试');
  }

  const charCount = script.length;
  return {
    styleId: opts.style.id,
    styleName: opts.style.name,
    keywords: opts.style.keywords,
    script,
    charCount,
    estimatedDurationSec: Math.max(8, Math.round(charCount / CHARS_PER_SECOND_AT_1_3X))
  };
}
