from __future__ import annotations

import base64
import json
import os
import uuid
import urllib.error
import urllib.request
from pathlib import Path

from .base import VoiceSynthesisResult


DEFAULT_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
DEFAULT_RESOURCE_ID = "seed-tts-2.0"
DEFAULT_VOICE_ID = "zh_female_xiaohe_uranus_bigtts"


class DoubaoVoiceProvider:
    provider = "doubao"

    def synthesize(
        self,
        *,
        text: str,
        voice_id: str,
        speed: float,
        volume: float,
        emotion: str,
        style: str,
        output_dir: Path,
    ) -> VoiceSynthesisResult:
        api_key = os.getenv("DOUBAO_SPEECH_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("DOUBAO_SPEECH_API_KEY is not set. Configure Volcengine Doubao TTS before generating audio.")

        resource_id = os.getenv("DOUBAO_SPEECH_RESOURCE_ID", DEFAULT_RESOURCE_ID).strip()
        endpoint = os.getenv("DOUBAO_SPEECH_ENDPOINT", DEFAULT_ENDPOINT).strip()
        provider_voice_id = (
            voice_id
            if voice_id and voice_id not in {"auto", "default"}
            else os.getenv("DOUBAO_SPEECH_DEFAULT_VOICE", DEFAULT_VOICE_ID).strip()
        )
        if not provider_voice_id:
            provider_voice_id = DEFAULT_VOICE_ID

        request_id = str(uuid.uuid4())
        payload = {
            "user": {"uid": os.getenv("DOUBAO_SPEECH_APP_ID", "zhiheng-zhiqi")},
            "req_params": {
                "text": text,
                "speaker": provider_voice_id,
                "audio_params": {
                    "format": "mp3",
                    "sample_rate": 24000,
                    "speech_rate": self._speech_rate(speed),
                },
            },
        }

        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            endpoint,
            data=data,
            method="POST",
            headers={
                "content-type": "application/json",
                "X-Api-Key": api_key,
                "X-Api-Resource-Id": resource_id,
                "X-Api-Request-Id": request_id,
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Doubao TTS failed: HTTP {exc.code} {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Doubao TTS request failed: {exc.reason}") from exc

        audio_bytes = self._decode_audio(body)
        output_dir.mkdir(parents=True, exist_ok=True)
        audio_path = output_dir / f"doubao-{request_id}.mp3"
        audio_path.write_bytes(audio_bytes)

        return VoiceSynthesisResult(
            audio_path=audio_path,
            format="mp3",
            mime_type="audio/mpeg",
            provider=self.provider,
            provider_voice_id=provider_voice_id,
        )

    @staticmethod
    def _speech_rate(speed: float) -> int:
        clamped = max(0.5, min(2.0, speed))
        return int(round((clamped - 1.0) * 100))

    @staticmethod
    def _decode_audio(body: bytes) -> bytes:
        text = body.decode("utf-8", errors="replace").strip()
        decoder = json.JSONDecoder()
        index = 0
        audio = bytearray()

        while index < len(text):
            while index < len(text) and text[index].isspace():
                index += 1
            if index >= len(text):
                break
            chunk, index = decoder.raw_decode(text, index)
            code = chunk.get("code", 0)
            if code not in (0, "0", None):
                message = chunk.get("message") or chunk.get("msg") or chunk
                raise RuntimeError(f"Doubao TTS failed: {message}")
            encoded_audio = chunk.get("data")
            if isinstance(encoded_audio, str) and encoded_audio:
                audio.extend(base64.b64decode(encoded_audio))

        if not audio:
            raise RuntimeError("Doubao TTS returned no audio data.")
        return bytes(audio)
