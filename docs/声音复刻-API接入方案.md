# 知衡语音 · 声音复刻 API 接入方案（Phase 2）

> **目的**：把豆包声音复刻 HTTP 训练接口（`/api/v3/tts/voice_clone`）接入到现有 Voice Service，让 Next.js 前端可以走自己那一层 API 完成「上传训练 → 试听 → 状态查询 → 删除」，最终把复刻音色**透明地**接入现有的 seed-tts-2.0 V3 WS 合成链路。
> **范围**：仅 Python Service + Next API（**不动前端组件**，与 Phase 1 解耦）。
> **参考**：[豆包语音·音色训练HTTP 文档](Desktop/豆包语音_音色训练HTTP_1783503259.pdf)（官方 v0，4.5MB，7 页）。
> **不假设**：PDF 没给出删除接口、查询状态接口的签名 —— 详见 §4 标注。

---

## 〇、PDF 关键发现（先看完这些再看后面）

### 0.1 接口形态

| | 现有（V3 WS `bidirection`） | **新增：声音复刻 HTTP** |
|---|---|---|
| 协议 | WebSocket（双向流） | **HTTP POST**（同步） |
| 用途 | 合成 | **训练 / 上传样本** |
| Endpoint | `wss://openspeech.bytedance.com/api/v3/tts/bidirection` | **`POST https://openspeech.bytedance.com/api/v3/tts/voice_clone`** |
| 鉴权头 | `X-Api-Key` + `X-Api-Resource-Id: seed-tts-2.0` | **`X-Api-Key` + `X-Api-Request-Id`**（**没有 `X-Api-Resource-Id` 头**） |
| 返回 | 多包音频帧 | **单包 JSON**，含训练最终状态 + demo 音频 |
| 异步/同步 | 同步（流式音频） | **同步**（一次 POST 即出训练结果，**无需后台轮询**） |

> ⭐ **关键性质 1**：声音复刻 HTTP 是**同步阻塞**接口，单次调用即可得到 `status=Success/Failed` 或 `status=Training`（后者表示要立刻重试）。**不需要后端轮询任务队列**，这跟我们 Phase 1 里设计的 async 状态机**完全相反** —— 要重写。

### 0.2 请求体

```jsonc
POST /api/v3/tts/voice_clone
Content-Type: application/json
X-Api-Key: <API Key>          // 控制台 → API Key管理
X-Api-Request-Id: <UUID>      // 客户端请求 ID（不是音色 ID！是"这一次请求"的 ID）
```

```jsonc
{
  "speaker_id": "custom_speaker_id",   // ⭐⭐⭐ 必须为固定值 `"custom_speaker_id"`
  "custom_speaker_id": "custom_zh_xxx",// ⭐⭐⭐ 用户自定义的音色代号（真正进 TTS 的 ID）
  "audio": {
    "format": "wav",                    // wav/mp3/ogg/m4a/aac/pcm（pcm 必传）
    "data":  "<base64 bytes>"           // 二进制音频做 base64 编码（注意不是 file upload）
  },
  "text": "样本对应的参考文本",          // 强建议给（WERError 45001109 是这个错）
  "language": 0,                        // 0=cn 1=en 2=ja 3=es ... （详见 §0.4）
  "extra_params": {
    "demo_text": "试听文本（4-300 字）",  // 训练完成后 demo 文本（≤ 300 字）
    "enable_audio_denoise": false,
    "disable_volume_normalization": false
  }
}
```

> ⭐ **关键性质 2**：`speaker_id` 字段在请求里是**固定值** `"custom_speaker_id"`（这是豆包约定的"复刻固定写法"），**真正决定音色的字段是 `custom_speaker_id`** —— 该值就是 TTS 时传 `speaker` 的 ID。Phase 1 文档里"speaker_id 是豆包侧 voice_id"是错的，**`custom_speaker_id` 才是**。

### 0.3 响应（同步返回）

```jsonc
{
  "code": 200,
  "message": "Success",
  "X-Tt-Logid": "log_id",
  "speaker_id": "custom_speaker_id",  // 注：返回的还是固定字段名 speaker_id，但 value 是 custom_speaker_id
  "available_training_times": 99,
  "create_time": 1700000000,
  "language": 0,
  "status": 2,                        // ⭐⭐⭐ 训练状态
  "speaker_status": [],
  "model_type": 5,                    // ⭐⭐⭐ 复刻 2.0 = 5（即与 seed-tts-2.0 同体系）
  "demo_audio": "<base64 mp3>"        // ⭐ Success 时返回，1 小时有效
}

// status 取值：
//   0 = NotFound
//   1 = Training（还在跑，立刻重试；亦有可能是网关排队）
//   2 = Success
//   3 = Failed
//   4 = Active（已被"转正"——发生首次合成，开始扣席位费）
```

> ⭐ **关键性质 3**：`status=1 (Training)` 是很少见的状态。绝大多数情况下，训练会在 **10 秒 ~ 数分钟** 内完成，单次 POST 就拿到 Success/Failed。`status=1` 重试策略：间隔 2s 一次，最多重试 3 次；仍为 1 视为 Failed。
>
> ⭐ **关键性质 4**：**`demo_audio` 仅在 status=2 或 4 时返回**，且 **1 小时有效** —— 设计上必须**入库后立即 base64 解码落盘**，不能依赖前端实时拉取。落盘的 mp3 可走 Next API 流回前端做"试听"。

### 0.4 language 枚举（远不止 zh/en/ja）

PDF 完整列出 20 个语种：`cn=0 / en=1 / ja=2 / es=3 / id=4 / pt=5 / de=6 / fr=7 / ko=8 / it=9 / th=10 / vi=11 / ru=12 / fil=13 / ms=14 / ar=15 / mx=16 / pt-br=17 / pl=19 / tr=20 / sv=21`（注意：18 跳号，别对齐）。

