from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class VoiceSynthesisResult:
    audio_path: Path
    format: str
    mime_type: str
    provider: str
    provider_voice_id: str


class VoiceProvider(Protocol):
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
        ...
