/**
 * ASS Generator —— 统一文字层的 ASS 中间格式生成器。
 *
 * V2.2 更新（Phase 2E）：
 * - 支持花字模板库（textstyle_*）：title.styleId 以 textstyle_ 开头时，
 *   从花字模板库读取 assStyle + animation，生成带入场/出场动画的标题。
 * - 花字模板的 decorations（sticker）通过 textStyleOverlays 返回，
 *   由 Renderer 添加到 overlayTrack。
 * - 动画支持：fade_in / fade_out / pop_in，其他类型降级为 fade_in。
 */

import fs from 'node:fs';
import type { SubtitleSegment, TitleSegment } from './types';
import { StyleRegistry, type StyleDefinition } from './style-registry';
import type {
  PackagingAssetResolver,
  TextStyleTemplate,
  TextStyleAssStyle
} from './packaging-asset-resolver';

export interface AssGeneratorOptions {
  width: number;
  height: number;
  videoDuration: number;
  fontsDir?: string;
  textStyleResolver?: PackagingAssetResolver;
}

export interface TextStyleOverlayInfo {
  titleId: string;
  decorationIndex: number;
  type: 'sticker' | 'graphic';
  assetId?: string; // for sticker
  position: string;
  scale?: number; // for sticker
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  start: number;
  duration: number;
  // for graphic (色块背景)
  graphicShape?: string;
  graphicBackgroundColor?: string;
  graphicPaddingX?: number;
  graphicPaddingY?: number;
  graphicCornerRadius?: number;
  graphicWidth?: number; // 计算后的宽度
  graphicHeight?: number; // 计算后的高度
  graphicX?: number; // 计算后的x坐标
  graphicY?: number; // 计算后的y坐标
  titleText?: string; // 标题文字（用于尺寸计算）
  titleFontSize?: number; // 标题字号（用于尺寸计算）
  titleAlignment?: number; // 标题对齐方式
}

export interface TextStyleEntrySfxInfo {
  titleId: string;
  sfxAssetId: string;
  volume: number;
  start: number;
}

export interface AssGenerateResult {
  content: string;
  usedStyles: string[];
  subtitleCount: number;
  titleCount: number;
  textStyleOverlays: TextStyleOverlayInfo[];
  textStyleEntrySfxs: TextStyleEntrySfxInfo[];
  warnings: string[];
}

function secondsToAssTime(seconds: number): string {
  const totalCentiseconds = Math.round(seconds * 100);
  const hours = Math.floor(totalCentiseconds / 360000);
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const secs = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return (
    hours +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(secs).padStart(2, '0') +
    '.' +
    String(centiseconds).padStart(2, '0')
  );
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\n/g, '\\N')
    .replace(/\n/g, '\\N')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝');
}

/**
 * 应用关键词高亮：同时放大字号（+15%）+ 变色。
 */
function applyKeywordHighlights(
  text: string,
  highlights: Array<{ keyword: string; startChar?: number; endChar?: number }>,
  keywordColor: string,
  keywordFontSize?: number
): string {
  if (highlights.length === 0) return text;

  const openTag = keywordFontSize
    ? '{\\fs' + keywordFontSize + '\\c' + keywordColor + '&}'
    : '{\\c' + keywordColor + '&}';
  const closeTag = '{\\r}';

  let result = text;

  for (const hl of highlights) {
    const keyword = hl.keyword;
    if (!keyword) continue;

    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (hl.startChar != null && hl.endChar != null) {
      const before = result.slice(0, hl.startChar);
      const match = result.slice(hl.startChar, hl.endChar);
      const after = result.slice(hl.endChar);
      if (match === keyword) {
        result = before + openTag + match + closeTag + after;
      }
    } else {
      const regex = new RegExp(escapedKeyword, 'g');
      result = result.replace(regex, function (match, offset) {
        const before = result.slice(0, offset);
        const lastOpenTag = before.lastIndexOf('{\\c');
        const lastCloseTag = before.lastIndexOf('{\\r}');
        if (lastOpenTag > lastCloseTag) {
          return match;
        }
        return openTag + match + closeTag;
      });
    }
  }

  return result;
}

/**
 * 生成花字模板的动画标签。
 *
 * 支持：
 * - fade_in / fade_out → \fad
 * - pop_in → \fscx0\fscy0 + \t 缩放
 * - 其他 → 降级为 fade_in，并记录 warning
 */
