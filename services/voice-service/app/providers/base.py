from __future__ import annotations

from pathlib import Path
from typing import Protocol


class VoiceProvider(Protocol):
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
        ...
