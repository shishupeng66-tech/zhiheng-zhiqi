'use client';

import * as React from 'react';

export type VoiceCapabilityStatus = 'checking' | 'online' | 'recovering' | 'offline' | 'error';

export type VoiceCapabilityState = {
  status: VoiceCapabilityStatus;
  latencyMs: number | null;
  metrics: Record<string, string | number | boolean | null>;
  error: string | null;
  recover: () => Promise<void>;
};

const SESSION_KEY = 'voice-auto-recovered';

/**
 * 语音能力状态 Hook：
 * - 页面挂载时自动检查
 * - offline 时自动尝试恢复一次（sessionStorage 去重，每个浏览器会话只自动尝试 1 次）
 * - 自动恢复失败后暴露 recover() 给手动按钮
 */
export function useVoiceCapability(): VoiceCapabilityState {
  const [status, setStatus] = React.useState<VoiceCapabilityStatus>('checking');
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);
  const [metrics, setMetrics] = React.useState<Record<string, string | number | boolean | null>>(
    {}
  );
  const [error, setError] = React.useState<string | null>(null);
  const recoveringRef = React.useRef(false);

  const check = React.useCallback(async () => {
    try {
      const res = await fetch('/api/services/voice/health', { cache: 'no-store' });
      if (!res.ok) {
        setStatus('offline');
        setError('服务不可用');
        return;
      }
      const data = (await res.json()) as {
        status: 'online' | 'offline' | 'starting' | 'error';
        latencyMs: number | null;
        metrics?: Record<string, string | number | boolean | null>;
        error?: string | null;
      };
      setLatencyMs(data.latencyMs);
      setMetrics(data.metrics ?? {});
      if (data.status === 'online') {
        setStatus('online');
        setError(null);
      } else {
        setStatus('offline');
        setError(data.error ?? '语音能力暂不可用');
      }
    } catch (e) {
      setStatus('offline');
      setError(e instanceof Error ? e.message : '网络异常');
    }
  }, []);

  const recover = React.useCallback(async () => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    setStatus('recovering');
    setError(null);
    try {
      const res = await fetch('/api/services/voice/recover', {
        method: 'POST',
        cache: 'no-store'
      });
      const data = (await res.json()) as {
        ok: boolean;
        status: string;
        error?: string;
        latencyMs?: number | null;
        metrics?: Record<string, string | number | boolean | null>;
      };
      if (data.ok && data.status === 'online') {
        setStatus('online');
        setLatencyMs(data.latencyMs ?? null);
        setMetrics(data.metrics ?? {});
        setError(null);
        try {
          sessionStorage.setItem(SESSION_KEY, '1');
        } catch {
          /* ignore */
        }
      } else {
        setStatus('error');
        setError(data.error ?? '恢复失败');
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : '恢复失败');
    } finally {
      recoveringRef.current = false;
    }
  }, []);

  // 挂载时检查 + 自动恢复
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await check();
      if (cancelled) return;
      // 自动恢复：每个浏览器会话只尝试一次
      let autoRecovered = '0';
      try {
        autoRecovered = sessionStorage.getItem(SESSION_KEY) ?? '0';
      } catch {
        /* ignore */
      }
      if (autoRecovered !== '1') {
        setStatus((prev) => (prev === 'offline' ? 'recovering' : prev));
        await recover();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, latencyMs, metrics, error, recover };
}
