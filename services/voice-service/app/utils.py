from __future__ import annotations

import os
import re
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
        ffmpeg_duration = _ffmpeg_duration_seconds(audio_path)
        if ffmpeg_duration > 0:
            return ffmpeg_duration
        if audio_path.suffix.lower() == ".mp3":
            return _mp3_duration_seconds(audio_path)
        return 0.0


def _ffmpeg_duration_seconds(audio_path: Path) -> float:
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(audio_path), "-f", "null", "-"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except Exception:
        return 0.0

    output = f"{result.stdout}\n{result.stderr}"
    match = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)", output)
    if not match:
        return 0.0

    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = float(match.group(3))
    return round(hours * 3600 + minutes * 60 + seconds, 3)


def _mp3_duration_seconds(audio_path: Path) -> float:
    data = audio_path.read_bytes()
    position = 0
    if data[:3] == b"ID3" and len(data) >= 10:
        tag_size = (
            ((data[6] & 0x7F) << 21)
            | ((data[7] & 0x7F) << 14)
            | ((data[8] & 0x7F) << 7)
            | (data[9] & 0x7F)
        )
        position = 10 + tag_size

    # MPEG layer bits are encoded as: 01=Layer III, 10=Layer II, 11=Layer I.
    # Keep this parser only as a fallback when ffprobe/ffmpeg are unavailable.
    bitrates = {
        (3, 1): [None, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, None],
        (3, 2): [None, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, None],
        (3, 3): [None, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, None],
        (2, 1): [None, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, None],
        (2, 2): [None, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, None],
        (2, 3): [None, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, None],
    }
    sample_rates = {
        3: [44100, 48000, 32000, None],
        2: [22050, 24000, 16000, None],
        0: [11025, 12000, 8000, None],
    }
    samples_per_frame = {
        (3, 1): 1152,
        (3, 2): 1152,
        (3, 3): 384,
        (2, 1): 576,
        (2, 2): 1152,
        (2, 3): 384,
        (0, 1): 576,
        (0, 2): 1152,
        (0, 3): 384,
    }

    duration = 0.0
    frames = 0
    while position + 4 <= len(data):
        if data[position] != 0xFF or (data[position + 1] & 0xE0) != 0xE0:
            position += 1
            continue
        header = int.from_bytes(data[position : position + 4], "big")
        version = (header >> 19) & 0b11
        layer = (header >> 17) & 0b11
        bitrate_index = (header >> 12) & 0b1111
        sample_rate_index = (header >> 10) & 0b11
        padding = (header >> 9) & 0b1
        if version == 1 or layer == 0 or bitrate_index in (0, 15) or sample_rate_index == 3:
            position += 1
            continue
        bitrate = bitrates.get((3 if version == 3 else 2, layer), [None] * 16)[bitrate_index]
        sample_rate = sample_rates[version][sample_rate_index]
        if not bitrate or not sample_rate:
            position += 1
            continue
        samples = samples_per_frame.get((version, layer), 1152)
        duration += samples / sample_rate
        frames += 1
        if layer == 3:
            frame_length = (12 * bitrate * 1000 // sample_rate + padding) * 4
        elif layer == 1 and version in {0, 2}:
            frame_length = 72 * bitrate * 1000 // sample_rate + padding
        else:
            frame_length = 144 * bitrate * 1000 // sample_rate + padding
        position += max(frame_length, 1)

    return round(duration, 3) if frames else 0.0
