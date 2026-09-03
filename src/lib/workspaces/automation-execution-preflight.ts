/**
 * 自动剪辑执行期资产门禁（Execution Asset Preflight）。
 *
 * 位置：UnifiedTimelineV2 ──▶【本门禁】──▶ JianYing Adapter。
 * 这是「规划期」与「执行期」之间的唯一硬门禁，非常薄：
 *
 *   - 规划期（agent-run / create_video_plan）允许只依据企业素材索引 metadata
 *     （assetId / recommendedCuts / avoidCuts）做候选搜索，不要求物理文件存在
 *     （见 searchVideoClips 的 requireFileExists:false）。
 *   - 执行期（真正交给 JianYing Adapter 生成剪映草稿之前）必须确认真实源视频存在，
 *     且路径合法、source 范围合法、未命中 avoidCuts。本门禁即承担此职责。
 *
 * 不重新分析视频（不跑 ffprobe / 不解码），只做：
 *   1) 通过 workspace storage config + 资产索引解析每个 video assetRef 的真实绝对路径；
 *   2) 确认文件真实存在；
 *   3) 确认解析路径落在企业 Asset Root 之内（无越界 / 无路径穿越）；
 *   4) 确认 Asset Root 不是测试 fixture 路径；
 *   5) 确认 sourceStart / sourceEnd 合法且在文件时长内（不越界）；
 *   6) 确认未命中该素材的 avoidCuts。
 *
 * 任一失败即返回明确错误码，调用方（JianYing 总装）不得继续调用 JianYing Adapter。
 *
 * 设计边界：
 * - 不在 Timeline 中写入任何绝对企业路径（绝对路径只在门禁 / Adapter 边界运行时解析）。
 * - 不 import Python Worker / pjd_bridge / ResourceMap 内部实现。
 * - 本轮仅做门禁；JianYing Adapter 的真实调用由豆包在 11.3 兼容修复后接入。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPath } from '@/lib/storage';
import { loadVideoAssetIndex, type VideoAsset, type AvoidCut } from '@/lib/agent/video-asset-index';
import type { UnifiedTimelineV2 } from '@/engines/zhiheng-renderer/v2-types';

/** 执行期资产校验失败码（与现有语义对齐，新增 ASSET_AVOID_CUTS）。 */
export type ExecutionAssetErrorCode =
  | 'ASSET_NOT_FOUND'
  | 'ASSET_OUTSIDE_ROOT'
  | 'SOURCE_RANGE_INVALID'
  | 'ASSET_AVOID_CUTS';

/** 执行期资产校验结果。 */
export type ExecutionAssetCheck =
  | { ok: true }
  | {
      ok: false;
      code: ExecutionAssetErrorCode;
      message: string;
      segmentIndex: number;
      assetRef?: string;
    };

/**
 * 判断一个根目录是否疑似「测试 fixture」路径（防御性检查）。
 * 仅用于拦截明显不该出现在生产执行链路里的测试目录；不会对真实企业目录误报。
 */
export function isLikelyFixtureRoot(root: string): boolean {
  const norm = path.resolve(root).replace(/\\/g, '/').toLowerCase();
  const markers = [
    '__fixtures__',
    'fixtures',
    '__tests__',
    'tests',
    'mock',
    'test-',
    'node_modules',
    '.next'
  ];
  return markers.some((m) => norm.includes(`/${m}`) || norm.includes(m));
}

