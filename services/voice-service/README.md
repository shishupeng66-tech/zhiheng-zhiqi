# Zhiheng Voice Service

Independent speech service for the automation editing workspace. Production TTS is Doubao Speech only; MoneyPrinterTurbo receives the generated local audio through `--custom-audio-file`.

## Runtime

```powershell
uv venv services\voice-service\.venv-doubao
uv pip install --python services\voice-service\.venv-doubao\Scripts\python.exe -r services\voice-service\requirements.txt
.\scripts\start-voice-service.ps1
```

## Environment

The service loads process environment variables first, then project `.env.local` / `.env`.

```text
VOICE_SERVICE_OUTPUT_DIR=storage/voice-service/outputs
DOUBAO_SPEECH_API_KEY=
DOUBAO_SPEECH_RESOURCE_ID=seed-tts-2.0
DOUBAO_SPEECH_ENDPOINT=https://openspeech.bytedance.com/api/v3/tts/unidirectional
DOUBAO_SPEECH_DEFAULT_VOICE=zh_male_guanggaojieshuo_uranus_bigtts
DOUBAO_SPEECH_APP_ID=zhiheng-zhiqi
```

Do not commit real API keys.

## API

`POST /v1/tts`

```json
{
  "text": "企业宣传视频旁白文本",
  "voice_id": "auto",
  "speed": 1.0,
  "volume": 1.0,
  "emotion": "neutral",
  "style": "business"
}
```

Response:

```json
{
  "audio_path": "D:/.../storage/voice-service/outputs/doubao-xxx.mp3",
  "duration": 8.5,
  "format": "mp3",
  "mime_type": "audio/mpeg",
  "provider": "doubao",
  "provider_voice_id": "zh_male_guanggaojieshuo_uranus_bigtts"
}
```
