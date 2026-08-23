from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .providers import get_provider
from .utils import audio_duration_seconds, ensure_output_dir


def load_project_env() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    for file_name in (".env.local", ".env"):
        env_path = repo_root / file_name
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


load_project_env()


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice_id: str = Field(default="auto")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    emotion: str = Field(default="neutral")
    style: str = Field(default="business")


class TtsResponse(BaseModel):
    audio_path: str
    duration: float
    format: str
    mime_type: str
    provider: str
    provider_voice_id: str


app = FastAPI(title="Zhiheng Voice Service", version="0.2.0")


@app.get("/health")
def health():
    return {"ok": True, "provider": "doubao"}


@app.get("/v1/voices")
def voices():
    default_voice = os.getenv("DOUBAO_SPEECH_DEFAULT_VOICE", "zh_female_xiaohe_uranus_bigtts")
    return {
        "voices": [
            {
                "id": "auto",
                "name": "AI 自动选择音色",
                "type": "preset_voice",
                "provider": "doubao",
                "provider_voice_id": default_voice,
            },
            {
                "id": "voice-xiaohe",
                "name": "小荷",
                "type": "preset_voice",
                "provider": "doubao",
                "provider_voice_id": default_voice,
            },
        ]
    }


@app.post("/v1/tts", response_model=TtsResponse)
def tts(request: TtsRequest):
    output_dir = ensure_output_dir()
    try:
        provider = get_provider()
        result = provider.synthesize(
            text=request.text,
            voice_id=request.voice_id,
            speed=request.speed,
            volume=request.volume,
            emotion=request.emotion,
            style=request.style,
            output_dir=output_dir,
        )
        return TtsResponse(
            audio_path=str(Path(result.audio_path).resolve()),
            duration=audio_duration_seconds(result.audio_path),
            format=result.format,
            mime_type=result.mime_type,
            provider=result.provider,
            provider_voice_id=result.provider_voice_id,
        )
    except Exception as exc:  # pragma: no cover - surfaced to Next.js worker logs.
        raise HTTPException(status_code=500, detail=str(exc)) from exc