function generateAnimationTags(
  animation: TextStyleTemplate['animation'],
  warnings: string[],
  templateId: string
): string {
  const tags: string[] = [];
  const inDur = Math.round(animation.inDuration);
  const outDur = Math.round(animation.outDuration);

  // 入场动画
  switch (animation.in) {
    case 'fade_in':
    case 'fade_in_scale':
      // fade_in_scale 额外加缩放
      if (animation.in === 'fade_in_scale') {
        tags.push('\\fscx80\\fscy80');
        tags.push('\\t(0,' + inDur + ',\\fscx100\\fscy100)');
      }
      break;
    case 'pop_in':
      tags.push('\\fscx0\\fscy0');
      tags.push('\\t(0,' + inDur + ',\\fscx100\\fscy100)');
      break;
    case 'shake_in':
      // 抖动入场：用 \frz 旋转模拟左右抖动
      tags.push('\\frz0');
      tags.push('\\t(0,' + Math.round(inDur * 0.2) + ',\\frz-2)');
      tags.push('\\t(' + Math.round(inDur * 0.2) + ',' + Math.round(inDur * 0.4) + ',\\frz2)');
      tags.push('\\t(' + Math.round(inDur * 0.4) + ',' + Math.round(inDur * 0.6) + ',\\frz-1)');
      tags.push('\\t(' + Math.round(inDur * 0.6) + ',' + Math.round(inDur * 0.8) + ',\\frz1)');
      tags.push('\\t(' + Math.round(inDur * 0.8) + ',' + inDur + ',\\frz0)');
      break;
    case 'slide_up':
      // 上滑入场：V0.1 用淡入 + 轻微缩放模拟（真正位移需要\move，后续版本实现）
      tags.push('\\fscx92\\fscy92');
      tags.push('\\t(0,' + inDur + ',\\fscx100\\fscy100)');
      break;
    case 'slide_right':
      // 右滑入场：V0.1 用淡入 + 轻微缩放模拟（真正位移需要\move，后续版本实现）
      tags.push('\\fscx92\\fscy92');
      tags.push('\\t(0,' + inDur + ',\\fscx100\\fscy100)');
      break;
    default:
      warnings.push(
        '花字模板 ' + templateId + ' 的未知入场动画 "' + animation.in + '"，降级为 fade_in'
      );
  }

  // 出场动画（统一用 fad 处理淡出）
  if (animation.out === 'fade_out' || animation.out === 'fade_in') {
    // 用 \fad 统一处理淡入淡出
    // 注意：如果已经有 \t 缩放，\fad 仍然可以共存
  }

  // 统一添加 \fad（淡入 + 淡出）
  // 如果入场是 pop_in，淡入时间可以短一些（缩放本身就是入场效果）
  const fadeInDur = animation.in === 'pop_in' ? Math.min(inDur, 200) : inDur;
  tags.unshift('\\fad(' + fadeInDur + ',' + outDur + ')');

  return '{' + tags.join('') + '}';
}

export class AssGenerator {
  private styleRegistry: StyleRegistry;
  private options: AssGeneratorOptions;
  private warnings: string[] = [];
  private textStyleOverlays: TextStyleOverlayInfo[] = [];
  private textStyleEntrySfxs: TextStyleEntrySfxInfo[] = [];
  private textStyleCache: Map<string, TextStyleTemplate | null> = new Map();

  constructor(styleRegistry: StyleRegistry, options: AssGeneratorOptions) {
    this.styleRegistry = styleRegistry;
    this.options = options;
  }

