import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDb, resolveDbPath } from '@/lib/db';
import { getResolvedLlmConfig, testLlm } from '@/lib/ai';
import { validateTimeline } from '@/engines/zhiheng-renderer/validator';

const execFileAsync = promisify(execFile);

interface TestResult {
  key: string;
  label: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

async function testWorkerSelfCheck(): Promise<TestResult> {
  const workerExe = process.env.ZHIJING_PYTHON || '';
  if (!workerExe || !fs.existsSync(workerExe)) {
    return {
      key: 'worker',
      label: 'Worker 启动',
      status: 'FAIL',
      detail: `Worker EXE 不存在: ${workerExe || '(空)'}`
    };
  }
  try {
    const { stdout } = await execFileAsync(workerExe, [], {
      env: {
        ...process.env,
        ZHIHENG_WORKER_SELFTEST: '1',
        ZHIHENG_WORKER_MODE: 'desktop',
        ZHIHENG_PJD_ROOT: process.env.ZHIHENG_PJD_ROOT || '',
        ZHIHENG_PJD_FINGERPRINT: process.env.ZHIHENG_PJD_FINGERPRINT || ''
      },
      timeout: 60000,
      windowsHide: true
    });
    const out = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || '';
    const parsed = JSON.parse(out);
    if (parsed.ok) {
      const pjd = parsed.pjd || {};
      return {
        key: 'worker',
        label: 'Worker 启动 + PJD 校验',
        status: 'PASS',
        detail: `Worker EXE 自检 OK；PJD ${pjd.actualCommit?.slice(0, 8) ?? '?'}（${pjd.verificationMode ?? '?'}）module=${pjd.moduleFile ?? ''}`
      };
    }
    return {
      key: 'worker',
      label: 'Worker 启动 + PJD 校验',
      status: 'FAIL',
      detail: JSON.stringify(parsed.error || out)
    };
  } catch (err) {
    return {
      key: 'worker',
      label: 'Worker 启动 + PJD 校验',
      status: 'FAIL',
      detail: (err as Error).message
    };
  }
}

async function testDbReadWrite(): Promise<TestResult> {
  try {
    const db = getDb();
    const sqlite = (db as unknown as { $client?: unknown }).$client ?? null;
    const probe = path.join(path.dirname(resolveDbPath()), `.probe-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    const size = fs.statSync(probe).size;
    fs.unlinkSync(probe);
    const row = (sqlite as { prepare?: (q: string) => { get: () => { n: number } } } | null)
      ?.prepare?.('SELECT 1 AS n')
      ?.get();
    return {
      key: 'database',
      label: 'DB 读/写',
      status: row?.n === 1 && size > 0 ? 'PASS' : 'FAIL',
      detail: `SQLite SELECT 1=${row?.n} 写探针=${size}B @ ${resolveDbPath()}`
    };
  } catch (err) {
    return { key: 'database', label: 'DB 读/写', status: 'FAIL', detail: (err as Error).message };
  }
}

async function testJianyingDetection(): Promise<TestResult> {
  const candidates = [
    'D:\\JianyingPro',
    'C:\\Program Files\\JianyingPro',
    'C:\\Program Files (x86)\\JianyingPro'
  ];
  const found = candidates.find((c) => fs.existsSync(c));
  const draftRoot = process.env.ZHIHENG_JIANYING_DRAFT_ROOT || '';
  if (found || draftRoot) {
    return {
      key: 'jianying',
      label: '剪映检测',
      status: 'PASS',
      detail: `安装=${found || '(未扫描到，使用环境配置)'} 草稿=${draftRoot || '(待剪映首次启动后生成)'}`
    };
  }
  return {
    key: 'jianying',
    label: '剪映检测',
    status: 'WARN',
    detail: '未检测到剪映安装目录（请确认剪映已安装）'
  };
}

async function testLlmConnectivity(): Promise<TestResult> {
  try {
    const cfg = await getResolvedLlmConfig();
    if (!cfg) {
      return {
        key: 'llm',
        label: 'LLM API 连通',
        status: 'WARN',
        detail: '未配置 LLM（首次向导 / 系统设置中配置 provider_profiles 后重试）'
      };
    }
    const result = await testLlm(cfg);
    const ok = result && result.ok;
    return {
      key: 'llm',
      label: 'LLM API 连通',
      status: ok ? 'PASS' : 'WARN',
      detail: ok ? `模型 ${cfg.model} 响应正常` : `LLM 测试未通过: ${JSON.stringify(result)}`
    };
  } catch (err) {
    return {
      key: 'llm',
      label: 'LLM API 连通',
      status: 'WARN',
      detail: `LLM 调用失败: ${(err as Error).message}`
    };
  }
}

async function testTtsRequest(): Promise<TestResult> {
  const ttsUrl = process.env.VOICE_SERVICE_URL || '';
  if (!ttsUrl)
    return { key: 'tts', label: 'TTS 短请求', status: 'FAIL', detail: 'VOICE_SERVICE_URL 未设置' };
  try {
    const res = await fetch(`${ttsUrl}/v1/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: '知衡智企桌面运行时自检。',
        voice_id: 'auto',
        speed: 1.0,
        volume: 1.0
      }),
      signal: AbortSignal.timeout(60000)
    });
    const data = (await res.json()) as {
      duration?: number;
      timing?: { source?: string; words?: unknown[] };
      detail?: string;
    };
    if (res.ok && data.duration && data.duration > 0) {
      const native =
        data.timing && data.timing.source === 'TTS_NATIVE' && Array.isArray(data.timing.words)
          ? data.timing.words.length
          : 0;
      return {
        key: 'tts',
        label: 'TTS 短请求',
        status: 'PASS',
        detail: `合成 ${data.duration}s，TTS_NATIVE 词=${native}`
      };
    }
    return {
      key: 'tts',
      label: 'TTS 短请求',
      status: 'FAIL',
      detail: data.detail || `HTTP ${res.status}`
    };
  } catch (err) {
    return { key: 'tts', label: 'TTS 短请求', status: 'FAIL', detail: (err as Error).message };
  }
}

