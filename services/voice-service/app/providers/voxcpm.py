from __future__ import annotations

import os
import uuid
from functools import lru_cache
from pathlib import Path

import soundfile as sf
from voxcpm import VoxCPM


SAMPLE_RATE = 16000


@lru_cache(maxsize=1)
def load_model():
    cache_dir = os.getenv("VOICE_SERVICE_MODEL_CACHE", "storage/voice-service/models")
    device = os.getenv("VOICE_SERVICE_DEVICE", "auto")
    return VoxCPM.from_pretrained(
        cache_dir=str(Path(cache_dir).resolve()),
        load_denoiser=False,
        optimize=False,
        device=device,
    )


class VoxCpmVoiceProvider:
    def synthesize(
        self,
        *,
        text: str,
        voice_id: str,
        speed: float,
        emotion: str,
        style: str,
        output_dir: Path,
    ) -> Path:
        output_path = output_dir / f"{uuid.uuid4().hex}.wav"
        model = load_model()
        prompt = build_prompt(text=text, voice_id=voice_id, emotion=emotion, style=style)
        waveform = model.generate(text=prompt, normalize=True, inference_timesteps=10)
        sf.write(str(output_path), waveform, SAMPLE_RATE)
        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("VoxCPM did not generate an audio file")
        return output_path


def build_prompt(*, text: str, voice_id: str, emotion: str, style: str) -> str:
    voice_hint = "成熟稳重的商务男声" if "male" in voice_id else "自然清晰的商务女声"
    return f"{text}\n\n请使用{voice_hint}，情绪为{emotion}，风格为{style}，语速自然。"
