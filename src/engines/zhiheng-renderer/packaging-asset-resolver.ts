/**
 * Packaging Asset Resolver —— 包装素材解析器。
 *
 * 统一解析音效库、贴纸库、花字模板库的 assetId → 真实文件路径。
 *
 * 素材库结构：
 *   assets/01_音效库/index.json    → sound_asset
 *   assets/02_贴纸库/index.json    → sticker_asset
 *   assets/03_花字模板库/index.json → textstyle_asset
 *
 * 每个 index.json 的 assets 数组包含 { id, file, ... }，file 是相对于库根目录的相对路径。
 *
 * Renderer 永远接收 assetId，不接收绝对路径。
 * PackagingAssetResolver 负责把 assetId 解析为当前环境下的真实文件路径。
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// 类型定义
// ============================================================================

export type PackagingAssetType = 'sound_asset' | 'sticker_asset' | 'textstyle_asset' | 'font_asset';

export interface ResolvedPackagingAsset {
  assetId: string;
  assetType: PackagingAssetType;
  resolvedPath: string | null;
  /** 素材库中的元数据（名称、分类、标签等） */
  metadata: Record<string, unknown> | null;
  source: 'sound_library' | 'sticker_library' | 'textstyle_library' | 'font_library' | 'not_found';
  exists: boolean;
}

interface LibraryIndexEntry {
  id: string;
  name?: string;
  file?: string;
  category?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface LibraryIndex {
  library: string;
  name: string;
  version: string;
  assets: LibraryIndexEntry[];
}

// ============================================================================
// 花字模板类型
// ============================================================================

export interface TextStyleAssStyle {
  fontName: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  backColor: string;
  bold: boolean;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
}

export interface TextStyleDecoration {
  type: 'sticker' | 'graphic';
  assetId?: string;
  shape?: string;
  backgroundColor?: string;
  position: string;
  scale?: number;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  paddingX?: number;
  paddingY?: number;
  cornerRadius?: number;
}

export interface TextStyleAnimation {
  in: string;
  inDuration: number;
  out: string;
  outDuration: number;
  popScale?: number[];
}

export interface TextStyleTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  version: string;
  status: string;
  assStyle: TextStyleAssStyle;
  decorations: TextStyleDecoration[];
  animation: TextStyleAnimation;
  usage: string;
  tags: string[];
  /** 入场音效 assetId（可选，如 sfx_ding_clean_01），Renderer自动在标题入场时播放 */
  entrySfx?: string;
  /** 入场音效音量（可选，默认0.6） */
  entrySfxVolume?: number;
}

// ============================================================================
// Packaging Asset Resolver
// ============================================================================

/**
 * Packaging Asset Resolver —— 包装素材解析器。
 *
 * 读取各素材库的 index.json，构建 assetId → 真实路径的映射。
 * 支持热加载（构造时读取一次，后续可调用 reload() 刷新）。
 */
export class PackagingAssetResolver {
  private assetsRoot: string;
  private soundIndex: LibraryIndex | null = null;
  private stickerIndex: LibraryIndex | null = null;
  private textStyleIndex: LibraryIndex | null = null;
  private fontIndex: LibraryIndex | null = null;

  /**
   * @param assetsRoot 素材库根目录，默认 assets/
   */
  constructor(assetsRoot?: string) {
    this.assetsRoot = assetsRoot || path.join(process.cwd(), 'assets');
    this.loadAllIndexes();
  }

  /**
   * 加载所有素材库的 index.json。
   */
  private loadAllIndexes(): void {
    this.soundIndex = this.loadIndex('01_音效库');
    this.stickerIndex = this.loadIndex('02_贴纸库');
    this.textStyleIndex = this.loadIndex('03_花字模板库');
    this.fontIndex = this.loadIndex('05_字体库');
  }

