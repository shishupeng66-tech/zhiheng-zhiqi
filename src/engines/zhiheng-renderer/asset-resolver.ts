/**
 * Asset Resolver —— 素材引用解析器。
 *
 * Renderer 永远接收 AssetRef { type, assetId }，不接收绝对路径。
 * Asset Resolver 负责把 assetId 解析为当前环境下的真实文件路径。
 *
 * 支持两种素材类型：
 * - library_asset：正式素材库中的素材，全局唯一，跨任务复用
 * - task_asset：任务级临时素材（上传的测试素材、临时生成的素材）
 *
 * V0.1 最小实现：
 * - library_asset 通过构造时传入的映射表解析（后续可替换为 DB 查询）
 * - task_asset 通过 Asset Manifest 注册和查询
 * - Timeline 中禁止使用 assetPath / sourceRef / Windows 绝对路径
 *
 * Asset Manifest 可以持久化到 JSON 文件，与 Timeline 一起保存，用于失败重试和重放。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AssetRef } from './types';

// ============================================================================
// 类型定义
// ============================================================================

export type AssetType = 'library_asset' | 'task_asset';

export type ResolvedAssetSource =
  | 'library_map' // 通过 libraryAssetMap 解析
  | 'task_manifest' // 通过 Task Asset Manifest 解析
  | 'not_found';

export interface ResolvedAsset {
  assetId: string;
  assetType: AssetType;
  resolvedPath: string | null;
  source: ResolvedAssetSource;
  exists: boolean;
}

export interface TaskAssetManifestEntry {
  assetId: string;
  originalName: string;
  storageType: 'local_temp' | 'local_permanent' | 'url';
  localPath: string;
  registeredAt: string;
  metadata?: Record<string, unknown>;
}

export interface TaskAssetManifestData {
  taskId: string;
  createdAt: string;
  assets: Record<string, TaskAssetManifestEntry>;
}

// ============================================================================
// Task Asset Manifest
// ============================================================================

/**
 * Task Asset Manifest —— 任务级素材清单。
 *
 * 管理当前任务中所有 task_asset 的注册和查询。
 * 可以持久化到 JSON 文件，与 Timeline 一起保存。
 */
export class TaskAssetManifest {
  private manifest: TaskAssetManifestData;

  constructor(taskId: string) {
    this.manifest = {
      taskId,
      createdAt: new Date().toISOString(),
      assets: {}
    };
  }

  /**
   * 注册一个 task_asset。
   */
  register(
    assetId: string,
    localPath: string,
    options: {
      originalName?: string;
      storageType?: TaskAssetManifestEntry['storageType'];
      metadata?: Record<string, unknown>;
    } = {}
  ): TaskAssetManifestEntry {
    const entry: TaskAssetManifestEntry = {
      assetId,
      originalName: options.originalName || path.basename(localPath),
      storageType: options.storageType || 'local_temp',
      localPath,
      registeredAt: new Date().toISOString(),
      metadata: options.metadata
    };
    this.manifest.assets[assetId] = entry;
    return entry;
  }

  /**
   * 查询 task_asset。
   */
  get(assetId: string): TaskAssetManifestEntry | undefined {
    return this.manifest.assets[assetId];
  }

  /**
   * 检查 task_asset 是否存在。
   */
  has(assetId: string): boolean {
    return assetId in this.manifest.assets;
  }

  /**
   * 获取所有已注册的 assetId。
   */
  getAllAssetIds(): string[] {
    return Object.keys(this.manifest.assets);
  }

  /**
   * 保存到 JSON 文件。
   */
  saveToFile(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.manifest, null, 2), 'utf8');
  }

  /**
   * 从 JSON 文件加载。
   */
  static loadFromFile(filePath: string): TaskAssetManifest {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as TaskAssetManifestData;
    const manifest = new TaskAssetManifest(data.taskId);
    manifest.manifest = data;
    return manifest;
  }

  /**
   * 获取原始 manifest 对象（用于序列化）。
   */
  toJSON(): TaskAssetManifestData {
    return { ...this.manifest };
  }
}

// ============================================================================
// Asset Resolver
// ============================================================================

/**
 * Asset Resolver —— 素材引用解析器。
 *
 * 把 AssetRef { type, assetId } 解析为 ResolvedAsset（含真实文件路径）。
 *
 * V0.1 实现：
 * - library_asset：通过构造时传入的 libraryAssetMap 解析
 * - task_asset：通过 TaskAssetManifest 解析
 *
 * 后续可替换为：
 * - library_asset：查询 DB（automationVideoAssets 表）
 * - task_asset：查询对象存储 / NAS / 缓存代理
 */
export class AssetResolver {
  private libraryAssetMap: Record<string, string>;
  private taskManifest: TaskAssetManifest;

  /**
   * @param taskId 当前任务 ID
   * @param libraryAssetMap library_asset 的 assetId → 真实路径映射表
   * @param taskManifest 可选，已有的 Task Asset Manifest
   */
  constructor(
    taskId: string,
    libraryAssetMap: Record<string, string> = {},
    taskManifest?: TaskAssetManifest
  ) {
    this.libraryAssetMap = libraryAssetMap;
    this.taskManifest = taskManifest || new TaskAssetManifest(taskId);
  }

  /**
   * 解析 AssetRef 为 ResolvedAsset。
   */
  resolve(assetRef: AssetRef): ResolvedAsset {
    if (assetRef.type === 'library_asset') {
      return this.resolveLibraryAsset(assetRef.assetId);
    }
    if (assetRef.type === 'task_asset') {
      return this.resolveTaskAsset(assetRef.assetId);
    }
    return {
      assetId: assetRef.assetId,
      assetType: assetRef.type as AssetType,
      resolvedPath: null,
      source: 'not_found',
      exists: false
    };
  }

  /**
   * 注册一个 task_asset。
   */
  registerTaskAsset(
    assetId: string,
    localPath: string,
    options?: {
      originalName?: string;
      storageType?: TaskAssetManifestEntry['storageType'];
      metadata?: Record<string, unknown>;
    }
  ): TaskAssetManifestEntry {
    return this.taskManifest.register(assetId, localPath, options);
  }

  /**
   * 批量注册 library_asset。
   */
  registerLibraryAssets(map: Record<string, string>): void {
    Object.assign(this.libraryAssetMap, map);
  }

  /**
   * 获取 Task Asset Manifest（用于持久化）。
   */
  getTaskManifest(): TaskAssetManifest {
    return this.taskManifest;
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  private resolveLibraryAsset(assetId: string): ResolvedAsset {
    const resolvedPath = this.libraryAssetMap[assetId];
    if (!resolvedPath) {
      return {
        assetId,
        assetType: 'library_asset',
        resolvedPath: null,
        source: 'not_found',
        exists: false
      };
    }
    const exists = fs.existsSync(resolvedPath);
    return {
      assetId,
      assetType: 'library_asset',
      resolvedPath,
      source: 'library_map',
      exists
    };
  }

  private resolveTaskAsset(assetId: string): ResolvedAsset {
    const entry = this.taskManifest.get(assetId);
    if (!entry) {
      return {
        assetId,
        assetType: 'task_asset',
        resolvedPath: null,
        source: 'not_found',
        exists: false
      };
    }
    const exists = fs.existsSync(entry.localPath);
    return {
      assetId,
      assetType: 'task_asset',
      resolvedPath: entry.localPath,
      source: 'task_manifest',
      exists
    };
  }
}
