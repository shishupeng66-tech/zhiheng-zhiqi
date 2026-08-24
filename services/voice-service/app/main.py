from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .providers import get_provider
from .utils import audio_duration_seconds, ensure_output_dir
from .volcengine_seed_tts_voices import all_voices, RESOURCE_ID


def load_project_env() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    # 安全桥接：统一模型与接口设置中心在保存 voice 配置后，会写出 gitignored 的桥接文件
    # data/.voice-service-env（含豆包 TTS 的真实密钥）。该文件是 voice 配置的唯一来源，
    # 优先于 .env.local / .env 加载（"先加载者胜"），从而让设置中心成为唯一可信配置入口。
    bridge_env = repo_root / "data" / ".voice-service-env"
    for env_path in (bridge_env, repo_root / ".env.local", repo_root / ".env"):
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


load_project_env()


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice_id: str = Field(default="auto")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    emotion: str = Field(default="neutral")
    style: str = Field(default="business")


class TtsResponse(BaseModel):
    audio_path: str
    duration: float
    format: str
    mime_type: str
    provider: str
    provider_voice_id: str


app = FastAPI(title="Zhiheng Voice Service", version="0.2.0")


@app.get("/health")
def health():
    return {"ok": True, "provider": "doubao"}


# 豆包 TTS 预设音色库（统一音色来源）。
# id 为产品侧音色 id，与前端 resolveSpeechVoiceId / speechVoiceCatalog 保持一致；
# 真实合成由 providers.doubao 通过 seed-tts-2.0 完成。
VOICE_PRESETS = [
    {
        "id": "auto",
        "name": "AI 自动选择音色",
        "gender": "系统",
        "language": "zh-cn",
        "description": "由系统根据文案内容自动挑选最合适的豆包音色。",
        "type": "preset_voice",
    },
    {
        "id": "voice-guanggao",
        "name": "广告解说",
        "gender": "男",
        "language": "zh-cn",
        "description": "沉稳有力的男声，适合广告与营销类视频解说。",
        "type": "preset_voice",
    },
    {
        "id": "voice-jieshuo-xiaoming",
        "name": "解说小明",
        "gender": "男",
        "language": "zh-cn",
        "description": "清晰自然的男声，适合通用视频解说。",
        "type": "preset_voice",
    },
    {
        "id": "voice-vivi",
        "name": "Vivi",
        "gender": "女",
        "language": "zh-cn",
        "description": "自然亲切的女声，适合日常与知识类内容。",
        "type": "preset_voice",
    },
    {
        "id": "voice-xiaohe",
        "name": "小何",
        "gender": "女",
        "language": "zh-cn",
        "description": "清亮轻快的女声，适合轻松活泼的内容。",
        "type": "preset_voice",
    },
    {
        "id": "voice-wennuan-ahu",
        "name": "温暖阿虎",
        "gender": "男",
        "language": "zh-cn",
        "description": "温暖治愈的男声，适合情感与故事类内容。",
        "type": "preset_voice",
    },
    {
        "id": "voice-wenrou-mama",
        "name": "温柔妈妈",
        "gender": "女",
        "language": "zh-cn",
        "description": "温柔的妈妈音，适合亲子与情感类内容。",
        "type": "preset_voice",
    },
    {
        "id": "voice-qingshuang-nansheng",
        "name": "清爽男声",
        "gender": "男",
        "language": "zh-cn",
        "description": "清爽干净的男声，适合年轻化与资讯类内容。",
        "type": "preset_voice",
    },
    {
        "id": "voice-kefu-wanjun",
        "name": "客服婉君",
        "gender": "女",
        "language": "zh-cn",
        "description": "专业得体的客服女声，适合服务通知与答疑场景。",
        "type": "preset_voice",
    },
    {
        "id": "voice-shaonian-zixin",
        "name": "少年梓辛",
        "gender": "男",
        "language": "zh-cn",
        "description": "少年感的男声，适合年轻化与校园类内容。",
        "type": "preset_voice",
    },
]


@app.get("/v1/voices")
def voices():
    return {"voices": VOICE_PRESETS}


