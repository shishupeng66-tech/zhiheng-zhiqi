/**
 * Calibration Worker Runner —— 直接调用 Python Worker 生成草稿
 *
 * 不经过 Adapter 全链路，直接构造 job JSON → stdin → Worker → stdout result。
 * 用于 Calibration Draft 生成（不改变 Worker 生产逻辑）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WORKER_ROOT = path.join(process.cwd(), 'src', 'engines', 'jianying-adapter', 'python-worker');
const PJD_ROOT = 'D:/剪映智剪测试/pyJianYingDraft-fork-v0';
const PYTHON = 'D:/剪映智剪测试/poc-venv/Scripts/python.exe';

export interface WorkerRunResult {
  ok: boolean;
  draftDir?: string;
  duration?: number;
  tracks?: Array<{ type: string; count: number }>;
  warnings?: string[];
  error?: string;
}

export async function callWorkerDirect(jobJsonPath: string): Promise<WorkerRunResult> {
  const jobContent = fs.readFileSync(jobJsonPath, 'utf8');

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ZHIHENG_PJD_ROOT: PJD_ROOT,
      PYTHONPATH: `${WORKER_ROOT};${PJD_ROOT}`,
      PYTHONIOENCODING: 'utf-8'
    };

    const proc = spawn(PYTHON, ['-m', 'zhiheng_jianying_worker'], {
      env,
      cwd: WORKER_ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, 120000); // 2分钟超时

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, error: 'Worker timeout (120s)' });
        return;
      }

      // 从 stdout 提取最后一个 JSON 对象
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        resolve({
          ok: false,
          error: `No JSON in stdout. code=${code}. stderr=${stderr.slice(-500)}`
        });
        return;
      }

      try {
        const result = JSON.parse(jsonMatch[0]);
        if (result.ok) {
          resolve({
            ok: true,
            draftDir: result.draftDir,
            duration: result.duration,
            tracks: result.tracks,
            warnings: result.warnings
          });
        } else {
          resolve({
            ok: false,
            error: result.error?.message || `Worker error: ${JSON.stringify(result.error)}`,
            warnings: result.warnings
          });
        }
      } catch (e) {
        resolve({ ok: false, error: `JSON parse failed: ${(e as Error).message}. stdout=${stdout.slice(-300)}` });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Spawn error: ${err.message}` });
    });

    // 写入 job JSON 到 stdin（buffer 方式，避免编码问题）
    proc.stdin.write(Buffer.from(jobContent, 'utf-8'));
    proc.stdin.end();
  });
}