### 0.5 audio 字段硬约束

| 字段 | 约束 |
|---|---|
| 格式 | `wav / mp3 / ogg / m4a / aac / pcm` |
| **pcm 限制** | 仅支持 **24k 采样率、单通道**；不传 format 或 format 不对会爆 |
| 大小限制 | **≤ 10MB**（不是 Phase 1 误写的 8MB） |
| 编码 | **base64 inline** 到 JSON body 里（不是 multipart upload） |
| 缺失字段 | `pcm` / `m4a` **必须** 显式给 `format`；其他格式可不写 |

### 0.6 custom_speaker_id 命名硬约束

> 这是豆包最容易踩坑的地方，详细规则如下：

1. **字符集**：仅 `0-9 / a-z / A-Z / - / _`
2. **长度**：**8 ~ 256** 个字符
3. **首字符**：必须为英文字母
4. **首尾限制**：首末位不能是 `-` 或 `_`
5. **唯一性**：同 `accountID` 维度不可与已有 ID 重复
6. **官方防冲突正则**（命中即拒）：
   ```
   ^((?i:S_|ICL_|MIX_|DiT_|BV)|[a-z]{2}_|(?i:(wvae|moon|mercury|venus|earth|mars|jupiter|saturn|uranus|neptune|pluto|umm)_)).*  |  .*_(?i:bigtts|bigtts_cc|tob|cs_tob|streaming)$  |  ^[^a-zA-Z]  |  .*[-_]$  |  ^.{0,7}$  |  ^.{257,}$  |  .*[^a-zA-Z0-9_-].*
   ```
   拆开读：
   - 禁止前缀 `S_`、`ICL_`、`MIX_`、`DiT_`、`BV`（大小写不敏感）
   - 禁止前缀 `xx_`（任何两字母+下划线 —— 因此 `zh_` / `en_` / `ja_` 这类都被拦，是官方 preset 的命名空间）
   - 禁止前缀 `wvae/moon/mercury/venus/earth/mars/jupiter/saturn/uranus/neptune/pluto/umm`（planet 命名空间）
   - 禁止后缀 `_bigtts / _bigtts_cc / _tob / _cs_tob / _streaming`

### 0.7 "转正" 收费时刻（极其重要）

> ⚠️ PDF 原文：
> **"首次调用合成接口即视为'转正'并收取音色槽位费"**

含义：
- **训练本身**不收费
- **首次用克隆音色合成**（调 V3 WS TTS）= "转正"，**扣席位费**
- 业务侧因此**必须在转正前**保留"试听"路径（即用克隆音色合成试听文），但前端的"试听"按钮**可以**直接调 TTS 合成（因为这就是文档暗示的"试听"）

> 我们对"试听"的设计有两种选择，决定成本计费时机：
>
> **方案 A（推荐）**：让 `/v1/voice/clone/{id}/preview` 调 TTS 实际合成一段试听 —— **这会立即触发"转正"和扣费**。成本清晰，但每个克隆 color 必须先用「试听」收一席位费。
>
> **方案 B**：把 demo_audio 当试听，试听**不触发转正**，只有"设为业务可用"或真正用于视频生产时才转正。需要把 demo_audio 入库 24 小时或者更长。
>
> **建议**：**采纳方案 B（demo_audio = 试听）**，"试听 0 成本"，只在 "正式启用业务" / "绑定业务" 时才走 TTS，触发转正。这样和"音色席位"提示明确对应：用户先试听满意，再"启用业务"扣席位。

### 0.8 seed-tts-2.0 兼容性（关键回答）

> 用户原问题：「是否可以直接用于 seed-tts-2.0？」

**✅ 是，直接用。**

- 复刻接口响应里 `model_type=5` —— 表明克隆音色属于 **seed-tts-2.0 同体系**（不是 seed-icl-2.0 或 seed-mix-2.0 那种独立 resource）
- 现有 Voice Service 的 TTS 实现 `services/voice-service/app/providers/doubao.py:269-353` 把 `voice_id` 直接当 `req_params.speaker` 传给 V3 WS StartSession，**未做白名单校验**（这是关键）
- 因此：**`custom_speaker_id` 可直接作为 `voice_id` 喂给现有 `/v1/tts` 与 `/v1/tts/preview`**，TTS 资源沿用 `seed-tts-2.0`
- 不需要在客户端侧区分"preset 音色" vs "clone 音色"：上层只关心字符串

---

