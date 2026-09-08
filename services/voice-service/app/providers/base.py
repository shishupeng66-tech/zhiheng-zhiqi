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
    # 字级时间戳（毫秒起止），与输入 text 逐字符对齐；无则 None。
    # 来自 TTS additions=speech_timestamp（最终音频的真实时间）。
    char_timestamps: list | None = None
    # 逐字字幕时间戳（TTS2.0 enable_subtitle 原生返回）：[{text, startMs, endMs}]；无则 None。
    subtitle_words: list | None = None


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
