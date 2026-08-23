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
