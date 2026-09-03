/**
 * JianYing Adapter —— Python Worker 客户端（Phase C.1）。
 *
 * 方案 A：TS Adapter → JSON Contract（stdin）→ Python CLI Worker → PJD。
 *
 * 协议规则：
 * - 完整 Job JSON 以 UTF-8 从 stdin 输入（不使用 --job/--out 传中文路径）
 * - 固定入口：python -m zhiheng_jianying_worker
 * - stdout 只允许输出单个机器可解析的 Result JSON
 * - 诊断日志写 stderr + 任务日志文件（<logDir>/<jobId>/），不污染 stdout
 * - PJD 根目录环境变量统一为 ZHIHENG_PJD_ROOT（不再使用 ZHIJING_PJD_ROOT）
 * - 超时或异常退出 → 明确的错误码
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErrorCode, JianYingAdapterError } from './errors';
import { parseResult } from './contract';
import type { JianYingJob, JianYingResult, WorkerExitInfo } from './types';
import * as contractTypes from './types';

const WORKER_PYTHON_MODULE = contractTypes.WORKER_PYTHON_MODULE;
const PJD_ROOT_ENV = contractTypes.PJD_ROOT_ENV;

/** Worker 客户端配置 */
export interface WorkerClientOptions {
  /** Python 解释器；默认取环境变量 ZHIJING_PYTHON，否则 'python' */
  pythonCommand?: string;
  /** Worker 包根目录（含 zhiheng_jianying_worker 包）；默认本文件上级 python-worker */
  workerRoot?: string;
  /** PJD 仓库根目录（pyJianYingDraft 的父目录）；默认取环境变量 ZHIHENG_PJD_ROOT */
  pjdRoot?: string;
  /** 超时（毫秒），默认 60000 */
  timeoutMs?: number;
  /** 日志根目录；默认 <os.tmpdir()>/zhiheng-jianying-adapter/logs */
  logDir?: string;
}

/** Worker 调用结果 */
export interface WorkerCallResult {
  result: JianYingResult;
  exit: WorkerExitInfo;
  logFile?: string;
  logWarning?: string;
}

/** 解析 python 命令字符串（可能含空格路径），返回 argv 数组 */
function splitCommand(cmd: string): string[] {
  // 支持简单引号包裹的路径：如 "C:\Python311\python.exe"
  const trimmed = cmd.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return [trimmed.slice(1, -1)];
  }
  return [trimmed];
}

/** 默认日志根目录 */
export function defaultLogDir(): string {
  return path.join(os.tmpdir(), 'zhiheng-jianying-adapter', 'logs');
}

/** TS 侧 Adapter 日志：<logDir>/<jobId>/ts-adapter.log */
function writeAdapterLog(logDir: string, jobId: string, lines: string[]): string | undefined {
  const jobLogDir = path.join(logDir, jobId);
  const logFile = path.join(jobLogDir, 'ts-adapter.log');
  try {
    fs.mkdirSync(jobLogDir, { recursive: true });
    fs.appendFileSync(
      logFile,
      lines.map((l) => `${new Date().toISOString()} ${l}`).join('\n') + '\n',
      'utf-8'
    );
    return logFile;
  } catch (err) {
    // 日志失败不能无声：写入 stderr 并返回错误提示（不阻断任务本身）
    const msg = `[JianYingAdapter] TS 日志写入失败: ${(err as Error).message}`;
    process.stderr.write(msg + '\n');
    return undefined;
  }
}

/**
 * 通过 stdin 调用 Python Worker。
 * 抛 JianYingAdapterError（TIMEOUT / WORKER_PROTOCOL_ERROR / UNKNOWN）。
 */
