/**
 * 知衡智企自动剪辑 V1 —— 剪映总装 真源统一后的无头 E2E（主仓库迁移验证）。
 *
 * 目的：证明「主仓库 src/engines/jianying-adapter（已从 pjd-adapter 真源迁移）」的
 *   JianYingAdapter → stdin Contract → python -m zhiheng_jianying_worker → 高版本 PJD fork
 *   真实生成剪映草稿（11.3 结构 + root_meta_info 注册），无需剪映 GUI。
 *
 * 规格（与 PJD-PHASE-D-C-HIGHVER-20260903-1630 回归一致，不重新做创作决策）：
 *   47.55s，18 视频段，全部 sourceAudioMuted=true，1.3x 配音，24 字幕，10 花字，
 *   2 dissolve，BGM 1 + SFX 2。
 *
 * 用法：
 *   $env:ZHIHENG_PJD_ROOT="D:\剪映智剪测试\pyJianYingDraft-fork-v0"
 *   $env:ZHIJING_PYTHON="D:\剪映智剪测试\poc-venv\Scripts\python.exe"
 *   npx tsx scripts/e2e-jianying-v1.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { JianYingAdapter } from '../src/engines/jianying-adapter';
import type { UnifiedTimelineV2 } from '../src/engines/zhiheng-renderer/v2-types';

const ASSET_ROOT = 'D:\\剪映智剪测试\\phase-d-assets';
const DRAFT_ROOT = 'D:\\JianyingPro Drafts';
const OUT_ROOT = 'D:\\剪映智剪测试\\zh-e2e-v1';
const REAL_EDIT_DIR = 'D:\\剪映智剪测试\\real-edit-test\\pjd-real-edit-02-audio';

interface Shot { relativePath: string; targetStart: number; targetEnd: number; duration: number; sourceStart: number; sourceEnd: number; }
interface SubLine { text: string; start: number; end: number; }
interface KwLine { keyword: string; targetStart: number; targetEnd: number; }
interface EditPlanHuazi { keyword: string; start: number; end: number; resource: string; animation: string; posY: number; }

function readJson<T>(p: string): T { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

const HUAZI_STYLE: Record<string, string> = {
  '7495312625169911065': 'huazi.blue_outline',
  '7403676308145802522': 'huazi.gold_outline',
  '7127654126997048607': 'huazi.orange_bold',
  '7403679510702378278': 'huazi.white_red'
};
const ANIM: Record<string, string> = { '弹入': 'bounce_in', '打字机_I': 'typewriter_i', '渐显': 'fade_in' };

function timelineC(): UnifiedTimelineV2 {
  const cuts = readJson<Shot[]>(path.join(REAL_EDIT_DIR, 'source-cuts.json'));
  const subs = readJson<SubLine[]>(path.join(REAL_EDIT_DIR, 'subtitle-timeline.json'));
  const kws = readJson<KwLine[]>(path.join(REAL_EDIT_DIR, 'keyword-timeline.json'));
  const plan = readJson<{ huazi: EditPlanHuazi[] }>(path.join(REAL_EDIT_DIR, 'edit-plan.json'));
  const kwMeta = new Map<string, { resource: string; animation: string }>();
  for (const h of plan.huazi) kwMeta.set(h.keyword, { resource: h.resource, animation: h.animation });

  const videoTrack = cuts.map((c, i) => ({
    assetRef: { type: 'library_asset' as const, assetId: 'video/' + c.relativePath.replace(/\\/g, '/') },
    sourceStart: c.sourceStart,
    duration: c.duration,
    transition: (i === 7 || i === 13 ? 'dissolve' : 'hard_cut') as 'dissolve' | 'hard_cut',
    sourceAudioMuted: true
  }));

  const keywordTrack = kws.map((k, i) => {
    const meta = kwMeta.get(k.keyword);
    return {
      id: 'k' + (i + 1),
      keyword: k.keyword,
      start: k.targetStart,
      duration: k.targetEnd - k.targetStart,
      styleId: meta ? HUAZI_STYLE[meta.resource] ?? 'huazi.blue_outline' : 'huazi.blue_outline',
      animationId: meta ? ANIM[meta.animation] ?? 'fade_in' : 'fade_in',
      layer: 3
    };
  });

  return {
    schemaVersion: 2,
    timelineId: 'zh-e2e-v1',
    taskId: 'zh-e2e-v1',
    outputProfile: { width: 1080, height: 1920, targetFps: 30, videoCodec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p', colorTarget: 'bt709_sdr' },
    videoTrack,
    voiceTrack: [{ assetRef: { type: 'library_asset', assetId: 'audio/voice_1.3x.mp3' }, start: 0.0, duration: 47.55, volume: 1.0 }],
    subtitleTrack: subs.map((s, i) => ({ id: 's' + (i + 1), start: s.start, duration: s.end - s.start, text: s.text, styleId: 'subtitle.default', highlights: [] })),
    titleTrack: [],
    bgmTrack: [{ id: 'b1', assetRef: { type: 'library_asset', assetId: 'audio/bgm_cached_60s.mp3' }, start: 0.0, duration: 47.55, volume: 0.3, loop: false }],
    sfxTrack: [
      { id: 'f1', assetRef: { type: 'library_asset', assetId: 'audio/sfx_typing.wav' }, start: 6.77, duration: 1.2, volume: 1.0 },
      { id: 'f2', assetRef: { type: 'library_asset', assetId: 'audio/sfx_typing.wav' }, start: 44.25, duration: 1.2, volume: 1.0 }
    ],
    keywordTrack
  };
}

async function main(): Promise<number> {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const draftName = `ZHIHENG-E2E-V1-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const fsx = require('node:fs');
  for (const d of ['backup', 'logs', 'output']) fsx.mkdirSync(path.join(OUT_ROOT, d), { recursive: true });

  const adapter = new JianYingAdapter({
    assetRoot: ASSET_ROOT,
    draftRoot: DRAFT_ROOT,
    backupRoot: path.join(OUT_ROOT, 'backup'),
    officialDraftRoot: 'C:\\Users\\Administrator\\AppData\\Local\\JianyingPro\\User Data\\Projects\\com.lveditor.draft',
    logDir: path.join(OUT_ROOT, 'logs'),
    pythonCommand: process.env.ZHIJING_PYTHON ?? 'python',
    timeoutMs: 240_000
  });

  const jobId = 'zh-e2e-v1-' + Date.now();
  console.log('[' + jobId + '] generateDraft draftName=' + draftName);
  const t0 = Date.now();
  const result = await adapter.generateDraft({ draftName, timeline: timelineC(), jobId, options: { backupPlaintext: true, failOnWarning: false } });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  if (!result.ok) {
    console.error('失败:', JSON.stringify(result.error, null, 2));
    return 1;
  }
  console.log('OK draftDir:', result.draftDir);
  console.log('duration:', result.duration, 's  (elapsed ' + elapsed + 's)');
  console.log('tracks:', JSON.stringify(result.tracks));
  console.log('pjdCommit:', result.validationReport.pjdCommit);
  console.log('pjdSource:', JSON.stringify(result.validationReport.pjdSource, null, 2));
  console.log('backupManifest:', result.validationReport.backupManifest);
  console.log('warnings:', JSON.stringify(result.warnings));
  console.log('manualReviewRequired:', result.manualReviewRequired);

  // 结构核验：11.3 draft 目录结构（draft_content.json / draft_info.json / draft_meta_info.json）
  if (result.draftDir) {
    const files = fsx.readdirSync(result.draftDir);
    console.log('draftDir files:', JSON.stringify(files));
    for (const f of ['draft_content.json', 'draft_meta_info.json', 'draft_info.json']) {
      console.log('  has ' + f + ':', fsx.existsSync(path.join(result.draftDir, f)));
    }
    // draft_content.json 轨道摘要（video/voice/subtitle/effect 段数）
    try {
      const content = readJson<Record<string, any>>(path.join(result.draftDir, 'draft_content.json'));
      const tracks = content?.tracks ?? [];
      const summary = tracks.map((tr: any) => ({
        type: tr?.type,
        count: (tr?.segments ?? []).length
      }));
      console.log('draft_content tracks:', JSON.stringify(summary));
      console.log('draft has v11 draft key:', typeof content?.draft === 'object');
    } catch (e) {
      console.log('draft_content 解析跳过:', (e as Error).message);
    }
  }
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
