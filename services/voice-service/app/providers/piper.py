from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path


class PiperVoiceProvider:
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
        model_dir = Path(
            os.getenv("PIPER_VOICE_DIR", "storage/voice-service/piper/zh_CN-huayan-medium")
        ).resolve()
        model_path = model_dir / "zh_CN-huayan-medium.onnx"
        config_path = model_dir / "zh_CN-huayan-medium.onnx.json"
        if not model_path.exists() or not config_path.exists():
            raise FileNotFoundError(
                f"Piper Chinese voice model is missing: {model_path} / {config_path}"
            )

        output_path = output_dir / f"{uuid.uuid4().hex}.wav"
        length_scale = max(0.5, min(2.0, 1 / speed))
        with tempfile.NamedTemporaryFile("w", encoding="utf-8-sig", suffix=".txt", delete=False) as file:
            file.write(f"{text}\n")
            input_path = Path(file.name)

        try:
            piper_exe = Path(sys.executable).with_name(
                "piper.exe" if os.name == "nt" else "piper"
            )
            command = [
                str(piper_exe),
                "--model",
                str(model_path),
                "--config",
                str(config_path),
                "--input-file",
                str(input_path),
                "--output-file",
                str(output_path),
                "--length-scale",
                str(length_scale),
            ]
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            if completed.returncode != 0:
                raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
        finally:
            input_path.unlink(missing_ok=True)

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("Piper did not generate an audio file")
        return output_path
