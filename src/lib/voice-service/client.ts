export type VoiceServiceVoice = {
  id: string;
  name: string;
  gender?: string;
  language?: string;
  description?: string;
  previewUrl?: string;
};

type VoiceServiceRequest = {
  text: string;
  voiceId: string;
  speed: number;
  volume?: number;
  emotion?: string;
  style?: string;
};

type VoiceServiceResponse = {
  audio_path: string;
  duration: number;
  format: string;
  mime_type: string;
  provider: string;
  provider_voice_id: string;
};

export function getVoiceServiceUrl() {
  return process.env.VOICE_SERVICE_URL || 'http://127.0.0.1:5015';
}

export async function generateVoiceAudio(input: VoiceServiceRequest) {
  const response = await fetch(`${getVoiceServiceUrl()}/v1/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: input.text,
      voice_id: input.voiceId,
      speed: input.speed,
      volume: input.volume ?? 1,
      emotion: input.emotion || 'neutral',
      style: input.style || 'business'
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Voice Service failed: HTTP ${response.status} ${detail}`);
  }

  return (await response.json()) as VoiceServiceResponse;
}

export async function fetchVoices(): Promise<VoiceServiceVoice[]> {
  const response = await fetch(`${getVoiceServiceUrl()}/v1/voices`);
  if (!response.ok) {
    throw new Error(`Voice Service voices failed: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { voices?: VoiceServiceVoice[] };
  return data.voices ?? [];
}

// ============================================================================
// Phase 3-A：声音复刻 —— /v1/voice/clone/train 同步调用
// ============================================================================

export type VoiceCloneTrainInput = {
  owner_id: string;
  workspace_id: string;
  display_name: string;
  language?: string;
  text: string;
  sample_format: string;
  sample_path: string;
  demo_text?: string;
  enable_audio_denoise?: boolean;
  disable_volume_normalization?: boolean;
};

export type VoiceCloneTrainOutput = {
  custom_speaker_id: string;
  status: 'ready' | 'failed' | 'training';
  demo_audio_path: string | null;
  provider_status: number;
  retry_count: number;
  error_message: string | null;
};

export async function trainVoiceClone(input: VoiceCloneTrainInput): Promise<VoiceCloneTrainOutput> {
  const response = await fetch(`${getVoiceServiceUrl()}/v1/voice/clone/train`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      owner_id: input.owner_id,
      workspace_id: input.workspace_id,
      display_name: input.display_name,
      language: input.language || 'cn',
      text: input.text,
      sample_format: input.sample_format,
      sample_path: input.sample_path,
      demo_text: input.demo_text,
      enable_audio_denoise: !!input.enable_audio_denoise,
      disable_volume_normalization: !!input.disable_volume_normalization
    })
  });

  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    /* swallow JSON parse error, fall through to status code */
  }

  if (!response.ok) {
    const detail =
      (data && typeof data.detail === 'string' && data.detail) ||
      (Array.isArray(data?.detail) && JSON.stringify(data.detail)) ||
      raw;
    throw new Error(`Voice clone train failed: HTTP ${response.status} ${detail}`);
  }

  return data as unknown as VoiceCloneTrainOutput;
}
