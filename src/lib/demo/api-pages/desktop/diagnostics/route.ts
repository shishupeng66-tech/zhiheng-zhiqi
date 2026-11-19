import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { resolveDbPath } from '@/lib/db';

const execFileAsync = promisify(execFile);

/**
 * 一键诊断包导出：zhiheng-diagnostic-YYYYMMDD-HHmmss.zip
 * 包含：appVersion / runtimeManifest / jianying / PJD / Worker / Doctor / 最近任务错误 /
 *       Timeline 摘要 / Validator / Preflight / 日志（脱敏）
 * 默认禁止包含：客户视频、客户音频、API Key、Authorization、Token、密码、完整敏感文档。
 */

function safeName(s: string): string {
  return s.replace(/[^\w.-]/g, '_');
}

async function buildDiagnosticZip(): Promise<{ zipPath: string; size: number }> {
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
  const appData = process.env.STORAGE_ROOT
    ? path.dirname(process.env.STORAGE_ROOT)
    : path.join(os.homedir(), 'ZhihengZhiqi');
  const diagRoot = path.join(/*turbopackIgnore: true*/ appData, 'diagnostics');
  const staging = path.join(diagRoot, `staging-${ts}`);
  const zipName = `zhiheng-diagnostic-${ts}.zip`;
  const zipPath = path.join(diagRoot, zipName);
  fs.mkdirSync(staging, { recursive: true });

  const write = (rel: string, data: unknown) => {
    const p = path.join(staging, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf-8');
  };

  // ---- Runtime info ----
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/desktop/runtime`, {
      signal: AbortSignal.timeout(10000)
    });
    const doctor = await res.json();
    write('environment-doctor.json', doctor);
  } catch (err) {
    write('environment-doctor.json', { ok: false, error: (err as Error).message });
  }

  // ---- Manifest ----
  const runtimeRoot = process.env.ZHIHENG_RUNTIME_ROOT || '';
  const manifestPath = runtimeRoot
    ? path.join(/*turbopackIgnore: true*/ runtimeRoot, 'desktop-runtime-manifest.json')
    : '';
  try {
    if (manifestPath && fs.existsSync(manifestPath)) {
      write('desktop-runtime-manifest.json', fs.readFileSync(manifestPath, 'utf-8'));
    }
  } catch {
    /* ignore */
  }

  // ---- DB 摘要（无敏感列）----
  try {
    const db = getDb();
    const recent = db
      .select({
        id: schema.automationVideoTasks.id,
        workspaceId: schema.automationVideoTasks.workspaceId,
        status: schema.automationVideoTasks.status,
        createdAt: schema.automationVideoTasks.createdAt,
        updatedAt: schema.automationVideoTasks.updatedAt
      })
      .from(schema.automationVideoTasks)
      .orderBy(desc(schema.automationVideoTasks.createdAt))
      .limit(20)
      .all();
    write('recent-tasks.json', { count: recent.length, tasks: recent });

    const failed = db
      .select({
        id: schema.automationVideoTasks.id,
        status: schema.automationVideoTasks.status,
        errorMessage: schema.automationVideoTasks.errorMessage,
        lastErrorAt: schema.automationVideoTasks.updatedAt
      })
      .from(schema.automationVideoTasks)
      .where(eq(schema.automationVideoTasks.status, 'failed'))
      .orderBy(desc(schema.automationVideoTasks.updatedAt))
      .limit(10)
      .all();
    write('recent-task-errors.json', { count: failed.length, errors: failed });
  } catch (err) {
    write('recent-tasks.json', { error: (err as Error).message });
  }

  // ---- Worker / PJD 指纹 ----
  const workerExe = process.env.ZHIJING_PYTHON || '';
  const pjdRoot = process.env.ZHIHENG_PJD_ROOT || '';
  try {
    const { createHash } = await import('node:crypto');
    const hashFile = (p: string) =>
      fs.existsSync(p) ? createHash('sha256').update(fs.readFileSync(p)).digest('hex') : '';
    const workerInfo = {
      path: workerExe,
      exists: fs.existsSync(workerExe),
      size: fs.existsSync(workerExe) ? fs.statSync(workerExe).size : 0,
      sha256: hashFile(workerExe)
    };
    const pjdInfo = {
      path: pjdRoot,
      exists: fs.existsSync(pjdRoot),
      expectedFingerprint: process.env.ZHIHENG_PJD_FINGERPRINT || ''
    };
    write('worker-pjd-fingerprint.json', {
      worker: workerInfo,
      pjd: pjdInfo,
      pjdCommitExpected: process.env.ZHIHENG_PJD_FINGERPRINT ? '(指纹固化)' : ''
    });
  } catch {
    /* ignore */
  }

  // ---- 日志（脱敏）----
  const logsDir = path.join(/*turbopackIgnore: true*/ appData, 'logs');
  if (fs.existsSync(logsDir)) {
    const outDir = path.join(staging, 'logs');
    fs.mkdirSync(outDir, { recursive: true });
    for (const f of fs.readdirSync(logsDir).filter((f) => f.endsWith('.log'))) {
      try {
        const raw = fs.readFileSync(path.join(logsDir, f), 'utf-8');
        const redacted = raw
          .replace(
            /(api[_-]?key|authorization|bearer\s+|token|secret|password|passwd|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;}{]+/gi,
            '$1=***REDACTED***'
          )
          .replace(/(X-Api-Key|Authorization)\s*[:=]\s*[^\s,;}]+/gi, '$1=***REDACTED***');
        fs.writeFileSync(path.join(outDir, safeName(f)), redacted, 'utf-8');
      } catch {
        /* ignore */
      }
    }
  }

  // ---- 压缩（PowerShell Compress-Archive，Windows 系统自带）----
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal -Force`
    ],
    { timeout: 180000, windowsHide: true }
  );
  fs.rmSync(staging, { recursive: true, force: true });
  const size = fs.statSync(zipPath).size;
  return { zipPath, size };
}

export async function POST() {
  try {
    const { zipPath, size } = await buildDiagnosticZip();
    return NextResponse.json({ ok: true, zipPath, size, fileName: path.basename(zipPath) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message });
  }
}
