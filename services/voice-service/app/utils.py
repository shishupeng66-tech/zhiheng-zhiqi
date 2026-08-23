from __future__ import annotations

import os
import subprocess
import wave
from pathlib import Path


def ensure_output_dir() -> Path:
    output_dir = Path(os.getenv("VOICE_SERVICE_OUTPUT_DIR", "storage/voice-service/outputs"))
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir.resolve()


def audio_duration_seconds(audio_path: Path) -> float:
    if audio_path.suffix.lower() == ".wav":
        with wave.open(str(audio_path), "rb") as audio:
            frames = audio.getnframes()
            rate = audio.getframerate()
            return round(frames / float(rate), 3) if rate else 0.0

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return round(float(result.stdout.strip()), 3)
    except Exception:
        return 0.0