## 一、整体接入架构（结论先行）

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js (5015 之上)                                                  │
│                                                                      │
│  Browser  ─── fetch ───▶  /api/workspaces/[slug]/voices/clone/*      │
│                                │                                     │
│                                ▼                                     │
│                            鉴权 (voices:manage) + 写 voice_clones    │
│                                │                                     │
└────────────────────────────────┼─────────────────────────────────────┘
                                 │
                                 ▼ 内部直连（不走公网，无鉴权依赖）
┌──────────────────────────────────────────────────────────────────────┐
│  Voice Service (Python FastAPI :5015)                                 │
│                                                                      │
│  ─ 现有（不动）─                                                     │
│  GET  /v1/voices              # 9 preset                              │
│  GET  /v1/voices/all          # 全量 194 preset（分页）              │
│  POST /v1/tts                 # 合成 — 已可消费 cloned voice_id      │
│  GET  /v1/tts/preview         # 实时试听 — 已可消费 cloned voice_id  │
│                                                                      │
│  ─ 新增（Phase 3 实现）─                                             │
│  POST /v1/voice/clone/train                                          │
│       鉴权：app 内对 Next → 简单 trust；                              │
│       body: { sample_path, custom_speaker_id, language, text,         │
│               demo_text, audio_format, ... }                        │
│       调 豆包 POST /api/v3/tts/voice_clone                           │
│       返回 { speaker_id, status, model_type, demo_audio_path }       │
│                                                                      │
│  GET  /v1/voice/clone/{speaker_id}                                   │
│       调豆包同一接口（重训练 / 校正）  ；或保持占位（PDF 未列查询 API）│
│                                                                      │
│  DELETE /v1/voice/clone/{speaker_id}                                 │
│       PDF 未列。**待澄清二选一**：                                    │
│         (a) 复刻没有删除 API，对应 status=archived 走本地表中和       │
│         (b) 复用同一接口带 DELETE 试探（不推荐）                      │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ 调公网
                  https://openspeech.bytedance.com/api/v3/tts/voice_clone
                  （X-Api-Key + X-Api-Request-Id）
```

> 详细取舍见 §4 删除端点设计、§5 speaker_id 生命周期。

---

## 二、Voice Service 扩展位置（在 哪里 写代码）

### 2.1 新文件：`services/voice-service/app/providers/clone.py`

**职责**：
- 封装豆包复刻 HTTP 调用（请求构造、响应解析、demo_audio 落盘）
- **不**做 TTS —— TTS 走现有 `doubao.py`
- 与现有 `DoubaoVoiceProvider` 并列，不合并

```python
# services/voice-service/app/providers/clone.py
from __future__ import annotations

import base64
import enum
import os
import re
import uuid
from pathlib import Path
from dataclasses import dataclass

import httpx   # 新增依赖（见 §2.3）

CLONE_HTTP_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/voice_clone"

# custom_speaker_id 命名硬约束（详见 §0.6）
SPEAKER_ID_FORBIDDEN_PREFIX_SYSTEM = re.compile(r"^(?i:S_|ICL_|MIX_|DiT_|BV)")
SPEAKER_ID_FORBIDDEN_PREFIX_LANG    = re.compile(r"^[a-z]{2}_")
SPEAKER_ID_FORBIDDEN_PREFIX_PLANET  = re.compile(r"^(?i:wvae|moon|mercury|venus|earth|mars|jupiter|saturn|uranus|neptune|pluto|umm)_")
SPEAKER_ID_FORBIDDEN_SUFFIX        = re.compile(r"_(?i:bigtts|bigtts_cc|tob|cs_tob|streaming)$")
SPEAKER_ID_FORBIDDEN_CHARS         = re.compile(r"[^a-zA-Z0-9_-]")


class CloneStatus(int, enum.Enum):
    NOT_FOUND = 0
    TRAINING  = 1
    SUCCESS   = 2
    FAILED    = 3
    ACTIVE    = 4


@dataclass(frozen=True)
class CloneTrainResult:
    speaker_id: str           # custom_speaker_id（即返回里的 speaker_id 字段）
    status: CloneStatus
    model_type: int           # 5 = 复刻 2.0
    demo_audio_path: Path | None   # 已落盘（status=Success/Active 才有）
    available_training_times: int
    create_time: int
    language: int
    raw: dict


class DoubaoCloneProvider:
    """只负责训练 HTTP 调用，不动 TTS。"""

    provider = "doubao"

    def __init__(self, api_key: str | None = None):
        self.api_key = (
            api_key
            or os.getenv("DOUBAO_SPEECH_API_KEY", "").strip()
        )
        if not self.api_key:
            raise RuntimeError("DOUBAO_SPEECH_API_KEY is not set.")

    def train(
        self,
        *,
        sample_path: Path,
        sample_format: str,            # wav/mp3/ogg/m4a/aac/pcm
        custom_speaker_id: str,
        text: str,                     # 参考文本
        language: int,                 # 0..21
        demo_text: str = "你好，这是我的音色试听。",
        enable_audio_denoise: bool = False,
        disable_volume_normalization: bool = False,
        demo_output_dir: Path,
    ) -> CloneTrainResult:
        self._validate_speaker_id(custom_speaker_id)

        audio_b64 = base64.b64encode(sample_path.read_bytes()).decode("ascii")
        body = {
            "speaker_id": "custom_speaker_id",     # PDF §0.2：固定值
            "custom_speaker_id": custom_speaker_id,
            "audio": {"format": sample_format, "data": audio_b64},
            "text": text,
            "language": language,
            "extra_params": {
                "demo_text": demo_text,
                "enable_audio_denoise": enable_audio_denoise,
                "disable_volume_normalization": disable_volume_normalization,
            },
        }
        headers = {
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key,
            "X-Api-Request-Id": str(uuid.uuid4()),
        }

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(CLONE_HTTP_ENDPOINT, json=body, headers=headers)

        data = resp.json()
        result = self._parse_train_response(data, demo_output_dir, custom_speaker_id)
        return result

    def delete(self, custom_speaker_id: str) -> bool:
        """PDF 未给独立 DELETE 端点。当前策略：返回 True 表示"本地表逻辑删"，
        网关侧删除需要后续基于官方文档单独申请。详见 §4.2。"""
        ...

    @staticmethod
    def _validate_speaker_id(s: str) -> None:
        if not (8 <= len(s) <= 256):
            raise ValueError(f"speaker_id length must be 8-256, got {len(s)}")
        if not s[0].isalpha() or not s[0].isascii():
            raise ValueError("speaker_id must start with ASCII letter")
        if s.endswith("-") or s.endswith("_"):
            raise ValueError("speaker_id cannot end with - or _")
        if SPEAKER_ID_FORBIDDEN_CHARS.search(s):
            raise ValueError("speaker_id must contain only [a-zA-Z0-9_-]")
        for pat, msg in [
            (SPEAKER_ID_FORBIDDEN_PREFIX_SYSTEM, "speaker_id prefix collides with system voices"),
            (SPEAKER_ID_FORBIDDEN_PREFIX_LANG,   "speaker_id prefix collides with language namespace (xx_)"),
            (SPEAKER_ID_FORBIDDEN_PREFIX_PLANET, "speaker_id prefix collides with planet namespace"),
        ]:
            if pat.search(s):
                raise ValueError(msg)
        if SPEAKER_ID_FORBIDDEN_SUFFIX.search(s):
            raise ValueError("speaker_id suffix collides with official voice suffixes")
        # 占位 — 真正使用前再与官方正则源对照

    @staticmethod
    def _parse_train_response(payload: dict, demo_dir: Path, speaker_id: str) -> CloneTrainResult:
        status_value = payload.get("status", 0)
        try:
            status = CloneStatus(int(status_value))
        except ValueError:
            status = CloneStatus.FAILED

        demo_audio_path: Path | None = None
        demo_b64 = payload.get("demo_audio")
        if demo_b64 and status in {CloneStatus.SUCCESS, CloneStatus.ACTIVE}:
            demo_dir.mkdir(parents=True, exist_ok=True)
            ts = int(payload.get("create_time", 0)) or int(uuid.uuid4().int)
            demo_audio_path = demo_dir / f"{speaker_id}-{ts}.mp3"
            demo_audio_path.write_bytes(base64.b64decode(demo_b64))

        return CloneTrainResult(
            speaker_id=str(payload.get("speaker_id") or speaker_id),
            status=status,
            model_type=int(payload.get("model_type", 0)),
            demo_audio_path=demo_audio_path,
            available_training_times=int(payload.get("available_training_times", 0)),
            create_time=int(payload.get("create_time", 0)),
            language=int(payload.get("language", 0)),
            raw=payload,
        )
```

### 2.2 新文件 / 修改：`services/voice-service/app/main.py`

**追加**（不动现有任何代码）：

```python
class CloneTrainRequest(BaseModel):
    sample_path: str = Field(min_length=1)                # server-side absolute path
    sample_format: str = Field(pattern=r"^(wav|mp3|ogg|m4a|aac|pcm)$")
    custom_speaker_id: str = Field(min_length=8, max_length=256)
    text: str = Field(min_length=1, max_length=2000)       # 参考文本
    language: int = Field(ge=0, le=21)
    demo_text: str = Field(default="你好，这是我的音色试听。", min_length=4, max_length=300)
    enable_audio_denoise: bool = False
    disable_volume_normalization: bool = False


class CloneTrainResponse(BaseModel):
    speaker_id: str
    status: int          # 0..4
    status_label: str    # 'not_found' | 'training' | 'success' | 'failed' | 'active'
    model_type: int
    demo_audio_path: str | None
    available_training_times: int
    create_time: int
    language: int


# 新增端点（位置：放在 /v1/tts/preview 之后）
CLONE_DEMO_DIR = Path(
    os.getenv("VOICE_SERVICE_OUTPUT_DIR", "storage/voice-service/outputs")
) / "clone-demos"


@app.post("/v1/voice/clone/train", response_model=CloneTrainResponse)
def voice_clone_train(req: CloneTrainRequest):
    from .providers.clone import DoubaoCloneProvider, CloneStatus
    provider = DoubaoCloneProvider()
    sample = Path(req.sample_path)
    if not sample.exists():
        raise HTTPException(status_code=400, detail="sample_path not found")
    try:
        result = provider.train(
            sample_path=sample,
            sample_format=req.sample_format,
            custom_speaker_id=req.custom_speaker_id,
            text=req.text,
            language=req.language,
            demo_text=req.demo_text,
            enable_audio_denoise=req.enable_audio_denoise,
            disable_volume_normalization=req.disable_volume_normalization,
            demo_output_dir=CLONE_DEMO_DIR,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"clone upstream failed: {exc}") from exc

    return CloneTrainResponse(
        speaker_id=result.speaker_id,
        status=int(result.status),
        status_label=result.status.name.lower(),
        model_type=result.model_type,
        demo_audio_path=str(result.demo_audio_path.resolve()) if result.demo_audio_path else None,
        available_training_times=result.available_training_times,
        create_time=result.create_time,
        language=result.language,
    )


# 占位：用同一训练接口"重查询" 也用于状态对齐
@app.get("/v1/voice/clone/{speaker_id}", response_model=CloneTrainResponse)
def voice_clone_get(speaker_id: str):
    """PDF 未公开 GET 状态端点。Phase 3 占位：从本地 SQLite 表查。
       当前实现：返回 501，提示前端用本地缓存——因为接口是同步的，本来就不需要查。"""
    raise HTTPException(status_code=501, detail="voice clone status query is local-only; gateway has no separate GET endpoint per vendor doc")


@app.delete("/v1/voice/clone/{speaker_id}")
def voice_clone_delete(speaker_id: str):
    """PDF 未公开 DELETE 端点。当前策略：本地 archived 即可 ——
       火山引擎音色槽是付费资源，没有删除接口也合理（详见 §4.2）。"""
    raise HTTPException(status_code=501, detail="voice clone delete is local-only; vendor has no public DELETE endpoint per official PDF")
```

### 2.3 requirements.txt 新增

```txt
fastapi==0.116.1
uvicorn==0.35.0
pydantic==2.11.7
websockets==15.0.1
httpx==0.27.2        # ← 新增（同步 HTTP 客户端；FastAPI 生态标配）
```

> 不引 `requests` 是因为 httpx 自带 timeout、HTTP/2，且与 FastAPI 测试客户端一致。
> `httpx.Client`（同步）即可；**不**用 `AsyncClient` 因为复刻是低频 + 长阻塞，整体跑在 FastAPI 的 sync 路由里。

### 2.4 env 配置（不引入新环境变量）

复用现有 `data/.voice-service-env`：

```
DOUBAO_SPEECH_API_KEY=23b8575a-****-****-****-c57497ab9c2d
DOUBAO_SPEECH_RESOURCE_ID=seed-tts-2.0      # 仅 TTS 用，复刻不需要
DOUBAO_SPEECH_WS_ENDPOINT=wss://openspeech.bytedance.com/api/v3/tts/bidirection
DOUBAO_SPEECH_DEFAULT_VOICE=zh_male_...
```

> 复刻 HTTP 接口鉴权**不需要 resource_id**，只要 `X-Api-Key` 即可。无需新增 env 变量。如果未来按"训练/合成权限分开"需要独立 key，则再加 `DOUBAO_CLONE_API_KEY`。

---

## 三、custom_speaker_id 生成器（避免运营命名灾难）

### 3.1 算法

```python
# services/voice-service/app/providers/clone.py 附加
from hashlib import sha256

def generate_custom_speaker_id(*, user_id: str, display_name: str) -> str:
    """生成既合规又全局唯一的 custom_speaker_id。

    格式：zhclone_<workspace-slug>_<user-short>_<name-slug>_<random>
    例：   zhclone_entmedia_p7ng4_zhangzong_4f7a
    长度：≥ 32 char，远超 8 char 下限，远低于 256 char 上限
    """
    name_slug = re.sub(r"[^a-zA-Z0-9_-]+", "", display_name.lower())[:16] or "voice"
    name_slug = name_slug.lstrip("0123456789-_")  # 首字符必须是字母
    if not name_slug:
        name_slug = "voice"

    user_short = sha256(user_id.encode()).hexdigest()[:6]
    rand = sha256(uuid.uuid4().bytes).hexdigest()[:6]

    sid = f"zhclone_{user_short}_{name_slug}_{rand}"
    # 行内自检：第一次拿到时立即跑 _validate_speaker_id
    DoubaoCloneProvider._validate_speaker_id(sid)
    return sid
```

### 3.2 双重唯一性保证

| 保证 | 谁负责 |
|---|---|
| **豆包侧唯一**（同 accountID 维度）| 豆包正则拦截 + 我们 hash 拼装的字符本身就极难撞 |
| **本地不冲突** | `voice_clones` 表对 `custom_speaker_id` 加 unique index |
| **不撞官方 preset** | 行内 `_validate_speaker_id` 校验，撞名直接 400 |

### 3.3 不让用户手填的理由

- 命名规则对用户不直观（8~256 字符 + 不能撞 xx_/planet/_bigtts 等）
- 撞名要重新训练浪费一个克隆席位
- 由系统生成 + 用户仅输入 `display_name`，输出可读且**唯一**就能解决问题

---

## 四、新增 Python 接口设计

### 4.1 训练接口

```
POST /v1/voice/clone/train
Body (JSON):
{
  "sample_path":       "D:/.../storage/voice-service/clone-samples/<userId>/<id>.wav",
  "sample_format":     "wav|mp3|ogg|m4a|aac|pcm",
  "custom_speaker_id": "zhclone_xxx_xxx_xxx",     # 由 Next API 调生成器产出；不让前端传
  "text":              "<样本对应的参考文本>",     # 与样本语种一致；强建议给，否则 45001109 WERError
  "language":          0,                          # 0=cn 1=en 2=ja … 17=pt-br 19=pl 20=tr 21=sv
  "demo_text":         "你好，这是我的音色试听。",  # 4-300 字
  "enable_audio_denoise":         false,
  "disable_volume_normalization": false
}

Response (200):
{
  "speaker_id": "zhclone_xxx_xxx_xxx",           # 回传的就是 custom_speaker_id
  "status":         2,                          # 0..4（详见 §0.3）
  "status_label":   "success",                  # 字符串小写便于前端判断
  "model_type":     5,                          # 复刻 2.0
  "demo_audio_path":"D:/.../storage/voice-service/outputs/clone-demos/<sid>-<ts>.mp3",
  "available_training_times": 99,
  "create_time": 1700000000,
  "language": 0
}

Errors:
  400 { detail: "speaker_id length must be 8-256, got ..." }   # 命名不合规
  400 { detail: "sample_path not found" }
  400 { detail: "speaker_id prefix collides with ..." }
  502 { detail: "clone upstream failed: ..." }                  # 豆包侧失败（非映射为 4xx，估为上游问题）
  422 { detail: "返回 status=1 多次重试仍训练中" }                  # 在 fastapi 应用层短轮询后仍 Training
```

### 4.2 删除端点（**PDF 未列，先按"本地 archived"实现**）

> 这是 PDF 没给的部分 —— 把已知坑先写到设计里，避免实现时拉扯。

**已知信息**：文档只讲训练，没列查询、删除。我们向豆包支持团队发工单确认前，**不需要在生产侧阻塞**，因为：

- 火山引擎音色是付费资源，删除需走工单/人审是合理的；
- 本地 archived + `enabled_for_production=false` 已经能让用户"看不到"该音色；
- 即使豆包侧音色槽还在，**不再发起合成**就不触发"转正"扣费（除了训练本身的消耗，但本地表可记账）。

**Phase 3 实现**：

```
DELETE /v1/voice/clone/{speaker_id}
Response: 501 Not Implemented  （附带 message 引导前端走本地 archived）

或者更友好地：返回 200 + 标记 enabled_for_production=false、本地 status='archived'，
让豆包侧资源"沉睡"在账号下。
```

> 推荐：Phase 3 直接 501 + message，前端 AlertDialog 友好提示"音色已存档，不会被扣费；如需彻底释放请前往火山引擎控制台"。**不**做自动隐藏 — 因为用户可能有合规要求保留。
>
> 后续等豆包侧确认删除接口后再升级到真删。

### 4.3 状态查询端点（同上）

> PDF 没给 GET。我们也不需要：训练是同步的，单次 POST 即终态；状态机只存在于本地 DB（`voice_clones.status`）。

**Phase 3 实现**：501 + message，前端已经从 POST 响应得到 status，无需 GET。

---

## 五、speaker_id 生命周期（这是最重要的一节）

### 5.1 状态机

```
              Next API                    Python Voice Service                豆包 voice_clone HTTP
              ─────────                   ────────────────────                  ──────────────────────
[1] 上传样本
    multipart/form-data
    sample → storage/private/
                │
                ▼
[2] 校验 + 生成 custom_speaker_id
    ┌─────────────────────────┐
    │ name validation         │
    │ duration 5s..60s        │
    │ size ≤ 10MB             │
    │ format in whitelist     │
    │ consent checkbox == true │
    └─────────┬───────────────┘
              │
              ▼
[3] 插 voice_clones
    status='uploading'
              │
              ▼
[4] POST /v1/voice/clone/train  ────  转发至豆包  ─────►  同步返回
    { sample_path, custom_speaker_id, ... }                    status ∈ {2,3,4}（1 罕见）
              │
              ▼
[5] 根据上游 status 写回本地
    ┌─────────────────────────────────────────────┐
    │ status=2/4（Success/Active）                  │
    │   → voice_clones.status = 'ready'           │
    │   → provider_voice_id = response.speaker_id │
    │   → demo_audio 落盘（已完成）                 │
    │                                              │
    │ status=3（Failed）                            │
    │   → voice_clones.status = 'failed'           │
    │   → error_message = response.message         │
    │                                              │
    │ status=1（Training 罕见，3 次重试仍 1）       │
    │   → voice_clones.status = 'failed'           │
    │   → error_message = "训练超时"               │
    └─────────────────────────────────────────────┘
              │
              ▼
[6] 视图：返回给前端
    → Next API 立即返回 201/200 + voiceCloneRecord
```

### 5.2 与 V3 WS 合成的关系（首次合成触发转正）

```
用户开业务可用 enabled_for_production = true
                     │
                     ▼
        UPSERT voice_catalog row
        voice_type = custom_speaker_id
        voice_kind='cloned'
        enabled_for_production=true
                     │
                     ▼
        emitVoiceCatalogChanged()
                     │
                     ▼
        视频生产下拉框出现该音色 ←──── **此时还没调 TTS，没转正，没扣费**
                     │
                     ▼
        视频生产/话术 真去用该音色合成
                     │
                     ▼
        POST /v1/tts 或 /v1/tts/preview
        voice_id = custom_speaker_id
                     │
                     ▼
        V3 WS bidirection 调豆包
        req_params.speaker = custom_speaker_id
                     │
                     ▼
        ⚠️ 这一刻 = "转正" = 扣席位费
        response.status=4 (Active)
```

### 5.3 custom_speaker_id 在数据库中的归属

| 表 / 列 | 写入时机 |
|---|---|
| `voice_clones.custom_speaker_id` （新建字段名，本文档 §5.4 同步更新） | 训练 POST 时立即写入 |
| `voice_clones.provider_voice_id`（即响应里的 speaker_id 字段）| 训练 Success 后回写 |
| `voice_catalog.voice_type` (=custom_speaker_id) | 用户勾选"业务可用"时 UPSERT |
| `voice_catalog.voice_kind='cloned'` | 同上 |

> **同一个值在三处出现**：`voice_clones.custom_speaker_id` ↔ `voice_catalog.voice_type` ↔ V3 WS TTS 的 `speaker`。**这就是"克隆音色的唯一身份码"**。

### 5.4 与 Phase 1 设计的差异 & 修正

| Phase 1 文档 | 修正 |
|---|---|
| `voice_clones.provider_voice_id` = 豆包 voice_id | **改**：Phase 2 起，`voice_clones.custom_speaker_id` 才是真正的"豆包 voice_id"，`provider_voice_id` 同义 |
| `voice_clones.task_id` = 训练任务 ID | **删**：因为是同步接口，没有 task 概念 |
| `voice_clones.last_polled_at` | **删**：同上 |
| `voice_clones.status` enum | **保留 + 微调**：`draft / uploading / training / ready / failed / archived` 中的 `training` 仍保留（兼容罕见轮询场景），但绝大多数情况下 `uploading → ready/failed`，跳过 `training` |
| 音频大小限制 "8MB" | **改**：**10MB**（PDF 原文） |
| 异步轮询 / task_id 轮询器 | **删**：同步实现，不需要 |
| `setVoiceCloneStatus polling` | **删**：训练完成即 ready，不需要轮询 |

> 📌 这些修正将在 **Phase 3 实现数据库时一并 apply 到 schema**，本文档是 source of truth，先记录。

---

## 六、与 seed-tts-2.0 的关系（再强调一次，QA 关键）

### 6.1 通道复用

- **不复刻 2.0 单独 resource**：复刻接口 `model_type=5` 即"种子 → 合成 大模型 2.0 体系"
- **TTS 端点不变**：`wss://openspeech.bytedance.com/api/v3/tts/bidirection`，header 沿用 `seed-tts-2.0`
- **speaker 字段**：直接把 `custom_speaker_id` 作为 `speaker` 传给 V3 WS StartSession，无须额外配置

### 6.2 现有代码无需改动

`services/voice-service/app/providers/doubao.py:269-353` `_synthesize_websocket` 把 `voice_id` 直接塞进 `req_params.speaker`，**未做白名单**。所以：

- ✅ `/v1/tts` 接收克隆 voice_id 直接合成
- ✅ `/v1/tts/preview` 接收克隆 voice_id 直接合成试听
- ⚠ 但 **/v1/tts/preview 会触发"转正"**，见 §0.7 方案 B 决策（demo_audio = 试听）

