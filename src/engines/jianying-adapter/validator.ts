/**
 * JianYing Adapter —— 生成前静态校验。
 *
 * 校验内容（在生成 Job / 调用 Worker 之前）：
 * - Timeline capability（validateTimelineCapabilities）
 * - ResourceMap：Timeline 中所有 styleId 可解析；必需缺失失败、可选替换/跳过产生 warning
 * - 素材引用：assetId 只接受合法格式（真实存在性由 Worker 运行时校验）
 * - 路径：assetRoot / outputDraftDir / stagingRoot 基本合法性（逃逸校验在 Worker 侧做最终判定）
 */
import fs from 'node:fs';
import path from 'node:path';
import type { UnifiedTimelineV2 } from '../zhiheng-renderer/v2-types';
import { ErrorCode, type ContractError } from './errors';
import {
  JIANYING_ADAPTER_CAPABILITIES,
  validateTimelineCapabilities,
  type AdapterCapabilities
} from './capabilities';
import { collectTimelineStyleIds, resolveResource } from './resource-map';

/** Adapter 静态校验结果 */
export interface AdapterValidationResult {
  errors: ContractError[];
  warnings: string[];
  manualReviewRequired: boolean;
}

/**
 * 校验 assetId 格式（库素材或任务素材；不校验文件存在性）。
 *
 * Phase D 校准：允许中文等 Unicode 字符与常见安全符号（企业素材库为中文路径，
 * 如 "05-会议沟通/02_客户接待_1.mp4"、含全角字符与空格）。
 * 仍拒绝：绝对路径/盘符、反斜杠、Windows 非法文件名字符、控制字符、空段、.. 与 .。
 */
function isValidAssetId(assetId: string): boolean {
  if (!assetId) return false;
  // 拒绝绝对路径 / 盘符
  if (assetId.startsWith('/') || assetId.startsWith('\\')) return false;
  if (/^[A-Za-z]:/.test(assetId)) return false;
  // 拒绝 Windows 非法文件名字符与路径分隔符混用（统一用 /）、控制字符
  if (/[\\:*?"<>|\u0000-\u001f\u007f]/.test(assetId)) return false;
  const parts = assetId.split('/');
  if (parts.some((p) => p === '..' || p === '.' || p === '')) return false;
  return true;
}

/** 校验绝对路径是否在允许根目录之下（Windows 不区分大小写比较） */
export function isPathWithin(root: string, target: string): boolean {
  const rootNorm = path.resolve(root).toLowerCase();
  const targetNorm = path.resolve(target).toLowerCase();
  if (targetNorm === rootNorm) return true;
  return targetNorm.startsWith(rootNorm + path.sep);
}

/**
 * 生成前静态校验。
 * @param timeline UnifiedTimelineV2
 * @param caps Adapter 能力声明（默认剪映能力）
 */
export function validateForGeneration(
  timeline: UnifiedTimelineV2,
  caps: AdapterCapabilities = JIANYING_ADAPTER_CAPABILITIES
): AdapterValidationResult {
  const errors: ContractError[] = [];
  const warnings: string[] = [];
  let manualReviewRequired = false;

  // 1. capability 校验
  errors.push(...validateTimelineCapabilities(timeline, caps));

  // 2. ResourceMap：Timeline 引用的所有 styleId 必须可解析
  const styleIds = collectTimelineStyleIds(timeline);
  for (const styleId of styleIds) {
    const res = resolveResource(styleId);
    if ('code' in res) {
      errors.push(res);
    } else {
      if (res.usedFallback || res.skipped) {
        manualReviewRequired = true;
        if (res.warning) warnings.push(res.warning);
      }
    }
  }

  // 3. 素材引用格式
  for (let i = 0; i < timeline.videoTrack.length; i++) {
    const ref = timeline.videoTrack[i].assetRef;
    if (!isValidAssetId(ref.assetId)) {
      errors.push({
        code: ErrorCode.JOB_INVALID,
        message: `videoTrack[${i}].assetRef.assetId "${ref.assetId}" 含非法字符`
      });
    }
  }
  for (const track of [timeline.voiceTrack, timeline.bgmTrack ?? [], timeline.sfxTrack ?? []]) {
    for (const seg of track) {
      if (!isValidAssetId(seg.assetRef.assetId)) {
        errors.push({
          code: ErrorCode.JOB_INVALID,
          message: `素材引用 assetId "${seg.assetRef.assetId}" 含非法字符`
        });
      }
    }
  }

  // 4. 路径存在性基本检查（assetRoot 必须存在）
  return { errors, warnings, manualReviewRequired };
}

/** 检查 assetRoot / draftRoot 是否存在（不存在则报错） */
export function checkRootPaths(assetRoot: string, draftRoot: string): ContractError | null {
  if (!fs.existsSync(assetRoot) || !fs.statSync(assetRoot).isDirectory()) {
    return {
      code: ErrorCode.PATH_OUTSIDE_ALLOWED_ROOT,
      message: `assetRoot 不存在或不是目录: ${assetRoot}`
    };
  }
  if (!fs.existsSync(draftRoot)) {
    try {
      fs.mkdirSync(draftRoot, { recursive: true });
    } catch {
      return { code: ErrorCode.DRAFT_WRITE_FAIL, message: `无法创建 draftRoot: ${draftRoot}` };
    }
  }
  return null;
}

/** 校验 outputDraftDir / stagingRoot 必须在 draftRoot 下 */
export function validateDraftPaths(
  draftRoot: string,
  outputDraftDir: string,
  stagingRoot: string
): ContractError | null {
  if (!isPathWithin(draftRoot, outputDraftDir)) {
    return {
      code: ErrorCode.PATH_OUTSIDE_ALLOWED_ROOT,
      message: `outputDraftDir 超出 draftRoot: ${outputDraftDir}`
    };
  }
  if (!isPathWithin(draftRoot, stagingRoot)) {
    return {
      code: ErrorCode.PATH_OUTSIDE_ALLOWED_ROOT,
      message: `stagingRoot 超出 draftRoot: ${stagingRoot}`
    };
  }
  return null;
}
