/**
 * 知衡智企自动剪辑 V1 —— 失败路径测试（section 26）。
 *
 * 覆盖：
 *  A) assetRoot 不存在 / 不是目录 → Adapter 返回 ok:false（PATH_OUTSIDE_ALLOWED_ROOT / 目录缺失）
 *  B) assetRoot 合法但 timeline 引用不存在的视频 → Worker 返回 ok:false（资源缺失）
 *  C) 合法全量 timeline → ok:true（对照基线）
 *
 * 结论判定：A/B 均为 ok:false（任务侧会回写 agentStage:failed + status:failed，可重试）。
 */
import path from 'node:path';
import fs from 'node:fs';
import { JianYingAdapter } from '../src/engines/jianying-adapter';
import type { UnifiedTimelineV2 } from '../src/engines/zhiheng-renderer/v2-types';

const ASSET_ROOT = 'D:\\剪映智剪测试\\phase-d-assets';
const DRAFT_ROOT = 'D:\\JianyingPro Drafts';
const OUT_ROOT = 'D:\\剪映智剪测试\\zh-e2e-v1\\failure';

interface Shot { relativePath: string; duration: number; sourceStart: number; sourceEnd: number; }

function readJson<T>(p: string): T { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function baseTimeline(assetId: string): UnifiedTimelineV2 {
  const cuts = readJson<Shot[]>(path.join('D:/剪映智剪测试/real-edit-test/pjd-real-edit-02-audio', 'source-cuts.json'));
  return {
    schemaVersion: 2,
    timelineId: 'zh-fail-path',
    taskId: 'zh-fail-path',
    outputProfile: { width: 1080, height: 1920, targetFps: 30, videoCodec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p', colorTarget: 'bt709_sdr' },
    videoTrack: [{
      assetRef: { type: 'library_asset' as const, assetId },
      sourceStart: cuts[0].sourceStart,
      duration: Math.max(0.1, cuts[0].duration),
      transition: 'hard_cut' as const,
      sourceAudioMuted: true
    }],
    voiceTrack: [{ assetRef: { type: 'library_asset', assetId: 'audio/voice_1.3x.mp3' }, start: 0, duration: Math.max(0.1, cuts[0].duration), volume: 1.0 }],
    subtitleTrack: [],
    titleTrack: [],
    keywordTrack: []
  };
}

async function run(name: string, assetRoot: string, assetId: string): Promise<number> {
  const adapter = new JianYingAdapter({
    assetRoot,
    draftRoot: DRAFT_ROOT,
    backupRoot: path.join(OUT_ROOT, 'backup'),
    officialDraftRoot: 'C:\\Users\\Administrator\\AppData\\Local\\JianyingPro\\User Data\\Projects\\com.lveditor.draft',
    logDir: path.join(OUT_ROOT, 'logs'),
    pythonCommand: process.env.ZHIJING_PYTHON ?? 'python',
    timeoutMs: 120_000
  });
  const result = await adapter.generateDraft({
    draftName: `ZHIHENG-FAIL-${name}-${Date.now()}`,
    timeline: baseTimeline(assetId),
    jobId: `fail-${name}-${Date.now()}`,
    options: { backupPlaintext: true, failOnWarning: false }
  });
  console.log(`[${name}] ok=${result.ok} code=${result.error?.code ?? '-'} msg=${(result.error?.message ?? '').slice(0, 120)}`);
  return result.ok ? 0 : 1;
}

async function main(): Promise<number> {
  for (const d of ['backup', 'logs']) fs.mkdirSync(path.join(OUT_ROOT, d), { recursive: true });

  // A) assetRoot 不存在 → 期望失败（PATH_OUTSIDE_ALLOWED_ROOT）
  const a = await run('bad-asset-root', 'D:\\zh-nonexistent-root-2026', 'video/05-会议沟通/02_客户接待_1.mp4');

  // B) assetRoot 合法但素材不存在 → 期望失败（RESOURCE_MISSING）
  const b = await run('missing-asset', ASSET_ROOT, 'video/不存在/not-exist.mp4');

  // C) 对照基线：合法 assetId → 期望成功
  const c = await run('baseline-ok', ASSET_ROOT, 'video/05-会议沟通/02_客户接待_1.mp4');

  console.log('A(bad assetRoot) failed-as-expected:', a === 1);
  console.log('B(missing asset) failed-as-expected:', b === 1);
  console.log('C(baseline) ok-as-expected:', c === 0);
  return a === 1 && b === 1 && c === 0 ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
