from __future__ import annotations

import os

from .base import VoiceProvider
from .piper import PiperVoiceProvider
from .sapi import SapiVoiceProvider
from .voxcpm import VoxCpmVoiceProvider


def get_provider() -> VoiceProvider:
    provider = os.getenv("VOICE_SERVICE_PROVIDER", "piper").lower()
    if provider == "piper":
        return PiperVoiceProvider()
    if provider == "sapi":
        return SapiVoiceProvider()
    if provider == "voxcpm":
        return VoxCpmVoiceProvider()
    raise ValueError(f"unsupported voice provider: {provider}")
