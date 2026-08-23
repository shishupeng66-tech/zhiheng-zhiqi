from __future__ import annotations

from .base import VoiceProvider
from .doubao import DoubaoVoiceProvider


def get_provider() -> VoiceProvider:
    return DoubaoVoiceProvider()
