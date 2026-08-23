# Zhiheng Voice Service

Independent local TTS service for the automation editing workspace.

## Runtime

```powershell
uv pip install --python services\voice-service\.venv\Scripts\python.exe -r services\voice-service\requirements.txt
.\services\voice-service\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 5015 --app-dir services\voice-service
```

## Environment

```text
VOICE_SERVICE_PROVIDER=piper
VOICE_SERVICE_OUTPUT_DIR=storage/voice-service/outputs
VOICE_SERVICE_MODEL_CACHE=storage/voice-service/models
VOICE_SERVICE_DEVICE=auto
```

`piper` is the default local open-source runtime used for stable offline speech generation.
`voxcpm` is the production target for higher quality local Chinese TTS and future voice cloning.
`sapi` is a Windows-only local fallback for development when model weights are not available.

## API

`POST /v1/tts`

```json
{
  "text": "企业宣传视频旁白文本",
  "voice_id": "business_female",
  "speed": 1.0,
  "emotion": "neutral",
  "style": "business"
}
```

Response:

```json
{
  "audio_path": "D:/.../storage/voice-service/outputs/xxx.wav",
  "duration": 8.5,
  "format": "wav"
}
```