> 因此 `/v1/tts/preview` 在 Phase 3 内**加白名单**：克隆音色走 `/v1/voice/clone/[id]/preview`（调 demo_audio），不走 `/v1/tts/preview`。代码改动很小（一个 if 判断），但能避免"试听触发转正"。

### 6.3 业务绑定时的合成路径

**用户勾选「业务可用」** → UPSERT voice_catalog → **用户用该音色合成视频** → 走现有 `/v1/tts`，speaker = custom_speaker_id → **这一刻才转正**。

```
voice_catalog.voice_type = custom_speaker_id
                        ↓
视频生产下拉框 (listEnabledVoices from voice-catalog.ts:37-147)
                        ↓
用户选该音色 → POST /api/.../automation/video-tasks
            → Next API 内部调 voice-service /v1/tts voice_id=...
                        ↓
V3 WS → 豆包 → 触发转正
```

---

## 七、Next.js 集成要点（不含前端组件，**仅 server 端**）

### 7.1 新增路由（与 Phase 1 一致，复审）

```
src/app/api/workspaces/[workspaceSlug]/voices/clone/
├── route.ts                    # POST 上传样本 + 创建；GET 列表
└── [voiceId]/
    ├── route.ts                # GET/PATCH/DELETE
    ├── preview/route.ts        # GET 试听（★ 走 demo_audio，**不**走 TTS）
    ├── default/route.ts        # POST 默认声音
    ├── enable/route.ts         # PATCH 业务可用（联动 voice_catalog）
    └── bind/route.ts           # POST 业务绑定（501）
```