export function callWorker(
  job: JianYingJob,
  options: WorkerClientOptions = {}
): Promise<WorkerCallResult> {
  const pythonCommand = options.pythonCommand ?? process.env.ZHIJING_PYTHON ?? 'python';
  // Next.js Turbopack 打包下 __dirname 为虚拟 \ROOT\，按 __dirname 找不到 worker 时回退到进程工作目录
  let workerRoot = options.workerRoot ?? '';
  if (!workerRoot) {
    const viaDirname = path.resolve(__dirname, 'python-worker');
    workerRoot = fs.existsSync(viaDirname)
      ? viaDirname
      : path.resolve(process.cwd(), 'src', 'engines', 'jianying-adapter', 'python-worker');
  }
  const pjdRoot = options.pjdRoot ?? process.env[PJD_ROOT_ENV] ?? '';
  const timeoutMs = options.timeoutMs ?? 60_000;
  const logDir = options.logDir ?? defaultLogDir();

  // PYTHONPATH：worker 包根 + PJD 根（PJD 为外部 clone，不提交 Git）
  const pythonpath = [workerRoot, pjdRoot].filter(Boolean).join(path.delimiter);

  const startTs = Date.now();
  const args = splitCommand(pythonCommand).concat(['-m', WORKER_PYTHON_MODULE]);

  return new Promise<WorkerCallResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(args[0], args.slice(1), {
        env: {
          ...process.env,
          PYTHONPATH: pythonpath,
          PYTHONIOENCODING: 'utf-8',
          ZHIJING_JOB_STDIN: '1'
        },
        cwd: workerRoot,
        windowsHide: true
      });
    } catch (err) {
      reject(
        new JianYingAdapterError(ErrorCode.UNKNOWN, `Worker 启动失败: ${(err as Error).message}`)
      );
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    const settle = (result: WorkerCallResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    // 记录日志（含日志写失败提示）后结算
    const complete = (result: WorkerCallResult, lines: string[], warn?: string): void => {
      const lw = writeAdapterLog(logDir, job.jobId, lines);
      settle({
        ...result,
        logFile: result.logFile ?? path.join(logDir, job.jobId, 'ts-adapter.log'),
        logWarning: lw ?? warn
      });
    };

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new JianYingAdapterError(ErrorCode.UNKNOWN, `Worker 进程错误: ${err.message}`));
    });

    child.on('close', (code, _signal) => {
      const stderrTail = stderr.slice(-4000);
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(3);

      // 超时处理
      if (timedOut) {
        const result: JianYingResult = {
          contractVersion: '0.1.0',
          jobId: job.jobId,
          ok: false,
          warnings: [],
          manualReviewRequired: false,
          validationReport: {
            fileCount: 0,
            hasDraftContent: false,
            hasDraftMetaInfo: false,
            hasDraftInfo: false,
            duration: 0,
            passed: false,
            checks: []
          },
          error: {
            code: ErrorCode.TIMEOUT,
            message: `Worker 执行超过 ${timeoutMs}ms，已终止`
          }
        };
        complete({ result, exit: { exitCode: code, timedOut: true, stderrTail } }, [
          `event=worker_timeout jobId=${job.jobId} elapsed=${elapsed}s exit=${String(code)} pjdRoot=${pjdRoot || '<unset>'}`
        ]);
        return;
      }

      // stdout 必须是一个可解析的 Result JSON（契约要求 stdout 纯净）
      const trimmed = stdout.trim();
      const parsed = parseResult(trimmed ? safeJson(trimmed) : null);
      if ('error' in parsed) {
        const result: JianYingResult = {
          contractVersion: '0.1.0',
          jobId: job.jobId,
          ok: false,
          warnings: [],
          manualReviewRequired: false,
          validationReport: {
            fileCount: 0,
            hasDraftContent: false,
            hasDraftMetaInfo: false,
            hasDraftInfo: false,
            duration: 0,
            passed: false,
            checks: []
          },
          error: parsed.error
        };
        complete({ result, exit: { exitCode: code, timedOut: false, stderrTail } }, [
          `event=worker_protocol_error jobId=${job.jobId} elapsed=${elapsed}s code=${parsed.error.code} msg=${parsed.error.message}`
        ]);
        return;
      }

      // 进程非零退出但 stdout 有合法 Result → 以 Result 为准
      const r = parsed.result;
      complete(
        { result: r, exit: { exitCode: code, timedOut: false, stderrTail } },
        [
          `event=worker_completed jobId=${job.jobId} elapsed=${elapsed}s exit=${String(code)} ok=${String(r.ok)} error=${r.error?.code ?? 'none'}`
        ],
        r.manualReviewRequired ? 'worker 标记 manualReviewRequired，请人工复核' : undefined
      );
    });

    // 写入 Job JSON 到 stdin（UTF-8）
    child.stdin.end(JSON.stringify(job), 'utf-8');
  });
}

/** 容错 JSON 解析（stdout 尾部可能带换行/空白） */
function safeJson(trimmed: string): unknown {
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