function testTimelineValidator(): TestResult {
  try {
    const timeline = {
      durationMs: 10000,
      videoTrack: [] as unknown[],
      subtitleTrack: [] as unknown[],
      audioTrack: [] as unknown[],
      bgmTrack: [] as unknown[],
      titleTrack: [] as unknown[],
      textOverlayTrack: [] as unknown[],
      stickerTrack: [] as unknown[],
      packagingSfx: [] as unknown[],
      keywordTrack: [] as unknown[],
      output: { resolution: { width: 1920, height: 1080 }, fps: 25 }
    };
    const result = validateTimeline(timeline as never);
    return {
      key: 'validator',
      label: 'Timeline Validator smoke',
      status: 'PASS',
      detail: `Validator 执行完成 valid=${result.valid} errors=${(result.errors ?? []).length} warnings=${(result.warnings ?? []).length}`
    };
  } catch (err) {
    return {
      key: 'validator',
      label: 'Timeline Validator smoke',
      status: 'FAIL',
      detail: (err as Error).message
    };
  }
}

export async function POST() {
  const results: TestResult[] = [];
  results.push({
    key: 'electron',
    label: 'Electron Runtime',
    status:
      process.env.ELECTRON_RUN_AS_NODE === '1' || process.env.ZHIHENG_DESKTOP === '1'
        ? 'PASS'
        : 'WARN',
    detail: `Node ${process.version}（${process.env.ELECTRON_RUN_AS_NODE === '1' ? 'Electron 内置 Node' : '独立 Node'}）`
  });
  results.push({
    key: 'next_ui',
    label: 'Next Production UI',
    status: process.env.NODE_ENV === 'production' ? 'PASS' : 'FAIL',
    detail: `NODE_ENV=${process.env.NODE_ENV} cwd=${process.cwd()}`
  });
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/desktop/health`, {
      signal: AbortSignal.timeout(5000)
    });
    const body = (await res.json()) as { ok?: boolean };
    results.push({
      key: 'backend',
      label: '本地后端健康',
      status: res.ok && body.ok ? 'PASS' : 'FAIL',
      detail: `HTTP ${res.status}`
    });
  } catch (err) {
    results.push({
      key: 'backend',
      label: '本地后端健康',
      status: 'FAIL',
      detail: (err as Error).message
    });
  }
  results.push(await testWorkerSelfCheck());
  results.push(await testDbReadWrite());
  results.push(await testJianyingDetection());
  results.push(await testLlmConnectivity());
  results.push(await testTtsRequest());
  results.push(testTimelineValidator());

  const overall = results.some((r) => r.status === 'FAIL')
    ? 'FAIL'
    : results.some((r) => r.status === 'WARN')
      ? 'WARN'
      : 'PASS';
  return NextResponse.json({
    overall,
    ready: overall === 'PASS',
    ts: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()} arch=${process.arch}`,
    results
  });
}
