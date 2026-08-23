from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .providers import get_provider
from .utils import audio_duration_seconds, ensure_output_dir


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice_id: str = Field(default="business_female")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    emotion: str = Field(default="neutral")
    style: str = Field(default="business")


class TtsResponse(BaseModel):
    audio_path: str
    duration: float
    format: str = "wav"


app = FastAPI(title="Zhiheng Voice Service", version="0.1.0")


@app.get("/health")
def health():
    provider = os.getenv("VOICE_SERVICE_PROVIDER", "piper")
    return {"ok": True, "provider": provider}


@app.get("/v1/voices")
def voices():
    return {
        "voices": [
            {
                "id": "business_female",
                "name": "商务女声",
                "type": "preset_voice",
                "provider": os.getenv("VOICE_SERVICE_PROVIDER", "piper"),
            },
            {
                "id": "business_male",
                "name": "商务男声",
                "type": "preset_voice",
                "provider": os.getenv("VOICE_SERVICE_PROVIDER", "piper"),
            },
        ]
    }


@app.post("/v1/tts", response_model=TtsResponse)
def tts(request: TtsRequest):
    output_dir = ensure_output_dir()
    try:
        provider = get_provider()
        audio_path = provider.synthesize(
            text=request.text,
            voice_id=request.voice_id,
            speed=request.speed,
            emotion=request.emotion,
            style=request.style,
            output_dir=output_dir,
        )
        return TtsResponse(
            audio_path=str(Path(audio_path).resolve()),
            duration=audio_duration_seconds(audio_path),
        )
    except Exception as exc:  # pragma: no cover - surfaced to Next.js worker logs.
        raise HTTPException(status_code=500, detail=str(exc)) from exc