  generate(subtitles: SubtitleSegment[], titles: TitleSegment[]): AssGenerateResult {
    this.warnings = [];
    this.textStyleOverlays = [];
    this.textStyleEntrySfxs = [];
    const usedStyles = new Set<string>();
    const usedTextStyles = new Set<string>();
    const events: string[] = [];

    // 1. 字幕
    for (const sub of subtitles) {
      const style = this.styleRegistry.get(sub.styleId);
      if (!style) {
        this.warnings.push('字幕 ' + sub.id + ' 引用了不存在的 styleId: ' + sub.styleId + '，跳过');
        continue;
      }
      usedStyles.add(sub.styleId);

      const endTime = sub.start + sub.duration;
      if (endTime > this.options.videoDuration + 0.1) {
        this.warnings.push('字幕 ' + sub.id + ' 结束时间超出视频总时长');
      }

      let text = escapeAssText(sub.text);
      if (sub.highlights && sub.highlights.length > 0) {
        const keywordStyle = this.styleRegistry.get('subtitle.keyword');
        const keywordColor = keywordStyle?.ass.primaryColor || '&H0000FFFF&';
        const keywordFontSize = keywordStyle?.ass.fontSize;
        text = applyKeywordHighlights(text, sub.highlights, keywordColor, keywordFontSize);
        usedStyles.add('subtitle.keyword');
      }

      events.push(this.formatDialogue(sub.id, style, sub.start, sub.duration, text, 0));
    }

    // 2. 标题
    for (const title of titles) {
      // 判断是否是花字模板
      if (title.styleId.startsWith('textstyle_')) {
        const result = this.generateTextStyleTitle(title, usedTextStyles);
        if (result) {
          events.push(result);
        }
        continue;
      }

      // 普通标题（Style Registry）
      const style = this.styleRegistry.get(title.styleId);
      if (!style) {
        this.warnings.push(
          '标题 ' + title.id + ' 引用了不存在的 styleId: ' + title.styleId + '，跳过'
        );
        continue;
      }
      usedStyles.add(title.styleId);

      const endTime = title.start + title.duration;
      if (endTime > this.options.videoDuration + 0.1) {
        this.warnings.push('标题 ' + title.id + ' 结束时间超出视频总时长');
      }

      let text = escapeAssText(title.text);

      // title.hook 样式添加淡入入场动画
      if (title.styleId === 'title.hook' || title.styleId === 'title.hook_radial') {
        text = '{\\fad(300,0)}' + text;
      }

      events.push(
        this.formatDialogue(title.id, style, title.start, title.duration, text, title.layer || 2)
      );
    }

    const content = this.assembleAssFile(usedStyles, usedTextStyles, events);

    return {
      content,
      usedStyles: Array.from(usedStyles),
      subtitleCount: subtitles.length,
      titleCount: titles.length,
      textStyleOverlays: [...this.textStyleOverlays],
      textStyleEntrySfxs: [...this.textStyleEntrySfxs],
      warnings: [...this.warnings]
    };
  }

