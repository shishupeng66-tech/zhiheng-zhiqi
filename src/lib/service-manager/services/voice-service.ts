import type { ServiceDefinition } from '../types';
import { getVoiceServiceUrl } from '@/lib/voice-service/client';

// 桌面版语音能力由主进程内嵌的 TTS 桥提供（端口随机，经 VOICE_SERVICE_URL 注入）；
// 开发版无环境变量时回退 5015 兼容旧的独立 Voice Service。
const voiceBaseUrl = getVoiceServiceUrl();

export const voiceServiceDefinition: ServiceDefinition = {
  id: 'voice',
  displayName: '语音服务',
  capabilityName: '语音能力',
  description: '提供音色试听、TTS 配音生成、声音复刻训练能力',
  icon: 'music',
  health: {
    endpoint: `${voiceBaseUrl}/health`,
    timeoutMs: 5000,
    extractMetrics: async () => {
      try {
        const res = await fetch(`${voiceBaseUrl}/v1/voices`, {
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const data = (await res.json()) as { voices?: Array<unknown> };
          return { voiceCount: (data.voices ?? []).length };
        }
      } catch {
        /* ignore */
      }
      return {};
    }
  },
  start: {
    method: 'ps1-file',
    scriptFile: 'start-voice-service.ps1',
    startTimeoutMs: 60000,
    port: 5015
  },
  developerCommands: {
    manualStart: 'powershell -ExecutionPolicy Bypass -File scripts\\start-voice-service.ps1',
    process: 'uvicorn app.main:app --host 127.0.0.1 --port 5015 --app-dir services\\voice-service'
  }
};