@app.post("/v1/tts", response_model=TtsResponse)
def tts(request: TtsRequest):
    output_dir = ensure_output_dir()
    try:
        provider = get_provider()
        result = provider.synthesize(
            text=request.text,
            voice_id=request.voice_id,
            speed=request.speed,
            volume=request.volume,
            emotion=request.emotion,
            style=request.style,
            output_dir=output_dir,
        )
        return TtsResponse(
            audio_path=str(Path(result.audio_path).resolve()),
            duration=audio_duration_seconds(result.audio_path),
            format=result.format,
            mime_type=result.mime_type,
            provider=result.provider,
            provider_voice_id=result.provider_voice_id,
        )
    except Exception as exc:  # pragma: no cover - surfaced to Next.js worker logs.
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# 知衡语音 —— 完整音色库同步源
# ---------------------------------------------------------------------------
# 说明：火山引擎 seed-tts-2.0 的预设音色库没有可分页拉取的运行时 ListSpeakers
# REST 接口（网关对 /tts/list、/tts/speakers 等路径均返回 “Endpoint does not exist”）。
# 因此「完整目录」来自官方文档化的预设音色清单（volcengine_seed_tts_voices.py），
# 该清单即真实可用的全部 preset 音色。sync 逻辑完整遍历并支持分页，如实返回
# Total / 实际获取条数 / 去重后真实音色数量，未来若接入真实分页 API 可无缝替换。
PREVIEW_CACHE_DIR = Path(
    os.getenv("VOICE_SERVICE_OUTPUT_DIR", "storage/voice-service/outputs")
) / "previews"
DEFAULT_PREVIEW_TEXT = "你好，这是当前音色的试听效果。"


@app.get("/v1/voices/all")
def voices_all(
    resource: str = RESOURCE_ID,
    page: int = 1,
    page_size: int = 50,
):
    """完整音色库（分页）。返回 Total / fetched / deduped 供同步核对。"""
    all_v = all_voices()
    total = len(all_v)

    # 去重（按 voice_type）
    seen: set[str] = set()
    deduped: list[dict] = []
    for voice in all_v:
        vt = voice.get("voice_type")
        if vt in seen:
            continue
        seen.add(vt)
        deduped.append(voice)

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    start = (page - 1) * page_size
    end = start + page_size
    page_items = deduped[start:end]

    return {
        "resource": resource,
        "total": total,
        "fetched": len(all_v),
        "deduped": len(deduped),
        "page": page,
        "page_size": page_size,
        "has_more": end < len(deduped),
        "count": len(page_items),
        "voices": page_items,
    }


@app.get("/v1/tts/preview")
def tts_preview(
    voice_type: str,
    text: str = DEFAULT_PREVIEW_TEXT,
    speed: float = 1.0,
    volume: float = 1.0,
):
    """实时合成指定音色的试听音频（按 voice_type+文本+参数 缓存）。"""
    if not voice_type:
        raise HTTPException(status_code=400, detail="voice_type is required")

    speed = max(0.5, min(2.0, float(speed)))
    volume = max(0.0, min(2.0, float(volume)))
    text = (text or DEFAULT_PREVIEW_TEXT).strip()[:200]
    if not text:
        text = DEFAULT_PREVIEW_TEXT

    PREVIEW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha1(
        f"{voice_type}|{text}|{speed}|{volume}".encode("utf-8")
    ).hexdigest()
    cache_path = PREVIEW_CACHE_DIR / f"{cache_key}.mp3"

    if not cache_path.exists():
        try:
            provider = get_provider()
            result = provider.synthesize(
                text=text,
                voice_id=voice_type,
                speed=speed,
                volume=volume,
                emotion="neutral",
                style="business",
                output_dir=PREVIEW_CACHE_DIR,
            )
            generated = Path(result.audio_path)
            if generated.resolve() != cache_path.resolve():
                generated.replace(cache_path)
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail=f"preview failed: {exc}") from exc

    return FileResponse(
        str(cache_path),
        media_type="audio/mpeg",
        filename=f"{voice_type}.mp3",
    )