  /**
   * 生成花字模板标题。
   */
  private generateTextStyleTitle(title: TitleSegment, usedTextStyles: Set<string>): string | null {
    const template = this.getTextStyleTemplate(title.styleId);
    if (!template) {
      this.warnings.push(
        '标题 ' + title.id + ' 引用了不存在的花字模板: ' + title.styleId + '，跳过'
      );
      return null;
    }

    usedTextStyles.add(title.styleId);

    // 收集入场音效（如果模板定义了entrySfx）
    if (template.entrySfx) {
      this.textStyleEntrySfxs.push({
        titleId: title.id,
        sfxAssetId: template.entrySfx,
        volume: template.entrySfxVolume ?? 0.6,
        start: title.start
      });
    }

    const endTime = title.start + title.duration;
    if (endTime > this.options.videoDuration + 0.1) {
      this.warnings.push('花字标题 ' + title.id + ' 结束时间超出视频总时长');
    }

    // 生成动画标签
    const animTags = generateAnimationTags(template.animation, this.warnings, template.id);

    // 文字内容
    let text = escapeAssText(title.text);
    text = animTags + text;

    // 处理 decorations（sticker → 返回 overlay 信息给 Renderer）
    if (template.decorations && template.decorations.length > 0) {
      for (let i = 0; i < template.decorations.length; i++) {
        const dec = template.decorations[i];
        if (dec.type === 'sticker' && dec.assetId) {
          this.textStyleOverlays.push({
            titleId: title.id,
            decorationIndex: i,
            type: 'sticker',
            assetId: dec.assetId,
            position: dec.position || 'left_of_text',
            scale: dec.scale || 1.0,
            opacity: dec.opacity || 1.0,
            offsetX: dec.offsetX || 0,
            offsetY: dec.offsetY || 0,
            start: title.start,
            duration: title.duration
          });
        } else if (dec.type === 'graphic') {
          // V0.1 实现 graphic decoration：计算色块背景尺寸和位置，由renderer生成PNG并overlay
          const fontSize = template.assStyle.fontSize;
          const alignment = template.assStyle.alignment;
          const marginL = template.assStyle.marginL;
          const marginV = template.assStyle.marginV;
          const text = title.text;

          // 估算文字宽度：中文字符≈fontSize，英文字符≈fontSize*0.55
          let textWidth = 0;
          for (const ch of text) {
            if (/[\u4e00-\u9fa5]/.test(ch)) {
              textWidth += fontSize;
            } else if (ch === ' ' || ch === '/') {
              textWidth += fontSize * 0.4;
            } else {
              textWidth += fontSize * 0.55;
            }
          }

          const paddingX = dec.paddingX ?? 40;
          const paddingY = dec.paddingY ?? 20;
          const graphicWidth = Math.round(textWidth + paddingX * 2);
          const graphicHeight = Math.round(fontSize * 1.4 + paddingY * 2);

          // 计算位置（behind_text：和文字对齐）
          // ASS alignment: 1=左下, 2=中下, 3=右下, 4=左中, 5=居中, 6=右中, 7=左上, 8=中上, 9=右上
          let graphicX = 0;
          let graphicY = 0;
          const canvasW = this.options.width;
          const canvasH = this.options.height;

          if (alignment === 4 || alignment === 7 || alignment === 1) {
            graphicX = marginL;
          } else if (alignment === 5 || alignment === 8 || alignment === 2) {
            // 居中：marginL 作为水平偏移
            graphicX = Math.round((canvasW - graphicWidth) / 2) + marginL;
          } else if (alignment === 6 || alignment === 9 || alignment === 3) {
            graphicX = canvasW - graphicWidth - marginL;
          }

          if (alignment === 7 || alignment === 8 || alignment === 9) {
            graphicY = marginV;
          } else if (alignment === 4 || alignment === 5 || alignment === 6) {
            // 垂直居中：marginV 作为垂直偏移
            graphicY = Math.round((canvasH - graphicHeight) / 2) + marginV;
          } else if (alignment === 1 || alignment === 2 || alignment === 3) {
            graphicY = canvasH - graphicHeight - marginV;
          }

          this.textStyleOverlays.push({
            titleId: title.id,
            decorationIndex: i,
            type: 'graphic',
            position: dec.position || 'behind_text',
            opacity: dec.opacity ?? 1.0,
            start: title.start,
            duration: title.duration,
            graphicShape: dec.shape,
            graphicBackgroundColor: dec.backgroundColor,
            graphicPaddingX: paddingX,
            graphicPaddingY: paddingY,
            graphicCornerRadius: dec.cornerRadius,
            graphicWidth,
            graphicHeight,
            graphicX,
            graphicY,
            titleText: text,
            titleFontSize: fontSize,
            titleAlignment: alignment
          });
        }
      }
    }

    // 生成 Dialogue 行（使用花字模板样式名）
    const startTime = secondsToAssTime(title.start);
    const endTimeStr = secondsToAssTime(title.start + title.duration);
    const styleName = this.textStyleIdToAssStyleName(title.styleId);
    const layer = title.layer || 2;

    return (
      'Dialogue: ' +
      layer +
      ',' +
      startTime +
      ',' +
      endTimeStr +
      ',' +
      styleName +
      ',' +
      title.id +
      ',0,0,0,,' +
      text
    );
  }

  /**
   * 获取花字模板（带缓存）。
   */
  private getTextStyleTemplate(assetId: string): TextStyleTemplate | null {
    if (this.textStyleCache.has(assetId)) {
      return this.textStyleCache.get(assetId) || null;
    }

    if (!this.options.textStyleResolver) {
      this.warnings.push('ASS Generator 未配置 textStyleResolver，无法加载花字模板 ' + assetId);
      this.textStyleCache.set(assetId, null);
      return null;
    }

    const template = this.options.textStyleResolver.getTextStyle(assetId);
    this.textStyleCache.set(assetId, template);
    return template;
  }

  generateToFile(
    subtitles: SubtitleSegment[],
    titles: TitleSegment[],
    outputPath: string
  ): AssGenerateResult {
    const result = this.generate(subtitles, titles);
    fs.writeFileSync(outputPath, result.content, 'utf8');
    return result;
  }

