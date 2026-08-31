/**
 * Layout Registry —— 布局注册表。
 *
 * 职责：
 * - 定义 safe area（安全区）
 * - 定义默认元素尺寸
 * - 根据 anchor + output profile + safe area + element size 计算最终像素坐标
 * - 字幕避让（bottom 区域元素不压字幕）
 * - Layer Order（层级顺序）
 *
 * Phase 2C.1 视觉整改（provisional）：
 * - panel 尺寸缩小（不横跨，只包住标题区域）
 * - badge 缩小 30-40%
 * - card 明显缩小
 * - 避免 center 锚点遮主体，优先 top-left/top-right/center-left
 * - bottom 区域继续避让字幕
 *
 * 所有参数 provisional，需人工看片确认。
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 9 个固定语义锚点 */
export type Anchor =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center_left'
  | 'center'
  | 'center_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right';

/** 元素尺寸 */
export interface ElementSize {
  width: number;
  height: number;
}

/** 安全区配置 */
export interface SafeAreaConfig {
  /** 顶部安全区（像素） */
  top: number;
  /** 底部安全区（像素） */
  bottom: number;
  /** 左右边距（像素） */
  sideMargin: number;
  /** 字幕预留区高度（从底部算起，像素） */
  subtitleReservedHeight: number;
  /** 标题预留区高度（从顶部算起，像素） */
  titleReservedHeight: number;
}

/** 计算后的布局位置 */
export interface LayoutPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 是否触发了字幕避让 */
  subtitleAvoidanceApplied: boolean;
}

// ============================================================================
// 默认配置（provisional，Phase 2C.1 整改后）
// ============================================================================

/**
 * 默认安全区（基于 1080×1920，provisional）。
 *
 * Phase 2C.1 调整：
 * - top 从 80 降到 60（标题更靠近顶部安全区）
 * - subtitleReservedHeight 从 320 降到 280（字幕区域更紧凑）
 */
export const DEFAULT_SAFE_AREA: SafeAreaConfig = {
  top: 60,
  bottom: 60,
  sideMargin: 48,
  subtitleReservedHeight: 280,
  titleReservedHeight: 180
};

/**
 * 默认元素尺寸（provisional，Phase 2C.1 整改后）。
 *
 * 整改要点：
 * - panel：宽度从 960 降到 560（不横跨，只包住标题区域），高度从 120/140 降到 80/90
 * - badge：宽度从 240/280 降到 160/180（缩小约 33%），高度从 72 降到 48
 * - card：宽度从 900 降到 520（明显缩小），高度从 200 降到 120
 * - logo：默认 200×200
 */
export const DEFAULT_ELEMENT_SIZES: Record<string, ElementSize> = {
  // Title Panel
  'panel.default': { width: 400, height: 70 },
  'panel.hook': { width: 380, height: 72 },
  'panel.solid': { width: 400, height: 70 },
  'panel.accent_bar': { width: 6, height: 70 },

  // Badge
  'badge.default': { width: 140, height: 40 },
  'badge.oem': { width: 130, height: 40 },
  'badge.factory': { width: 140, height: 40 },
  'badge.dark': { width: 140, height: 40 },
  'badge.accent': { width: 6, height: 40 },

  // Info Card（V2.1：增大尺寸覆盖三行文字，600×180）
  'card.info': { width: 600, height: 180 },
  'card.small': { width: 520, height: 140 },
  'card.accent': { width: 600, height: 180 },

  // Logo / Image
  logo: { width: 200, height: 200 },
  image: { width: 300, height: 300 }
};

// ============================================================================
// Layer Order（正式层级顺序）
// ============================================================================

/**
 * 正式 Layer Order（数值越大越靠上）。
 *
 * Phase 2C 定义，Phase 2C.1 保持不变。
 */
export const LAYER_ORDER: Record<string, number> = {
  video: 0,
  graphic_bg: 10,
  title_panel: 10,
  image_logo: 20,
  badge: 30,
  info_card: 40
};

/**
 * 根据 overlay type 获取层级。
 */
export function getOverlayLayer(type: string): number {
  switch (type) {
    case 'title_panel':
      return LAYER_ORDER.title_panel;
    case 'image':
    case 'logo':
      return LAYER_ORDER.image_logo;
    case 'badge':
      return LAYER_ORDER.badge;
    case 'info_card':
      return LAYER_ORDER.info_card;
    default:
      return LAYER_ORDER.graphic_bg;
  }
}

// ============================================================================
// 布局计算
// ============================================================================

/**
 * 根据 anchor + output profile + safe area + element size 计算最终像素坐标。
 *
 * 字幕避让规则：
 * - bottom_* 锚点元素如果进入字幕预留区（height - subtitleReservedHeight 以下），
 *   自动上移到字幕区之上 + 20px 间距。
 *
 * Phase 2C.1 调整：
 * - 避免 center 锚点遮主体（center 仍然支持但不推荐）
 * - 优先 top-left/top-right/center-left
 */
export function calculateLayout(
  anchor: Anchor,
  elementSize: ElementSize,
  outputWidth: number,
  outputHeight: number,
  safeArea: SafeAreaConfig = DEFAULT_SAFE_AREA
): LayoutPosition {
  const { width, height } = elementSize;
  let x: number;
  let y: number;
  let subtitleAvoidanceApplied = false;

  // 计算 x
  switch (anchor) {
    case 'top_left':
    case 'center_left':
    case 'bottom_left':
      x = safeArea.sideMargin;
      break;
    case 'top_center':
    case 'center':
    case 'bottom_center':
      x = Math.round((outputWidth - width) / 2);
      break;
    case 'top_right':
    case 'center_right':
    case 'bottom_right':
      x = outputWidth - width - safeArea.sideMargin;
      break;
    default:
      x = safeArea.sideMargin;
  }

  // 计算 y
  switch (anchor) {
    case 'top_left':
    case 'top_center':
    case 'top_right':
      y = safeArea.top;
      break;
    case 'center_left':
    case 'center':
    case 'center_right':
      y = Math.round((outputHeight - height) / 2);
      break;
    case 'bottom_left':
    case 'bottom_center':
    case 'bottom_right':
      y = outputHeight - height - safeArea.bottom;
      break;
    default:
      y = safeArea.top;
  }

  // 字幕避让：bottom_* 锚点元素如果进入字幕预留区，自动上移
  const subtitleTop = outputHeight - safeArea.subtitleReservedHeight;
  if (
    (anchor === 'bottom_left' || anchor === 'bottom_center' || anchor === 'bottom_right') &&
    y + height > subtitleTop
  ) {
    y = subtitleTop - height - 20; // 字幕区之上 + 20px 间距
    subtitleAvoidanceApplied = true;
  }

  return {
    x,
    y,
    width,
    height,
    subtitleAvoidanceApplied
  };
}

/**
 * 获取指定 styleId 的默认元素尺寸。
 */
export function getDefaultElementSize(styleId: string): ElementSize {
  return DEFAULT_ELEMENT_SIZES[styleId] || { width: 400, height: 100 };
}
