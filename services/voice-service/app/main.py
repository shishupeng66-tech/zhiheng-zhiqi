from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .providers import get_provider
from .providers.clone import (
    CloneError as CloneProviderError,
    CloneStatus,
    DoubaoCloneProvider,
    SpeakerIdInvalid as CloneSpeakerIdInvalid,
)
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


# ============================================================================
# Phase 3-A：声音复刻（最小闭环）
#
# 调用链路：
#   浏览器 -> Next.js /api/.../voices/clone (POST multipart)
#          -> 落盘 storage/voice-service/clone-samples/<ownerId>/<uuid>.<ext>
#          -> 调 /v1/voice/clone/train，传 sample_path + 业务字段
#          -> 调 豆包 voice_clone HTTP，写 outputs/clone-demos/<sid>.mp3
#          -> 返回结果，Next.js 落库 voice_clones 表
#
# Phase 3-B 之前，本模块**不**与 voice_catalog 主表打通、不触发业务可用。
# ============================================================================

# 复刻素材 demo 试听 mp3 路径（与现有 previews/ 并列，不冲突）
# 固定指向 /d/知衡智企（Next.js 端的 storage/voice-service/outputs/ 同步使用）
CLONE_DEMO_DIR = Path("D:/知衡智企/storage/voice-service/outputs/clone-demos")
# 复刻素材样本路径 — Next.js 端以 <ownerId> 子目录隔离
CLONE_SAMPLE_BASE_DIR = Path(
    "D:/知衡智企/storage/voice-service/outputs/clone-samples"
)


class CloneTrainRequest(BaseModel):
    owner_id: str = Field(min_length=1, max_length=64)
    workspace_id: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=80)
    language: str = Field(default="cn", max_length=8)
    text: str = Field(min_length=1, max_length=2000)
    sample_format: str = Field(min_length=1, max_length=8)
    sample_path: str = Field(min_length=1, max_length=1024)
    demo_text: str | None = Field(default=None, max_length=500)
    enable_audio_denoise: bool = Field(default=False)
    disable_volume_normalization: bool = Field(default=False)


class CloneTrainResponse(BaseModel):
    custom_speaker_id: str
    status: str  # 'ready' | 'failed' | 'training'
    demo_audio_path: str | None
    provider_status: int
    retry_count: int
    error_message: str | None = None
    raw_response: dict | None = None


@app.post("/v1/voice/clone/train", response_model=CloneTrainResponse)
def voice_clone_train(request: CloneTrainRequest):
    """调豆包 voice_clone HTTP，生成 custom_speaker_id + demo_audio 落盘。

    安全护栏：
    - sample_path 必须落在 CLONE_SAMPLE_BASE_DIR 之内（防止任意路径读取）
    - 文件 size 必须 ≤ 10MB（拷贝到本地常量确认）
    - custom_speaker_id 由 server 端用 owner_id + display_name 生成，client 不传
    """
    sample_path = Path(request.sample_path)
    # 路径安全：强制在 CLONE_SAMPLE_BASE_DIR 之内
    try:
        resolved = sample_path.resolve(strict=False)
        base = CLONE_SAMPLE_BASE_DIR.resolve(strict=False)
        resolved.relative_to(base)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"sample_path must be under {CLONE_SAMPLE_BASE_DIR} (got {sample_path})"
            ),
        ) from exc
    if not resolved.exists():
        raise HTTPException(status_code=404, detail=f"sample file not found: {sample_path}")
    if resolved.stat().st_size <= 0:
        raise HTTPException(status_code=400, detail="sample file is empty")
    if resolved.stat().st_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="sample file exceeds 10MB cap")

    # 1) 生成 custom_speaker_id
    custom_speaker_id = DoubaoCloneProvider.make_speaker_id(
        owner_id=request.owner_id, display_name=request.display_name
    )

    # 2) 实例化 provider 调豆包
    try:
        provider = DoubaoCloneProvider()
    except CloneProviderError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    CLONE_DEMO_DIR.mkdir(parents=True, exist_ok=True)
    demo_text = request.demo_text.strip() if request.demo_text else None

    try:
        result = provider.train(
            sample_path=resolved,
            sample_format=request.sample_format,
            custom_speaker_id=custom_speaker_id,
            display_name=request.display_name,
            text=request.text,
            language=request.language,
            demo_audio_output_dir=CLONE_DEMO_DIR,
            demo_text=demo_text or "你好，这是我的声音试听。",
            enable_audio_denoise=request.enable_audio_denoise,
            disable_volume_normalization=request.disable_volume_normalization,
        )
    except CloneSpeakerIdInvalid as exc:
        # 理论上我们自己 make_speaker_id 不会触发；保留防御性
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CloneProviderError as exc:
        raise HTTPException(status_code=502, detail=f"clone failed: {exc}") from exc

    return CloneTrainResponse(
        custom_speaker_id=result.custom_speaker_id,
        status=result.status.value,
        demo_audio_path=result.demo_audio_path,
        provider_status=result.provider_status,
        retry_count=result.retry_count,
        error_message=result.error_message,
        raw_response=result.raw_response if result.error_message else None,
    )


@app.get("/v1/voice/clone/{sid}")
def voice_clone_get(sid: str):
    """Phase 3-A 占位：单个音色复刻记录查询。

    Phase 3-B 之前不实现持久化查询（与 DB 集成属于后续）。
    当前返回 501 让前端知道该路径未实现。
    """
    raise HTTPException(
        status_code=501,
        detail=(
            f"GET /v1/voice/clone/{sid} not implemented in Phase 3-A. "
            "Query voice_clones table via Next.js API instead."
        ),
    )


@app.delete("/v1/voice/clone/{sid}")
def voice_clone_delete(sid: str):
    """Phase 3-A 占位：删除复刻记录。

    Phase 3-B 之前不实现删除（避免误删 voiceId 已 used 的资产）。
    """
    raise HTTPException(
        status_code=501,
        detail=(
            f"DELETE /v1/voice/clone/{sid} not implemented in Phase 3-A. "
            "Clone deletion will be added in Phase 3-B with usage check."
        ),
    )
