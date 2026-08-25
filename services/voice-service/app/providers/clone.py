"""
Phase 3-A · 声音复刻 Provider（最小闭环）

调用 豆包 voice_clone HTTP 接口 (openspeech.bytedance.com/api/v3/tts/voice_clone)
- 同步请求（不走 WebSocket 双向流）
- 必填：speaker_id（固定值 "custom_speaker_id"）、custom_speaker_id（真实复刻资源 ID）、
  audio（base64 内联）、text、language、model_type=5
- 响应 status：0=NotFound / 1=Training / 2=Success / 3=Failed / 4=Active
- 成功时返回 demo_audio（base64 mp3），1 小时内有效，本模块立刻落盘

唯一对外公共 API：`DoubaoCloneProvider.train()`，返回 dataclass `CloneTrainResult`。
其他模块（main.py）只依赖本模块，不依赖豆包 TTS 合成模块。
"""
from __future__ import annotations

import base64
import hashlib
import os
import random
import re
import string
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import httpx


# ===== 常量（默认值，env 可覆盖）====================================

DEFAULT_CLONE_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/voice_clone"
# 复刻 2.0 = model_type 5（seed-tts-2.0 家族）
DEFAULT_CLONE_MODEL_TYPE = 5
# 默认试听文本。豆包会基于此句做相似度试听，可被请求覆盖。
DEFAULT_DEMO_TEXT = "你好，这是我的声音试听。"

# 训练素材限制
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MiB（PDF §0.2）
ALLOWED_FORMATS = {"wav", "mp3", "ogg", "m4a", "aac", "pcm"}
# pcm 仅支持 24k mono（PDF §0.2.5）
PCM_FORMAT = "pcm"

# 豆包 custom_speaker_id 命名规范（PDF §0.2）：
# - 长度 8 ~ 256
# - 字符：字母 / 数字 / `-` / `_`
# - 必须以字母开头
# - 不允许前缀：S_ / ICL_ / MIX_ / DiT_ / BV / xx_ / planet_
# - 不允许后缀：_bigtts / _tob / _streaming
NAME_TOO_SHORT = "too_short"
NAME_TOO_LONG = "too_long"
NAME_BAD_START = "bad_start"
NAME_BAD_CHARS = "bad_chars"
NAME_BAD_PREFIX = "bad_prefix"
NAME_BAD_SUFFIX = "bad_suffix"

NAME_PREFIX_BLOCKLIST = ("S_", "ICL_", "MIX_", "DiT_", "BV", "xx_", "planet_")
NAME_SUFFIX_BLOCKLIST = ("_bigtts", "_tob", "_streaming")

# 复刻状态：与前端 voiceCloneStatuses 对齐（draft/training/ready/failed/archived）


class CloneStatus(str, Enum):
    TRAINING = "training"
    READY = "ready"
    FAILED = "failed"


# 豆包 API 业务状态码（详见接入方案 §3.2）
DOUBAN_API_STATUS_TRAINING_RETRYABLE = 1   # 训练中（罕见但允许重试）
DOUBAN_API_STATUS_SUCCESS = 2             # 成功
DOUBAN_API_STATUS_FAILED = 3              # 业务失败

# 临时不重试的 1 视为短退避重试；其它 4xx/5xx 按 HTTP 重试
RETRY_HTTP_ON_429_5XX = True
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = (0.5, 1.0, 2.0)  # 指数退避


LANGUAGE_CODE_MAP: dict[str, int] = {
    "cn": 0,
    "zh": 0,
    "zh-cn": 0,
    "en": 1,
    "en-us": 1,
    "ja": 2,
    "es": 3,
    "id": 4,
    "pt": 5,
    "de": 6,
    "fr": 7,
    "ko": 8,
    "it": 9,
    "th": 10,
    "vi": 11,
    "ru": 12,
    "fil": 13,
    "ms": 14,
    "ar": 15,
    "mx": 16,
    "pt-br": 17,
    "pl": 19,
    "tr": 20,
    "sv": 21
}


