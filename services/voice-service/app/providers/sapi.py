from __future__ import annotations

import uuid
from pathlib import Path

import pyttsx3


class SapiVoiceProvider:
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
        engine = pyttsx3.init()
        engine.setProperty("rate", int(180 * speed))
        voices = engine.getProperty("voices") or []
        preferred = "female" if "female" in voice_id else "male"
        for voice in voices:
            marker = f"{voice.name} {voice.id}".lower()
            if preferred in marker or "zh" in marker or "chinese" in marker:
                engine.setProperty("voice", voice.id)
                break
        engine.save_to_file(text, str(output_path))
        engine.runAndWait()
        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("Windows SAPI did not generate an audio file")
        return output_path