### 7.2 POST `/api/.../voices/clone`（revised）

> 因为复刻是同步接口，POST 不需要异步任务管理，**实施就简**。

```ts
// Pseudocode
export async function POST(req: NextRequest, ctx) {
  await requireWorkspacePermission(ctx.params.workspaceSlug, 'voices:manage');

  const { audio, display_name, language, consent_signed, text, demo_text } =
    await req.formData();

  if (!consent_signed) return 400('CONSENT_REQUIRED');
  if (!isValidDisplayName(display_name)) return 400('INVALID_NAME');
  if (audio.size > 10 * 1024 * 1024) return 400('AUDIO_TOO_LARGE');
  if (audio.size < 1) return 400('AUDIO_EMPTY');

  // 1. 落盘到 storage/voice-service/clone-samples/<userId>/<uuid>.<ext>
  const samplePath = await persistSample(audio, userId);

  // 2. 生成 custom_speaker_id
  const sid = generateCustomSpeakerId({ userId, displayName: display_name });

  // 3. 插 voice_clones（status='uploading'）
  await db.insert(voiceClones).values({ id: uuid(), customSpeakerId: sid, status: 'uploading', ... });

  // 4. 调 voice-service /v1/voice/clone/train
  const trainResp = await fetch(`${VOICE_SERVICE_URL}/v1/voice/clone/train`, {
    method: 'POST',
    body: JSON.stringify({
      sample_path: samplePath,
      sample_format: inferFormat(audio),
      custom_speaker_id: sid,
      text,           // 由前端从样本音频一并提交
      language: languageToInt(language),  // 0=cn 1=en 2=ja ...
      demo_text,
    })
  });

  const result = await trainResp.json();

  // 5. 根据 status 写回 voice_clones
  if (result.status === 2 || result.status === 4) {
    await db.update(voiceClones).set({
      status: 'ready',
      providerVoiceId: result.speaker_id,
      demoAudioPath: result.demo_audio_path,
      lastTrainedAt: new Date(),
    }).where(eq(voiceClones.id, cloneId));
    return 201({ id, status: 'ready', ... });
  } else {
    await db.update(voiceClones).set({
      status: 'failed',
      errorMessage: result.message,
    }).where(eq(voiceClones.id, cloneId));
    return 502({ error: 'CLONE_FAILED', message: result.message });
  }
}
```

