/**
 * Graphic Generator —— 包装图形生成器。
 *
 * V2 更新（2026-08-30）：基于样片001-005逐帧分析重构。
 * 核心变更：
 * - 底板颜色：深灰黑 → 蓝色半透明（#2563EB，样片001/002信息卡风格）
 * - 透明度：0.45-0.60 → 0.70-0.80（人工样片底板更实）
 * - accent bar 保持黄色（#FFD700）
 * - badge 标记为 deprecated（0/5样片使用），但保留样式
 *
 * 使用 FFmpeg color 源滤镜生成纯色/半透明矩形 PNG，支持 rgba 透明度。
 * 不使用 sharp/canvas 等额外依赖。
 */

import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { OverlaySegment } from './types';
import { DEFAULT_ELEMENT_SIZES, type ElementSize } from './layout-registry';

// ============================================================================
// Graphic 样式定义（V2：蓝色半透明底板，基于样片001/002）
// ============================================================================

export interface GraphicStyle {
  backgroundColor: string;
  size?: ElementSize;
  padding?: number;
}

/**
 * Graphic 样式注册表（V2重构）。
 * 底板颜色统一为蓝色半透明 #2563EB，参考样片001/002信息卡。
 * accent 元素保持黄色 #FFD700。
 */
export const GRAPHIC_STYLES: Record<string, GraphicStyle> = {
  // Title Panel —— 标题底板（蓝色半透明，V2）
  'panel.default': {
    backgroundColor: '#2563EB@0.75',
    padding: 20
  },
  'panel.hook': {
    backgroundColor: '#2563EB@0.80',
    padding: 20
  },
  'panel.solid': {
    backgroundColor: '#1D4ED8@0.90',
    padding: 20
  },
  // panel accent bar（左侧短黄装饰条，小面积强调）
  'panel.accent_bar': {
    backgroundColor: '#FFD700@1.0',
    padding: 0
  },

  // Badge —— 角标（V2：DEPRECATED，0/5样片使用，保留仅为兼容）
  'badge.default': {
    backgroundColor: '#2563EB@0.70',
    padding: 12
  },
  'badge.oem': {
    backgroundColor: '#2563EB@0.70',
    padding: 12
  },
  'badge.factory': {
    backgroundColor: '#2563EB@0.70',
    padding: 12
  },
  'badge.dark': {
    backgroundColor: '#1D4ED8@0.75',
    padding: 12
  },
  'badge.accent': {
    backgroundColor: '#FFD700@1.0',
    padding: 0
  },

  // Info Card —— 信息卡（V2.1：蓝色半透明，透明度0.55，更通透）
  'card.info': {
    backgroundColor: '#2563EB@0.55',
    padding: 24
  },
  'card.small': {
    backgroundColor: '#2563EB@0.55',
    padding: 20
  },
  'card.accent': {
    backgroundColor: '#1E40AF@0.60',
    padding: 24
  }
};

// ============================================================================
// Graphic 生成
// ============================================================================

export interface GeneratedGraphic {
  /** 生成的 PNG 文件路径 */
  outputPath: string;
  /** 元素宽度 */
  width: number;
  /** 元素高度 */
  height: number;
  /** 背景颜色 */
  backgroundColor: string;
  /** styleId */
  styleId: string;
}

/**
 * 获取元素尺寸：优先用 style 中定义的，否则用默认尺寸表。
 */
function getElementSize(styleId: string, style?: GraphicStyle): ElementSize {
  if (style?.size) return style.size;
  if (DEFAULT_ELEMENT_SIZES[styleId]) return DEFAULT_ELEMENT_SIZES[styleId];
  return { width: 400, height: 100 };
}

/**
 * 生成一个纯色/半透明矩形背景 PNG。
 *
 * 使用 FFmpeg color 源滤镜：
 *   ffmpeg -f lavfi -i color=c=black@0.7:s=WxH:r=1 -frames:v 1 output.png
 */
export function generateGraphic(
  ffmpegPath: string,
  styleId: string,
  outputDir: string,
  graphicId: string,
  customSize?: ElementSize
): GeneratedGraphic {
  const style = GRAPHIC_STYLES[styleId];
  if (!style) {
    throw new Error(
      `Graphic style not found: ${styleId}. Available: ${Object.keys(GRAPHIC_STYLES).join(', ')}`
    );
  }

  const size = customSize || getElementSize(styleId, style);
  const { width, height } = size;
  const outputPath = path.join(outputDir, `${graphicId}.png`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${style.backgroundColor}:s=${width}x${height}:r=1`,
    '-frames:v',
    '1',
    '-y',
    outputPath
  ];

  try {
    execFileSync(ffmpegPath, args, { stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`Failed to generate graphic ${styleId}: ${e.message}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Graphic output not found: ${outputPath}`);
  }

  return {
    outputPath,
    width,
    height,
    backgroundColor: style.backgroundColor,
    styleId
  };
}

/**
 * 生成自定义尺寸和颜色的 graphic PNG（用于花字模板色块背景）。
 *
 * @param ffmpegPath ffmpeg可执行文件路径
 * @param outputDir 输出目录
 * @param graphicId graphic唯一标识（用于文件名）
 * @param width 宽度
 * @param height 高度
 * @param backgroundColor 背景颜色，支持 "#RRGGBB" 或 "#RRGGBB@opacity" 格式
 */
export function generateGraphicCustom(
  ffmpegPath: string,
  outputDir: string,
  graphicId: string,
  width: number,
  height: number,
  backgroundColor: string
): GeneratedGraphic {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${graphicId}.png`);

  // 转换颜色格式：#RRGGBB@opacity -> 0xRRGGBBAA
  let ffmpegColor = backgroundColor;
  if (backgroundColor.startsWith('#')) {
    const atIdx = backgroundColor.indexOf('@');
    if (atIdx > 0) {
      const hex = backgroundColor.slice(1, atIdx);
      const opacity = parseFloat(backgroundColor.slice(atIdx + 1));
      const alpha = Math.round(opacity * 255)
        .toString(16)
        .padStart(2, '0');
      ffmpegColor = `0x${hex}${alpha}`;
    } else {
      ffmpegColor = backgroundColor.replace('#', '0x') + 'FF';
    }
  }

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${ffmpegColor}:s=${width}x${height}:r=1`,
    '-frames:v',
    '1',
    '-y',
    outputPath
  ];

  try {
    execFileSync(ffmpegPath, args, { stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`Failed to generate custom graphic ${graphicId}: ${e.message}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Custom graphic output not found: ${outputPath}`);
  }

  return {
    outputPath,
    width,
    height,
    backgroundColor,
    styleId: 'custom'
  };
}

/**
 * 批量生成 Timeline 中所有需要 graphic 的 overlay 元素。
 * image/logo 类型不需要生成（使用素材 PNG）。
 * badge/title_panel/info_card 类型需要生成背景 graphic。
 */
export function generateAllGraphics(
  ffmpegPath: string,
  overlays: OverlaySegment[],
  outputDir: string
): Map<string, GeneratedGraphic> {
  const result = new Map<string, GeneratedGraphic>();
  const graphicDir = path.join(outputDir, 'graphics');

  for (const overlay of overlays) {
    if (overlay.type === 'image' || overlay.type === 'logo') {
      continue;
    }

    const graphic = generateGraphic(ffmpegPath, overlay.styleId, graphicDir, overlay.id);
    result.set(overlay.id, graphic);
  }

  return result;
}
