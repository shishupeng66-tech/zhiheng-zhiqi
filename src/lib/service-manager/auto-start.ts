import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ServiceDefinition, ServiceHealth } from './types';
import { requireService } from './registry';
import './services';

const inFlight = new Map<string, Promise<{ ok: boolean; error?: string }>>();

export async function checkHealth(serviceId: string): Promise<ServiceHealth> {
  const def = requireService(serviceId);
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), def.health.timeoutMs ?? 5000);
    const res = await fetch(def.health.endpoint, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        status: 'offline',
        latencyMs: Date.now() - start,
        error: `health returned HTTP ${res.status}`
      };
    }

    let metrics: Record<string, string | number | boolean | null> | undefined;
    if (def.health.extractMetrics) {
      try {
        const raw = await def.health.extractMetrics(res);
        const cleaned: Record<string, string | number | boolean | null> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (v == null) cleaned[k] = null;
          else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
            cleaned[k] = v;
        }
        if (Object.keys(cleaned).length > 0) metrics = cleaned;
      } catch {
        /* ignore */
      }
    }

    return { status: 'online', latencyMs: Date.now() - start, metrics };
  } catch (error) {
    return {
      status: 'offline',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error)
    };
  }
}

async function waitForReady(
  def: ServiceDefinition,
  timeoutMs: number
): Promise<{ ok: boolean; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const h = await checkHealth(def.id);
    if (h.status === 'online') return { ok: true };
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, error: `启动超时（${Math.round(timeoutMs / 1000)}秒）` };
}

function resolveScriptPath(scriptFile: string): string {
  return path.resolve(process.cwd(), 'scripts', scriptFile);
}

function launchPs1Background(scriptFile: string): { ok: boolean; error?: string } {
  const scriptPath = resolveScriptPath(scriptFile);
  if (!existsSync(scriptPath)) {
    return { ok: false, error: `脚本不存在：${scriptPath}` };
  }
  try {
    const psArgs = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath.replace(/'/g, "''")}' -WindowStyle Hidden -RedirectStandardOutput '${path
        .resolve(process.cwd(), 'logs', 'voice-service.out.log')
        .replace(/'/g, "''")}' -RedirectStandardError '${path
        .resolve(process.cwd(), 'logs', 'voice-service.err.log')
        .replace(/'/g, "''")}'`
    ];
    const child = spawn('powershell.exe', psArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 检查端口是否被占用（防止重复启动）。
 * 当 health 接口失败但端口已 listen，说明进程在启动中，不应再 spawn 第二个 uvicorn。
 */
async function isPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  const { createConnection } = await import('node:net');
  return new Promise((resolve) => {
    const socket = createConnection({ port, host, timeout: 1000 }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function recoverService(serviceId: string): Promise<{
  ok: boolean;
  error?: string;
  launched: boolean;
  status: ServiceHealth['status'];
}> {
  // 首先确认当前状态
  let current = await checkHealth(serviceId);
  if (current.status === 'online') {
    return { ok: true, launched: false, status: 'online' };
  }

  // 内存去重：相同 serviceId 同时只启动一次
  const existing = inFlight.get(serviceId);
  if (existing) {
    const result = await existing;
    const after = await checkHealth(serviceId);
    return {
      ok: after.status === 'online',
      error: result.error,
      launched: false,
      status: after.status
    };
  }

  const def = requireService(serviceId);
  const timeoutMs = def.start.startTimeoutMs ?? 60000;

  const task = (async () => {
    // 端口占用检测：端口已 listen 但 health 还没返回（uvicorn 正在启动中）
    // 此时不再重复 spawn，直接等待 ready
    if (def.start.port) {
      const inUse = await isPortInUse(def.start.port).catch(() => false);
      if (!inUse) {
        const launched = launchPs1Background(def.start.scriptFile);
        if (!launched.ok) {
          return { ok: false, error: launched.error };
        }
      }
    } else {
      const launched = launchPs1Background(def.start.scriptFile);
      if (!launched.ok) {
        return { ok: false, error: launched.error };
      }
    }

    return await waitForReady(def, timeoutMs);
  })();

  inFlight.set(serviceId, task);
  task.finally(() => inFlight.delete(serviceId));
  const result = await task;

  const after = await checkHealth(serviceId);
  return {
    ok: after.status === 'online',
    error: result.error,
    launched: true,
    status: after.status
  };
}

/**
 * Next.js 启动时调用：异步不阻塞，失败静默。
 * 页面层还会再通过 /health API 兜底一次。
 */
export function runAutoStartCheck(serviceId: string): void {
  void (async () => {
    try {
      // 先注册所有服务
      require('./services');
      const h = await checkHealth(serviceId);
      if (h.status === 'online') return;
      await recoverService(serviceId);
    } catch {
      /* ignore */
    }
  })();
}

export type DeveloperCommands = {
  manualStart: string;
  process?: string;
};

export function getDeveloperCommands(serviceId: string): DeveloperCommands {
  const def = requireService(serviceId);
  return def.developerCommands;
}