### 7.3 GET `/api/.../voices/clone/[voiceId]/preview`（**走 demo_audio，不触发转正**）

```ts
export async function GET(req: NextRequest, ctx) {
  await requireWorkspacePermission(ctx.params.workspaceSlug, 'workspace:view');
  const clone = await getVoiceClone(ctx.params.voiceId);
  if (!clone.demoAudioPath || !fs.existsSync(clone.demoAudioPath)) {
    return 404({ error: 'NO_DEMO' });
  }
  // 直接流文件
  return new Response(fs.readFileSync(clone.demoAudioPath), {
    headers: { 'Content-Type': 'audio/mpeg' }
  });
}
```

> 重点：**预览走 demo_audio 文件流**（从训练拿到的、被豆包生成的试听）—— **不会触发"转正"**；真正合成才走 `/v1/tts` 触发转正。**这是 Phase 1 文档里没明确的关键决策**，本节补上。

### 7.4 DELETE `/api/.../voices/clone/[voiceId]`

```ts
export async function DELETE(req: NextRequest, ctx) {
  await requireWorkspacePermission(...);
  const clone = await getVoiceClone(ctx.params.voiceId);
  // 1. 本地 archived
  await db.update(voiceClones).set({
    status: 'archived',
    enabledForProduction: false,
  }).where(eq(voiceClones.id, clone.id));

  // 2. voice_catalog 反向 disabled
  if (clone.voiceCatalogVoiceType) {
    await db.update(voiceCatalog)
      .set({ enabledForProduction: false })
      .where(eq(voiceCatalog.voiceType, clone.voiceCatalogVoiceType));
    emitVoiceCatalogChanged();
  }

  // 3. 调 voice-service /v1/voice/clone/[sid] DELETE
  //    当前为 501 —— 仅兜底（保留豆包侧资源，本地屏蔽即可）
  await fetch(`${VOICE_SERVICE_URL}/v1/voice/clone/${clone.customSpeakerId}`, {
    method: 'DELETE',
  }).catch(() => null);

  return 204;
}
```