  private formatDialogue(
    id: string,
    style: StyleDefinition,
    start: number,
    duration: number,
    text: string,
    layer: number
  ): string {
    const startTime = secondsToAssTime(start);
    const endTime = secondsToAssTime(start + duration);
    const styleName = this.styleIdToAssStyleName(style.styleId);
    return (
      'Dialogue: ' +
      layer +
      ',' +
      startTime +
      ',' +
      endTime +
      ',' +
      styleName +
      ',' +
      id +
      ',0,0,0,,' +
      text
    );
  }

  private styleIdToAssStyleName(styleId: string): string {
    return styleId.replace(/\./g, '_');
  }

  private textStyleIdToAssStyleName(styleId: string): string {
    // textstyle_opening_clean → textstyle_opening_clean
    return styleId;
  }

  private formatStyle(style: StyleDefinition): string {
    const a = style.ass;
    const name = this.styleIdToAssStyleName(style.styleId);
    const bold = a.bold ? -1 : 0;
    const italic = a.italic ? -1 : 0;
    const underline = a.underline ? -1 : 0;
    const strikeOut = a.strikeOut ? -1 : 0;
    const encoding = 1;

    return (
      'Style: ' +
      name +
      ',' +
      a.fontName +
      ',' +
      a.fontSize +
      ',' +
      a.primaryColor +
      ',&H00000000,' +
      a.outlineColor +
      ',' +
      a.backColor +
      ',' +
      bold +
      ',' +
      italic +
      ',' +
      underline +
      ',' +
      strikeOut +
      ',' +
      a.scaleX +
      ',' +
      a.scaleY +
      ',' +
      a.spacing +
      ',' +
      a.angle +
      ',' +
      a.borderStyle +
      ',' +
      a.outline +
      ',' +
      a.shadow +
      ',' +
      a.alignment +
      ',' +
      a.marginL +
      ',' +
      a.marginR +
      ',' +
      a.marginV +
      ',' +
      encoding
    );
  }

  /**
   * 格式化花字模板的 assStyle 为 ASS Style 行。
   */
  private formatTextStyle(template: TextStyleTemplate): string {
    const a = template.assStyle;
    const name = this.textStyleIdToAssStyleName(template.id);
    const bold = a.bold ? -1 : 0;
    const encoding = 1;

    return (
      'Style: ' +
      name +
      ',' +
      a.fontName +
      ',' +
      a.fontSize +
      ',' +
      a.primaryColor +
      ',&H00000000,' +
      a.outlineColor +
      ',' +
      a.backColor +
      ',' +
      bold +
      ',0,0,0,100,100,0,0,' +
      a.borderStyle +
      ',' +
      a.outline +
      ',' +
      a.shadow +
      ',' +
      a.alignment +
      ',' +
      a.marginL +
      ',' +
      a.marginR +
      ',' +
      a.marginV +
      ',' +
      encoding
    );
  }

  private assembleAssFile(
    usedStyles: Set<string>,
    usedTextStyles: Set<string>,
    events: string[]
  ): string {
    const lines: string[] = [];

    lines.push('[Script Info]');
    lines.push('; Script generated by Zhiheng Renderer ASS Generator');
    lines.push('; Do not edit manually - regenerate from Unified Timeline');
    lines.push('ScriptType: v4.00+');
    lines.push('PlayResX: ' + this.options.width);
    lines.push('PlayResY: ' + this.options.height);
    lines.push('WrapStyle: 0');
    lines.push('ScaledBorderAndShadow: yes');
    lines.push('YCbCr Matrix: TV.709');
    lines.push('');

    lines.push('[V4+ Styles]');
    lines.push(
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding'
    );

    // 普通样式（Style Registry）
    for (const styleId of usedStyles) {
      const style = this.styleRegistry.get(styleId);
      if (style) {
        lines.push(this.formatStyle(style));
      }
    }

    // 花字模板样式
    for (const textStyleId of usedTextStyles) {
      const template = this.getTextStyleTemplate(textStyleId);
      if (template) {
        lines.push(this.formatTextStyle(template));
      }
    }

    lines.push('');

    lines.push('[Events]');
    lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
    for (const event of events) {
      lines.push(event);
    }
    lines.push('');

    return lines.join('\n');
  }
}