  /**
   * 加载单个库的 index.json。
   */
  private loadIndex(dirName: string): LibraryIndex | null {
    const indexPath = path.join(this.assetsRoot, dirName, 'index.json');
    if (!fs.existsSync(indexPath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      return JSON.parse(content) as LibraryIndex;
    } catch (err) {
      console.warn(
        `[PackagingAssetResolver] 加载 ${dirName}/index.json 失败: ${(err as Error).message}`
      );
      return null;
    }
  }

  /**
   * 重新加载所有索引（素材库更新后调用）。
   */
  reload(): void {
    this.loadAllIndexes();
  }

  /**
   * 解析包装素材 assetId → ResolvedPackagingAsset。
   *
   * @param assetId 素材 ID，如 "sfx_ding_clean_01"、"sticker_arrow_down_yellow"
   * @param assetType 可选，指定素材类型。不指定时自动检测。
   */
  resolve(assetId: string, assetType?: PackagingAssetType): ResolvedPackagingAsset {
    // 如果指定了类型，直接查对应库
    if (assetType) {
      return this.resolveByType(assetId, assetType);
    }

    // 自动检测：按 ID 前缀判断
    if (
      assetId.startsWith('sfx_') ||
      assetId.startsWith('bgm_') ||
      assetId.startsWith('ambient_')
    ) {
      return this.resolveByType(assetId, 'sound_asset');
    }
    if (assetId.startsWith('sticker_')) {
      return this.resolveByType(assetId, 'sticker_asset');
    }
    if (assetId.startsWith('textstyle_')) {
      return this.resolveByType(assetId, 'textstyle_asset');
    }
    if (assetId.startsWith('font_')) {
      return this.resolveByType(assetId, 'font_asset');
    }

    // 无法判断类型，依次查找所有库
    const allTypes: PackagingAssetType[] = [
      'sound_asset',
      'sticker_asset',
      'textstyle_asset',
      'font_asset'
    ];
    for (const t of allTypes) {
      const result = this.resolveByType(assetId, t);
      if (result.exists) {
        return result;
      }
    }

    return {
      assetId,
      assetType: 'sound_asset',
      resolvedPath: null,
      metadata: null,
      source: 'not_found',
      exists: false
    };
  }

  /**
   * 按类型解析。
   */
  private resolveByType(assetId: string, assetType: PackagingAssetType): ResolvedPackagingAsset {
    let index: LibraryIndex | null = null;
    let dirName = '';
    let source: ResolvedPackagingAsset['source'] = 'not_found';

    switch (assetType) {
      case 'sound_asset':
        index = this.soundIndex;
        dirName = '01_音效库';
        source = 'sound_library';
        break;
      case 'sticker_asset':
        index = this.stickerIndex;
        dirName = '02_贴纸库';
        source = 'sticker_library';
        break;
      case 'textstyle_asset':
        index = this.textStyleIndex;
        dirName = '03_花字模板库';
        source = 'textstyle_library';
        break;
      case 'font_asset':
        index = this.fontIndex;
        dirName = '05_字体库';
        source = 'font_library';
        break;
    }

    if (!index) {
      return {
        assetId,
        assetType,
        resolvedPath: null,
        metadata: null,
        source: 'not_found',
        exists: false
      };
    }

    const entry = index.assets.find((a) => a.id === assetId);
    if (!entry || !entry.file) {
      return {
        assetId,
        assetType,
        resolvedPath: null,
        metadata: null,
        source,
        exists: false
      };
    }

    const resolvedPath = path.join(this.assetsRoot, dirName, entry.file);
    const exists = fs.existsSync(resolvedPath);

    return {
      assetId,
      assetType,
      resolvedPath,
      metadata: { ...entry },
      source,
      exists
    };
  }

  /**
   * 获取音效库中所有音效 ID。
   */
  getAllSoundIds(): string[] {
    return this.soundIndex?.assets?.map((a) => a.id) || [];
  }

  /**
   * 获取贴纸库中所有贴纸 ID。
   */
  getAllStickerIds(): string[] {
    return this.stickerIndex?.assets?.map((a) => a.id) || [];
  }

  /**
   * 获取花字模板库中所有模板 ID。
   */
  getAllTextStyleIds(): string[] {
    return this.textStyleIndex?.assets?.map((a) => a.id) || [];
  }

  /**
   * 读取并解析花字模板 JSON。
   *
   * @param assetId 模板 ID，如 "textstyle_opening_clean"
   * @returns 模板对象，失败返回 null
   */
  getTextStyle(assetId: string): TextStyleTemplate | null {
    const resolved = this.resolve(assetId, 'textstyle_asset');
    if (!resolved.exists || !resolved.resolvedPath) {
      return null;
    }
    try {
      const content = fs.readFileSync(resolved.resolvedPath, 'utf8');
      return JSON.parse(content) as TextStyleTemplate;
    } catch (err) {
      console.warn(
        '[PackagingAssetResolver] 读取花字模板 ' + assetId + ' 失败: ' + (err as Error).message
      );
      return null;
    }
  }

  /**
   * 获取素材库统计信息。
   */
  getStats(): Record<string, { count: number; loaded: boolean }> {
    return {
      sound: { count: this.soundIndex?.assets?.length || 0, loaded: !!this.soundIndex },
      sticker: { count: this.stickerIndex?.assets?.length || 0, loaded: !!this.stickerIndex },
      textStyle: { count: this.textStyleIndex?.assets?.length || 0, loaded: !!this.textStyleIndex },
      font: { count: this.fontIndex?.assets?.length || 0, loaded: !!this.fontIndex }
    };
  }
}