---

## 八、上线检查（实施阶段用）

- [ ] `requirements.txt` 加入 `httpx==0.27.2`
- [ ] `python -m pip install -r services/voice-service/requirements.txt` 通
- [ ] `services/voice-service/app/providers/clone.py` 实现 + 单元测试
- [ ] `custom_speaker_id` 命名生成器自测：拒绝 `zh_test` / `S_zzz` / `zhclone_xxx_bigtts`
- [ ] `POST /v1/voice/clone/train` curl 通，用一段 30s wav 自测
  - [ ] status=2 返回 demo_audio 落盘
  - [ ] status=3 错误结构可读
  - [ ] status=1 重试 3 次逻辑
- [ ] `voice-service` 502 时 Next API 友好降级（502 + message）
- [ ] `GET /v1/tts/preview` **不**接收克隆 voice_id（加白名单），克隆走 `/api/.../clone/[id]/preview`
- [ ] 全链路 E2E：浏览器 → 上传 30s wav → 训练 → 试听 → 启用业务 → 视频生产选该音色合成 → 验证扣席位（看火山控制台）
- [ ] 音色槽用满时（已克隆 3 个）锁定新建按钮 → 提示删除

---

## 九、风险与待澄清

| 序号 | 风险 | 措施 |
|---|---|---|
| R1 | PDF 没给 DELETE / GET 端点 | 当前实现 501；待官方补充后再升级 |
| R2 | 长样本（30s 24k wav 单声道 ≈ 1.4MB）< 10MB 通过；立体声 30s ≈ 2.8MB；前端硬限制 30s / 8MB 留缓冲 | 前端校验 + 后端兜底 |
| R3 | "转正"发生时机（首次 TTS 调用）不是文档 100% 明确 | Phase 3 用 1 个 trial 克隆合成一次验证；观察火山控制台计费 |
| R4 | `available_training_times` 是账号维度计数，不是 workspace 维度 | UI 显示"账户内还剩 N 次"；不要做 workspace 级配额 |
| R5 | 命名正则 PDF 给得很含糊（`(?i:...)` Go 风格），Python 转写要逐项对照测试 | 在生成器上挂 60+ 单元测试，覆盖：① 全前缀类、② 全后缀类、③ 长度边缘、④ 字符边界 |
| R6 | `text` 不传会 45001109 WERError 失败；前端必须保证参考文本与样本内容一致 | 录制上传前**引导**用户填写参考文本；上传时显示"请确认与音频一致" |
| R7 | language 列表 18 跳号（pl=19 直接到 tr=20），前端实现别对齐 | 后端 enum 仍然跳号；前端 Select 用 `{ value: 'pl', label: '波兰语' }` 显式映射 |
| R8 | audio pcm 必须 24k 单通道，不符合自动 fallback；项目当前 MediaRecorder 默认不输出 pcm | 前端就用 wav/m4a；后端不强求 pcm |
| R9 | `demo_audio` 1 小时有效，但已落盘即与官方时效脱钩 | 落盘后用本地缓存，无须再拉官方 |
| R10 | 火山账号是否开通了"复刻"权限未知（PDF 是开发文档，开通是商务侧独立操作） | Phase 3 上线前调用方先确认生产环境 X-Api-Key 所属账号已开通复刻权限 |