/** 判断 [start,end] 是否主要落在某个 avoidCut 区间内（>50% 重叠即视为命中）。 */
function segmentInAvoidRange(start: number, end: number, avoidCuts: AvoidCut[]): boolean {
  if (!avoidCuts || avoidCuts.length === 0) return false;
  const segDuration = end - start;
  if (segDuration <= 0) return false;
  for (const avoid of avoidCuts) {
    const overlapStart = Math.max(start, avoid.start);
    const overlapEnd = Math.min(end, avoid.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (overlap > segDuration * 0.5) return true;
  }
  return false;
}

/**
 * 执行期资产门禁：遍历最终 Timeline 的 videoTrack，解析真实绝对路径并做合法性校验。
 *
 * @param timeline 已通过 schema 校验的 UnifiedTimelineV2
 * @param opts.assetRoot 显式指定资产根目录（测试可传 fixture 目录）；缺省走 getPath('assets')
 */
export async function validateAutomationExecutionAssets(
  timeline: UnifiedTimelineV2,
  opts?: { assetRoot?: string }
): Promise<ExecutionAssetCheck> {
  const assetRoot = opts?.assetRoot ?? (await getPath('assets'));
  const rootNorm = path.resolve(assetRoot);

  // 4) Asset Root 不能是测试 fixture 路径
  if (isLikelyFixtureRoot(rootNorm)) {
    return {
      ok: false,
      code: 'ASSET_OUTSIDE_ROOT',
      message: `Asset Root 疑似测试 fixture 路径，禁止用于执行期资产解析：${rootNorm}`,
      segmentIndex: -1
    };
  }

  // 加载企业素材索引（资产解析器：workspace storage config + 索引元数据）
  const assets = await loadVideoAssetIndex();
  const byId = new Map<string, VideoAsset>();
  const byRel = new Map<string, VideoAsset>();
  const byFileName = new Map<string, VideoAsset>();
  for (const a of assets) {
    if (a.id) byId.set(a.id, a);
    if (a.relativePath) byRel.set(a.relativePath, a);
    if (a.fileName) byFileName.set(a.fileName, a);
  }

  const segments = timeline.videoTrack ?? [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const refId = seg.assetRef?.assetId;

    // 资产解析：assetId 可能直接是库 assetId，也可能是规划期为保真的 relativePath/fileName 回退
    const asset = (refId && (byId.get(refId) ?? byRel.get(refId) ?? byFileName.get(refId))) || null;
    if (!asset || !asset.relativePath) {
      return {
        ok: false,
        code: 'ASSET_NOT_FOUND',
        message: `videoTrack[${i}] 无法在企业素材索引中解析 assetRef：${refId ?? '(empty)'}`,
        segmentIndex: i,
        assetRef: refId
      };
    }

    const absolute = path.resolve(rootNorm, asset.relativePath);

    // 3) 路径必须落在 Asset Root 之内（无越界 / 无路径穿越）
    const rel = path.relative(rootNorm, absolute);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return {
        ok: false,
        code: 'ASSET_OUTSIDE_ROOT',
        message: `videoTrack[${i}] 解析路径越出 Asset Root：${absolute}`,
        segmentIndex: i,
        assetRef: refId
      };
    }

    // 2) 文件必须真实存在
    try {
      await fs.access(absolute, fs.constants.R_OK);
    } catch {
      return {
        ok: false,
        code: 'ASSET_NOT_FOUND',
        message: `videoTrack[${i}] 真实源视频文件不存在：${absolute}`,
        segmentIndex: i,
        assetRef: refId
      };
    }

    // 5) source 范围合法
    const sourceStart = seg.sourceStart;
    const sourceEnd = seg.sourceStart + seg.duration;
    if (!(sourceStart >= 0 && seg.duration > 0)) {
      return {
        ok: false,
        code: 'SOURCE_RANGE_INVALID',
        message: `videoTrack[${i}] source 范围非法：sourceStart=${sourceStart}, duration=${seg.duration}`,
        segmentIndex: i,
        assetRef: refId
      };
    }
    // 文件未越界：sourceEnd 不得超过素材实际时长（留 0.1s 容差）
    if (
      asset.durationSeconds &&
      asset.durationSeconds > 0 &&
      sourceEnd > asset.durationSeconds + 0.1
    ) {
      return {
        ok: false,
        code: 'SOURCE_RANGE_INVALID',
        message: `videoTrack[${i}] source 范围越出文件时长：[${sourceStart}, ${sourceEnd.toFixed(
          3
        )}] vs 文件时长 ${asset.durationSeconds}s`,
        segmentIndex: i,
        assetRef: refId
      };
    }

    // 6) 未命中 avoidCuts
    if (segmentInAvoidRange(sourceStart, sourceEnd, asset.avoidCuts)) {
      return {
        ok: false,
        code: 'ASSET_AVOID_CUTS',
        message: `videoTrack[${i}] 命中素材 avoidCuts 区间，禁止用于执行`,
        segmentIndex: i,
        assetRef: refId
      };
    }
  }

  return { ok: true };
}
