import { testLlm, type LlmProviderConfig } from '@/lib/ai';
import { getVideoEngineStatus } from './video-engine';

/** 连接测试统一返回结构：绝不携带任何 secret。 */
export interface TestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

export async function testLlmConnection(config: LlmProviderConfig): Promise<TestResult> {
  return testLlm(config);
}

/** 语音服务：探测本地 Voice Service /health 可达性（不校验密钥本身）。 */
export async function testVoiceConnection(): Promise<TestResult> {
  const started = Date.now();
  const base = process.env.VOICE_SERVICE_URL || 'http://127.0.0.1:5015';
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return {
        ok: false,
        message: `Voice Service 返回 ${res.status}`,
        latencyMs: Date.now() - started
      };
    }
    const data = (await res.json().catch(() => ({}))) as { provider?: string };
    return {
      ok: true,
      message: `Voice Service 正常（provider=${data?.provider ?? 'unknown'}）`,
      latencyMs: Date.now() - started
    };
  } catch (e) {
    return {
      ok: false,
      message: `无法连接 Voice Service：${e instanceof Error ? e.message : '未知错误'}`,
      latencyMs: Date.now() - started
    };
  }
}

/** 素材服务：按来源对第三方 API 做最小化连通探测。 */
export async function testMaterialConnection(
  provider: string,
  apiKey: string
): Promise<TestResult> {
  const started = Date.now();
  const endpoints: Record<string, { url: string; header: (k: string) => Record<string, string> }> =
    {
      pexels: {
        url: 'https://api.pexels.com/v1/search?query=test&per_page=1',
        header: (k) => ({ Authorization: k })
      },
      pixabay: {
        url: `https://pixabay.com/api/?key=${apiKey || ''}&q=test&per_page=1`,
        header: () => ({})
      },
      coverr: {
        url: 'https://api.coverr.co/videos?page=1',
        header: (k) => ({ Authorization: `Bearer ${k}` })
      }
    };
  const ep = endpoints[provider];
  if (!ep) {
    return { ok: false, message: `不支持的素材来源：${provider}`, latencyMs: Date.now() - started };
  }
  try {
    const res = await fetch(ep.url, {
      headers: ep.header(apiKey),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      return {
        ok: true,
        message: `${provider} 连接成功（${res.status}）`,
        latencyMs: Date.now() - started
      };
    }
    return {
      ok: false,
      message: `${provider} 返回 ${res.status}`,
      latencyMs: Date.now() - started
    };
  } catch (e) {
    return {
      ok: false,
      message: `${provider} 连接失败：${e instanceof Error ? e.message : '未知错误'}`,
      latencyMs: Date.now() - started
    };
  }
}

/** 视频引擎：依据 CLI / Python 探测结果判断可用性。 */
export async function testVideoEngineConnection(): Promise<TestResult> {
  const started = Date.now();
  const s = await getVideoEngineStatus();
  const ok = s.cliExists && s.pythonAvailable;
  const message = ok
    ? `引擎就绪（${s.pythonVersion ?? 'python'}，CLI 存在）`
    : `引擎不可用：${s.notes.join('；') || 'CLI 或 Python 缺失'}`;
  return { ok, message, latencyMs: Date.now() - started };
}