---

## 十、相关文件变更清单

```
+ services/voice-service/app/providers/clone.py        # 新建
+ services/voice-service/tests/test_clone_provider.py  # 新建（生成器 + 解析）
M services/voice-service/app/main.py                  # +3 路由（train 1 个实做 + get/delete 501 占位）
M services/voice-service/requirements.txt              # +httpx==0.27.2

M src/app/api/workspaces/[workspaceSlug]/voices/clone/route.ts              # POST 创建改同步实现
M src/app/api/workspaces/[workspaceSlug]/voices/clone/[voiceId]/preview/route.ts  # 走 demo_audio
M src/app/api/workspaces/[workspaceSlug]/voices/clone/[voiceId]/route.ts     # DELETE 改为本地 archived
+ src/lib/voice-clone/speaker-id.ts           # custom_speaker_id 生成器（也可放 server-only lib）
+ src/lib/voice-clone/clone-language.ts       # zh-cn/en-US/ja-JP → 0/1/2（前端 ↔ 后端 enum 映射）

M src/lib/db/schema.ts                        # voice_clones 字段按 §5.4 修正（删 task_id/last_polled_at，
                                                字段名 provider_voice_id → custom_speaker_id 作为别名，
                                                audio 大小限制由代码层面（非 DB）保证）

M scripts/_phase3_acceptance_notes.md         # 新建 acceptance script 笔记
```

---

文档版本 v0.1（接入专项），与 `docs/知衡语音-声音复刻-设计方案.md`（Phase 1 总方案）配套阅读。Phase 3 实施以本文件为准。
