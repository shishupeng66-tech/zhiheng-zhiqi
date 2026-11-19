import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDb, resolveDbPath } from '@/lib/db';
import { getResolvedLlmConfig } from '@/lib/ai';

/**
 * 桌面 Runtime 环境诊断数据（Environment Doctor 数据源）。
 * 只读检查，不执行写操作；不含任何 API Key / 令牌明文。
 */

const RUNTIME_NOT_REQUIRED = 'NOT_REQUIRED';

interface CheckItem {
  key: string;
  label: string;
  status: 'READY' | 'WARNING' | 'ERROR' | 'NOT_REQUIRED';
  detail: string;
  raw?: unknown;
}

function checkFs(p: string): { exists: boolean; isFile: boolean; size: number } {
  try {
    const s = fs.statSync(p);
    return { exists: true, isFile: s.isFile(), size: s.size };
  } catch {
    return { exists: false, isFile: false, size: 0 };
  }
}

function sha256File(p: string): string {
  try {
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch {
    return '';
  }
}

function dirWriteable(p: string): boolean {
  try {
    fs.mkdirSync(p, { recursive: true });
    const probe = path.join(p, `.probe-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const cwd = process.cwd();
  const items: CheckItem[] = [];

  // ---- App / Next Runtime ----
  items.push({
    key: 'app_runtime',
    label: 'App Runtime',
    status: 'READY',
    detail: `Node ${process.version} (${process.release?.name ?? 'node'})`
  });
  items.push({
    key: 'next_runtime',
    label: 'Next Runtime',
    status: 'READY',
    detail: `NODE_ENV=${process.env.NODE_ENV ?? 'unknown'} NEXT_RUNTIME=${(process as { env: Record<string, string | undefined> }).env.NEXT_RUNTIME ?? 'nodejs'} cwd=${cwd}`
  });

  // ---- Worker（自包含 EXE）----
  const workerExe = process.env.ZHIJING_PYTHON || '';
  const workerFs = workerExe ? checkFs(workerExe) : { exists: false, isFile: false, size: 0 };
  items.push({
    key: 'worker',
    label: 'Worker',
    status: workerFs.exists ? 'READY' : 'ERROR',
    detail: workerFs.exists
      ? `${workerExe} (${workerFs.size} bytes, sha256=${sha256File(workerExe).slice(0, 16)}…)`
      : `ZHIJING_PYTHON 未指向有效文件: ${workerExe || '(空)'}`,
    raw: { path: workerExe, size: workerFs.size }
  });

  // ---- PJD（bundled + 指纹）----
  const pjdRoot = process.env.ZHIHENG_PJD_ROOT || '';
  const pjdFs = pjdRoot ? checkFs(pjdRoot) : { exists: false, isFile: false, size: 0 };
  const pjdFingerprint = process.env.ZHIHENG_PJD_FINGERPRINT || '';
  items.push({
    key: 'pjd',
    label: 'PJD Runtime',
    status: pjdFs.exists && pjdFs.isFile === false && pjdFingerprint ? 'READY' : 'ERROR',
    detail: pjdFs.exists
      ? `bundled 目录 ${pjdRoot}（指纹已固化: ${pjdFingerprint.slice(0, 16)}…，Git/GitHub ${RUNTIME_NOT_REQUIRED}）`
      : `ZHIHENG_PJD_ROOT 无效: ${pjdRoot || '(空)'}`,
    raw: { path: pjdRoot, fingerprint: pjdFingerprint }
  });

  // ---- Database ----
  const dbPath = resolveDbPath();
  const dbFs = checkFs(dbPath);
  let dbOk = false;
  let dbRows = 0;
  try {
    const db = getDb();
    const row = (db as unknown as { get: (q: string) => { n: number } | undefined }).get?.(
      'SELECT 1 AS n'
    );
    dbOk = row?.n === 1;
    const count = (db as unknown as { get: (q: string) => { n: number } | undefined }).get?.(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'"
    );
    dbRows = count?.n ?? 0;
  } catch (err) {
    dbOk = false;
  }
  items.push({
    key: 'database',
    label: 'Database',
    status: dbOk ? 'READY' : 'ERROR',
    detail: dbOk ? `${dbPath}（表数=${dbRows}，WAL SQLite 本地 Runtime）` : `${dbPath} 不可读`,
    raw: { path: dbPath, size: dbFs.size }
  });

  // ---- Editing Skill ----
  const skillDir =
    process.env.ZHIHENG_EDITING_SKILL_DIR || path.join(cwd, 'skills', 'video-editing');
  const skillFs = checkFs(skillDir);
  let skillCount = 0;
  if (skillFs.exists) {
    try {
      skillCount = fs.readdirSync(skillDir).filter((f) => f.endsWith('.json')).length;
    } catch {
      skillCount = 0;
    }
  }
  // 判断当前加载来源：外置 current 目录 vs 安装包内置
  const isExternalCurrent = /Skills[\\/]editing[\\/]current/i.test(skillDir);
  const skillSource = isExternalCurrent ? 'EXTERNAL_CURRENT' : 'BUNDLED_DEFAULT';
  items.push({
    key: 'editing_skill',
    label: 'Editing Skill',
    status: skillFs.exists ? 'READY' : 'ERROR',
    detail: skillFs.exists
      ? `${skillDir}（${skillCount} 个技能定义，${isExternalCurrent ? '外置热更新版' : '内置默认版'}）`
      : `Skill 目录缺失: ${skillDir}`,
    raw: { path: skillDir, source: skillSource, count: skillCount }
  });

  // ---- Jianying ----
  const jyDraft = process.env.ZHIHENG_JIANYING_DRAFT_ROOT || '';
  const jyDraftFs = jyDraft ? checkFs(jyDraft) : { exists: false, isFile: false, size: 0 };
  items.push({
    key: 'jianying_draft',
    label: 'Jianying Draft Path',
    status: jyDraftFs.exists ? 'READY' : 'WARNING',
    detail: jyDraftFs.exists
      ? jyDraft
      : `草稿目录未检测到（${jyDraft || '(空)'}）剪映未启动过可能为空`
  });

  // ---- LLM API ----
  let llmStatus: 'READY' | 'WARNING' | 'ERROR' = 'WARNING';
  let llmDetail = '未配置（首次向导/系统设置中配置 provider_profiles）';
  try {
    const llm = await getResolvedLlmConfig();
    if (llm && llm.baseUrl) {
      llmStatus = 'READY';
      llmDetail = `已配置 provider=${llm.provider} baseUrl=${llm.baseUrl} model=${llm.model}（凭据存于本地 DB，不落日志）`;
    }
  } catch (err) {
    llmDetail = `配置读取失败: ${(err as Error).message}`;
  }
  items.push({ key: 'llm_api', label: 'LLM API', status: llmStatus, detail: llmDetail });

  // ---- TTS API ----
  const ttsUrl = process.env.VOICE_SERVICE_URL || '';
  let ttsOk = false;
  let ttsProvider = 'Doubao / Volcengine';
  try {
    const res = await fetch(`${ttsUrl}/health`, { signal: AbortSignal.timeout(5000) });
    ttsOk = res.ok;
    if (ttsOk) {
      try {
        const body = (await res.json()) as { provider?: string };
        if (body.provider) ttsProvider = body.provider;
      } catch {
        /* ignore */
      }
    }
  } catch {
    ttsOk = false;
  }
  items.push({
    key: 'tts_api',
    label: 'TTS 服务',
    status: ttsOk ? 'READY' : 'WARNING',
    detail: ttsOk
      ? `正常 · 桌面桥接 → 豆包 TTS · 本地桥 ${ttsUrl} · Provider ${ttsProvider}`
      : `TTS 本地桥未就绪 ${ttsUrl}`,
    raw: { bridgeUrl: ttsUrl, provider: ttsProvider, ok: ttsOk }
  });

  // ---- Data Root / 写权限 ----
  const dataRoot = process.env.STORAGE_ROOT || path.join(cwd, 'data');
  const writable = dirWriteable(dataRoot);
  items.push({
    key: 'data_root',
    label: 'Data Root',
    status: writable ? 'READY' : 'ERROR',
    detail: `${dataRoot}（写权限 ${writable ? 'OK' : 'FAILED'}）`
  });

  // ---- 明确 NOT_REQUIRED 项（本架构已剔除）----
  items.push({
    key: 'github',
    label: 'GitHub',
    status: 'NOT_REQUIRED',
    detail: '客户运行时零 GitHub 访问（PJD 指纹固化、Worker 自包含、Next standalone）'
  });
  items.push({
    key: 'git',
    label: 'Git',
    status: 'NOT_REQUIRED',
    detail: '客户运行时零 git 子进程'
  });
  items.push({
    key: 'npm_registry',
    label: 'npm registry',
    status: 'NOT_REQUIRED',
    detail: '客户运行时零 npm/npx'
  });
  items.push({
    key: 'pypi',
    label: 'PyPI',
    status: 'NOT_REQUIRED',
    detail: '客户运行时零 pip/venv（Worker 为自包含 EXE）'
  });
  items.push({
    key: 'ffmpeg',
    label: 'FFmpeg',
    status: 'NOT_REQUIRED',
    detail:
      'Agent-native → Timeline → PJD 主链路不调用 FFmpeg/ffprobe；TTS 时长取自 TTS_NATIVE 时间戳 + MP3 帧解析'
  });

  const overall = items.some((i) => i.status === 'ERROR')
    ? 'ERROR'
    : items.some((i) => i.status === 'WARNING')
      ? 'WARNING'
      : 'READY';

  return NextResponse.json({
    ok: overall === 'READY',
    overall,
    generatedAt: new Date().toISOString(),
    cwd,
    platform: `${os.platform()} ${os.release()} arch=${process.arch}`,
    userHome: os.homedir(),
    env: {
      databasePath: dbPath,
      storageRoot: process.env.STORAGE_ROOT || '',
      worker: workerExe,
      pjdRoot,
      jianyingDraftRoot: jyDraft,
      ttsBaseUrl: ttsUrl,
      voiceDefaultId: process.env.VOICE_DEFAULT_ID || '',
      skillDir
    },
    items
  });
}