def language_to_code(language: str) -> int:
    """把业务的 cn/en/ja 语种字符串映射成豆包期望的 int32 码（PDF §0.2.2）。

    未识别的语种默认按中文 0 处理（避免因未知代码直接 400 阻塞闭环）。
    """
    if not language:
        return 0
    key = language.strip().lower()
    return LANGUAGE_CODE_MAP.get(key, 0)


# ===== 自定义异常 ====================================================


class CloneError(Exception):
    """复刻流程中可被上层捕获的业务异常。"""


class SpeakerIdInvalid(CloneError):
    """custom_speaker_id 命名不合规。"""


# ===== 结果 dataclass ================================================


@dataclass
class CloneTrainResult:
    """train() 调用结果，main.py 用来落库 / 落盘。"""

    custom_speaker_id: str
    display_name: str
    language: str
    status: CloneStatus
    demo_audio_path: str | None
    provider_status: int                     # 豆包原始 status 码
    raw_response: dict[str, Any] = field(default_factory=dict)
    retry_count: int = 0
    error_message: str | None = None


# ===== Provider ======================================================


class DoubaoCloneProvider:
    """调用豆包 voice_clone HTTP 接口（同步）。

    环境变量：
      DOUBAO_SPEECH_API_KEY       必需，与现有 TTS 复用（同一火山账号）
      DOUBAO_CLONE_ENDPOINT       可选，默认 https://openspeech.bytedance.com/api/v3/tts/voice_clone
      DOUBAO_CLONE_MODEL_TYPE     可选，默认 5（复刻 2.0）
    """

    provider = "doubao_clone"

    def __init__(self) -> None:
        self.api_key = os.getenv("DOUBAO_SPEECH_API_KEY", "").strip()
        if not self.api_key:
            raise CloneError(
                "DOUBAO_SPEECH_API_KEY is not set. Cannot call voice_clone HTTP API."
            )
        self.endpoint = os.getenv(
            "DOUBAO_CLONE_ENDPOINT", DEFAULT_CLONE_ENDPOINT
        ).strip()
        try:
            self.model_type = int(
                os.getenv("DOUBAO_CLONE_MODEL_TYPE", str(DEFAULT_CLONE_MODEL_TYPE))
            )
        except ValueError as exc:
            raise CloneError(
                f"DOUBAO_CLONE_MODEL_TYPE must be int, got {os.getenv('DOUBAO_CLONE_MODEL_TYPE')!r}"
            ) from exc

    # ---------- custom_speaker_id 生成 / 校验 -----------------------

    @staticmethod
    def make_speaker_id(*, owner_id: str, display_name: str) -> str:
        """服务器端生成符合豆包规范的 custom_speaker_id。

        格式：zhclone_<userhash6>_<name-slug16>_<rand6>
        - userhash6：owner_id 取 sha256 前 6 hex（小写字母+数字）
        - name-slug16：display_name 转 slug 后截断 16 字符，字母开头，不合规字符替换为 _
        - rand6：8 进制 6 位随机数（≈ 大写字母和数字混合）

        长度上限 256，留足冗余。
        """
        user_hash = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()[:6]
        slug = _slugify(display_name) or "user"
        slug = slug[:16].rstrip("-_") or "user"
        if not slug[0].isalpha():
            slug = "z" + slug[:15]
        rand_part = "".join(
            random.choices(string.ascii_lowercase + string.digits, k=6)
        )
        candidate = f"zhclone_{user_hash}_{slug}_{rand_part}"
        # 走一次校验，若不合规则改为单一 hash
        ok, _reason = DoubaoCloneProvider.validate_speaker_id(candidate)
        if not ok:
            fallback = f"zhclone_{user_hash}_{rand_part}"
            ok2, _ = DoubaoCloneProvider.validate_speaker_id(fallback)
            if not ok2:
                # 极端兜底：用 SHA256 截断为确定性 ID
                fallback = (
                    "zhclone_"
                    + hashlib.sha256(candidate.encode("utf-8")).hexdigest()[:16]
                )
            candidate = fallback
        return candidate

    @staticmethod
    def validate_speaker_id(speaker_id: str) -> tuple[bool, str]:
        """返回 (是否合规, 原因)。任何不合规会让 UI 报错而不是发到豆包。"""
        if not (8 <= len(speaker_id) <= 256):
            return False, NAME_TOO_SHORT if len(speaker_id) < 8 else NAME_TOO_LONG
        if not speaker_id[0].isalpha():
            return False, NAME_BAD_START
        # 仅允许字母/数字/`-`/`_`
        if not re.fullmatch(r"[A-Za-z0-9_\-]+", speaker_id):
            return False, NAME_BAD_CHARS
        # 黑名单前后缀
        for bad in NAME_PREFIX_BLOCKLIST:
            if speaker_id.startswith(bad):
                return False, NAME_BAD_PREFIX
        for bad in NAME_SUFFIX_BLOCKLIST:
            if speaker_id.endswith(bad):
                return False, NAME_BAD_SUFFIX
        return True, ""

    # ---------- 主入口 -----------------------------------------------

    def train(
        self,
        *,
        sample_path: Path,
        sample_format: str,
        custom_speaker_id: str,
        display_name: str,
        text: str,
        language: str,
        demo_audio_output_dir: Path,
        demo_text: str = DEFAULT_DEMO_TEXT,
        enable_audio_denoise: bool = False,
        disable_volume_normalization: bool = False,
    ) -> CloneTrainResult:
        """调用 豆包 voice_clone HTTP 接口，返回结果。

        必填：sample_path / sample_format / custom_speaker_id /
              display_name / text / language / demo_audio_output_dir
        """
        ok, reason = self.validate_speaker_id(custom_speaker_id)
        if not ok:
            raise SpeakerIdInvalid(
                f"custom_speaker_id '{custom_speaker_id}' invalid ({reason})"
            )

        sample_format = (sample_format or "").lower().lstrip(".")
        if sample_format not in ALLOWED_FORMATS:
            raise CloneError(
                f"sample_format '{sample_format}' not supported. "
                f"Allowed: {sorted(ALLOWED_FORMATS)}"
            )
        if not sample_path.exists():
            raise CloneError(f"sample file not found: {sample_path}")
        size = sample_path.stat().st_size
        if size <= 0:
            raise CloneError(f"sample file is empty: {sample_path}")
        if size > MAX_AUDIO_BYTES:
            raise CloneError(
                f"sample exceeds 10MB cap ({size} bytes): {sample_path}"
            )

        audio_b64 = base64.b64encode(sample_path.read_bytes()).decode("ascii")

        body = {
            # PDF §0.2：speaker_id 必须是固定字符串 "custom_speaker_id"
            "speaker_id": "custom_speaker_id",
            "custom_speaker_id": custom_speaker_id,
            "audio": {
                "format": sample_format,
                "data": audio_b64,
            },
            # model_type 复刻 2.0 固定为 5（PDF §0.2.4）
            "model_type": self.model_type,
            "text": text,
            # PDF §0.2.2：language 必须是 int32 码，不是字符串
            "language": language_to_code(language),
            # 试听 demo（PDF §0.2.3）
            "extra_params": {
                "demo_text": demo_text,
                "demo_audio_output_dir": demo_audio_output_dir.as_posix(),
                "audio_denoise": not enable_audio_denoise,
                "volume_normalization": not disable_volume_normalization,
            },
        }

        headers = {
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key,
            "X-Api-Request-Id": str(uuid.uuid4()),
        }

        retry_count = 0
        last_exc: Exception | None = None
        for attempt in range(MAX_RETRIES):
            try:
                with httpx.Client(timeout=httpx.Timeout(60.0)) as client:
                    response = client.post(self.endpoint, headers=headers, json=body)
                retry_count = attempt
                # 状态码层面：5xx / 429 重试，其它抛出
                if response.status_code == 429 or 500 <= response.status_code < 600:
                    delay = RETRY_BACKOFF_SECONDS[min(attempt, len(RETRY_BACKOFF_SECONDS) - 1)]
                    time.sleep(delay)
                    continue
                # 4xx 不重试，直接抛
                if 400 <= response.status_code < 500:
                    snippet = response.text[:500]
                    raise CloneError(
                        f"voice_clone HTTP {response.status_code}: {snippet}"
                    )
                # 2xx
                payload = response.json()
                break
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_exc = exc
                delay = RETRY_BACKOFF_SECONDS[min(attempt, len(RETRY_BACKOFF_SECONDS) - 1)]
                time.sleep(delay)
        else:
            raise CloneError(
                f"voice_clone HTTP failed after {MAX_RETRIES} attempts: {last_exc}"
            )

        # 解析豆包业务状态
        try:
            provider_status = int(payload.get("status"))
        except (TypeError, ValueError) as exc:
            raise CloneError(
                f"voice_clone returned non-integer status: {payload!r}"
            ) from exc

        # 状态 1（训练中）按现行 PDF 罕见但允许重试一次
        if provider_status == DOUBAN_API_STATUS_TRAINING_RETRYABLE:
            time.sleep(RETRY_BACKOFF_SECONDS[1])
            with httpx.Client(timeout=httpx.Timeout(60.0)) as client:
                response = client.post(self.endpoint, headers=headers, json=body)
            payload = response.json()
            try:
                provider_status = int(payload.get("status"))
            except (TypeError, ValueError) as exc:
                raise CloneError(
                    f"voice_clone retry returned non-integer status: {payload!r}"
                ) from exc

        if provider_status != DOUBAN_API_STATUS_SUCCESS:
            err_msg = (
                payload.get("message")
                or payload.get("error")
                or f"voice_clone status={provider_status}"
            )
            return CloneTrainResult(
                custom_speaker_id=custom_speaker_id,
                display_name=display_name,
                language=language,
                status=CloneStatus.FAILED,
                demo_audio_path=None,
                provider_status=provider_status,
                raw_response=payload,
                retry_count=retry_count,
                error_message=str(err_msg),
            )

        # demo_audio 落盘（PDF: 1 小时有效，立刻存）
        demo_audio = (
            payload.get("demo_audio")
            or payload.get("data", {}).get("demo_audio")
            or (payload.get("data") if isinstance(payload.get("data"), str) else None)
        )
        if not demo_audio:
            return CloneTrainResult(
                custom_speaker_id=custom_speaker_id,
                display_name=display_name,
                language=language,
                status=CloneStatus.FAILED,
                demo_audio_path=None,
                provider_status=provider_status,
                raw_response=payload,
                retry_count=retry_count,
                error_message="voice_clone success but no demo_audio in payload",
            )

        demo_audio_output_dir.mkdir(parents=True, exist_ok=True)
        out_path = demo_audio_output_dir / f"{custom_speaker_id}.mp3"
        try:
            out_path.write_bytes(base64.b64decode(demo_audio))
        except Exception as exc:
            return CloneTrainResult(
                custom_speaker_id=custom_speaker_id,
                display_name=display_name,
                language=language,
                status=CloneStatus.FAILED,
                demo_audio_path=None,
                provider_status=provider_status,
                raw_response=payload,
                retry_count=retry_count,
                error_message=f"demo_audio base64 decode failed: {exc}",
            )

        return CloneTrainResult(
            custom_speaker_id=custom_speaker_id,
            display_name=display_name,
            language=language,
            status=CloneStatus.READY,
            demo_audio_path=str(out_path.resolve()),
            provider_status=provider_status,
            raw_response=payload,
            retry_count=retry_count,
        )


# ===== 工具函数 ======================================================


def _slugify(name: str) -> str:
    """把 display_name 转成 8-256 字符、字母/数字/`-`/`_` 的 slug。"""
    if not name:
        return ""
    # 中文字符保留（豆包允许字母数字-_，但允许业务上用客户端准予的字符——
    # 豆包实际规范是 [A-Za-z0-9_-]，所以中文会被视为不合规。我们把非合法字符替换为 _ 并触发校验失败回退。
    cleaned = re.sub(r"[^A-Za-z0-9_\-]+", "-", name.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned
