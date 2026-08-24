from __future__ import annotations

import base64
import asyncio
import enum
import io
import json
import os
import struct
import uuid
from pathlib import Path

import websockets

from .base import VoiceSynthesisResult


DEFAULT_WS_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/tts/bidirection"
DEFAULT_RESOURCE_ID = "seed-tts-2.0"
DEFAULT_VOICE_ID = "zh_male_guanggaojieshuo_uranus_bigtts"
DEFAULT_SAMPLE_RATE = 24000


class MsgType(enum.IntEnum):
    FullClientRequest = 0b1
    FullServerResponse = 0b1001
    AudioOnlyServer = 0b1011
    Error = 0b1111


class MsgTypeFlag(enum.IntEnum):
    NoSeq = 0
    PositiveSeq = 0b1
    LastNoSeq = 0b10
    NegativeSeq = 0b11
    WithEvent = 0b100


class EventType(enum.IntEnum):
    StartConnection = 1
    ConnectionStarted = 50
    ConnectionFailed = 51
    StartSession = 100
    FinishSession = 102
    SessionStarted = 150
    SessionFinished = 152
    SessionFailed = 153
    SessionCanceled = 151
    TaskRequest = 200
    TTSSentenceStart = 350
    TTSSentenceEnd = 351
    TTSResponse = 352


class TTSWebSocketMessage:
    def __init__(
        self,
        *,
        msg_type: MsgType,
        flag: MsgTypeFlag = MsgTypeFlag.WithEvent,
        event: EventType | int = 0,
        session_id: str = "",
        connect_id: str = "",
        sequence: int = 0,
        error_code: int = 0,
        payload: bytes = b"",
    ) -> None:
        self.msg_type = msg_type
        self.flag = flag
        self.event = event
        self.session_id = session_id
        self.connect_id = connect_id
        self.sequence = sequence
        self.error_code = error_code
        self.payload = payload

    def marshal(self) -> bytes:
        buffer = io.BytesIO()
        buffer.write(bytes([(1 << 4) | 1, (self.msg_type << 4) | self.flag, 1 << 4, 0]))
        if self.flag == MsgTypeFlag.WithEvent:
            buffer.write(struct.pack(">i", int(self.event)))
            if self.event not in {
                EventType.StartConnection,
                EventType.ConnectionStarted,
                EventType.ConnectionFailed,
            }:
                session_id_bytes = self.session_id.encode("utf-8")
                buffer.write(struct.pack(">I", len(session_id_bytes)))
                buffer.write(session_id_bytes)
        elif self.flag in {MsgTypeFlag.PositiveSeq, MsgTypeFlag.NegativeSeq}:
            buffer.write(struct.pack(">i", self.sequence))
        if self.msg_type == MsgType.Error:
            buffer.write(struct.pack(">I", self.error_code))
        buffer.write(struct.pack(">I", len(self.payload)))
        buffer.write(self.payload)
        return buffer.getvalue()

    @classmethod
    def from_bytes(cls, data: bytes) -> "TTSWebSocketMessage":
        if len(data) < 4:
            raise ValueError("Doubao TTS websocket response is too short.")
        msg_type = MsgType(data[1] >> 4)
        flag = MsgTypeFlag(data[1] & 0b1111)
        buffer = io.BytesIO(data)
        header = buffer.read(4)
        header_size = (header[0] & 0b1111) * 4
        if header_size > 4:
            buffer.read(header_size - 4)

        event: EventType | int = 0
        session_id = ""
        connect_id = ""
        sequence = 0
        error_code = 0

        if msg_type == MsgType.Error:
            code_bytes = buffer.read(4)
            if code_bytes:
                error_code = struct.unpack(">I", code_bytes)[0]

        if msg_type in {
            MsgType.FullClientRequest,
            MsgType.FullServerResponse,
            MsgType.AudioOnlyServer,
        } and flag in {MsgTypeFlag.PositiveSeq, MsgTypeFlag.NegativeSeq}:
            sequence_bytes = buffer.read(4)
            if sequence_bytes:
                sequence = struct.unpack(">i", sequence_bytes)[0]

        if flag == MsgTypeFlag.WithEvent:
            event_value = struct.unpack(">i", buffer.read(4))[0]
            try:
                event = EventType(event_value)
            except ValueError:
                event = event_value

            if event not in {
                EventType.StartConnection,
                EventType.ConnectionStarted,
                EventType.ConnectionFailed,
            }:
                session_size_bytes = buffer.read(4)
                if session_size_bytes:
                    session_size = struct.unpack(">I", session_size_bytes)[0]
                    if session_size:
                        session_id = buffer.read(session_size).decode("utf-8", errors="replace")

            if event in {EventType.ConnectionStarted, EventType.ConnectionFailed}:
                connect_size_bytes = buffer.read(4)
                if connect_size_bytes:
                    connect_size = struct.unpack(">I", connect_size_bytes)[0]
                    if connect_size:
                        connect_id = buffer.read(connect_size).decode("utf-8", errors="replace")

        payload = b""
        size_bytes = buffer.read(4)
        if size_bytes:
            size = struct.unpack(">I", size_bytes)[0]
            if size:
                payload = buffer.read(size)

        return cls(
            msg_type=msg_type,
            flag=flag,
            event=event,
            session_id=session_id,
            connect_id=connect_id,
            sequence=sequence,
            error_code=error_code,
            payload=payload,
        )

    def payload_json(self) -> object | None:
        if not self.payload:
            return None
        try:
            return json.loads(self.payload.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            return self.payload.decode("utf-8", errors="replace")


class DoubaoVoiceProvider:
    provider = "doubao"

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
        api_key = os.getenv("DOUBAO_SPEECH_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("DOUBAO_SPEECH_API_KEY is not set. Configure Volcengine Doubao TTS before generating audio.")

        resource_id = os.getenv("DOUBAO_SPEECH_RESOURCE_ID", DEFAULT_RESOURCE_ID).strip()
        endpoint = os.getenv("DOUBAO_SPEECH_WS_ENDPOINT", DEFAULT_WS_ENDPOINT).strip()
        provider_voice_id = (
            voice_id
            if voice_id and voice_id not in {"auto", "default"}
            else os.getenv("DOUBAO_SPEECH_DEFAULT_VOICE", DEFAULT_VOICE_ID).strip()
        )
        if not provider_voice_id:
            provider_voice_id = DEFAULT_VOICE_ID

        request_id = str(uuid.uuid4())
        try:
            audio_bytes = self._run_websocket_synthesis(
                endpoint=endpoint,
                api_key=api_key,
                resource_id=resource_id,
                text=text,
                provider_voice_id=provider_voice_id,
                speed=speed,
                volume=volume,
            )
        except Exception as exc:
            raise RuntimeError(f"Doubao TTS websocket failed: {exc}") from exc

        output_dir.mkdir(parents=True, exist_ok=True)
        audio_path = output_dir / f"doubao-{request_id}.mp3"
        audio_path.write_bytes(audio_bytes)

        return VoiceSynthesisResult(
            audio_path=audio_path,
            format="mp3",
            mime_type="audio/mpeg",
            provider=self.provider,
            provider_voice_id=provider_voice_id,
        )

    @staticmethod
    def _speech_rate(speed: float) -> int:
        clamped = max(0.5, min(2.0, speed))
        return max(-50, min(100, int(round((clamped - 1.0) * 100))))

    @staticmethod
    def _loudness_rate(volume: float) -> int:
        clamped = max(0.0, min(2.0, volume))
        return max(-50, min(100, int(round((clamped - 1.0) * 100))))

    def _run_websocket_synthesis(
        self,
        *,
        endpoint: str,
        api_key: str,
        resource_id: str,
        text: str,
        provider_voice_id: str,
        speed: float,
        volume: float,
    ) -> bytes:
        return asyncio.run(
            self._synthesize_websocket(
                endpoint=endpoint,
                api_key=api_key,
                resource_id=resource_id,
                text=text,
                provider_voice_id=provider_voice_id,
                speed=speed,
                volume=volume,
            )
        )

    async def _synthesize_websocket(
        self,
        *,
        endpoint: str,
        api_key: str,
        resource_id: str,
        text: str,
        provider_voice_id: str,
        speed: float,
        volume: float,
    ) -> bytes:
        session_id = str(uuid.uuid4())
        audio = bytearray()
        headers = {
            "X-Api-Key": api_key,
            "X-Api-Resource-Id": resource_id,
        }

        async with websockets.connect(
            endpoint,
            additional_headers=headers,
            max_size=20 * 1024 * 1024,
            ping_interval=None,
            open_timeout=30,
            close_timeout=10,
        ) as websocket:
            await self._send_event(websocket, EventType.StartConnection, {})
            message = await self._receive_expected(websocket, EventType.ConnectionStarted)
            if message.event != EventType.ConnectionStarted:
                raise RuntimeError(f"connection failed: {message.payload_json()}")

            start_payload = {
                "user": {"uid": os.getenv("DOUBAO_SPEECH_USER_ID", "zhiheng-zhiqi")},
                "event": int(EventType.StartSession),
                "req_params": {
                    "speaker": provider_voice_id,
                    "audio_params": {
                        "format": "mp3",
                        "sample_rate": DEFAULT_SAMPLE_RATE,
                        "speech_rate": self._speech_rate(speed),
                        "loudness_rate": self._loudness_rate(volume),
                    },
                },
            }
            await self._send_event(websocket, EventType.StartSession, start_payload, session_id)
            message = await self._receive_expected(websocket, EventType.SessionStarted)
            if message.event != EventType.SessionStarted:
                raise RuntimeError(f"session failed: {message.payload_json()}")

            task_payload = {
                "user": {"uid": os.getenv("DOUBAO_SPEECH_USER_ID", "zhiheng-zhiqi")},
                "event": int(EventType.TaskRequest),
                "req_params": {"text": text},
            }
            await self._send_event(websocket, EventType.TaskRequest, task_payload, session_id)
            await self._send_event(websocket, EventType.FinishSession, {}, session_id)

            while True:
                message = await self._receive_message(websocket)
                if message.msg_type == MsgType.AudioOnlyServer and message.payload:
                    audio.extend(message.payload)
                elif message.event == EventType.TTSResponse:
                    payload = message.payload_json()
                    if isinstance(payload, dict):
                        encoded_audio = payload.get("data") or payload.get("audio")
                        if isinstance(encoded_audio, str) and encoded_audio:
                            audio.extend(base64.b64decode(encoded_audio))
                    elif message.payload:
                        audio.extend(message.payload)
                elif message.event == EventType.SessionFinished:
                    break
                elif message.event in {
                    EventType.ConnectionFailed,
                    EventType.SessionFailed,
                    EventType.SessionCanceled,
                }:
                    raise RuntimeError(
                        f"{getattr(message.event, 'name', message.event)}: {message.payload_json()}"
                    )
                elif message.msg_type == MsgType.Error:
                    raise RuntimeError(f"server error {message.error_code}: {message.payload_json()}")

        if not audio:
            raise RuntimeError("Doubao TTS websocket returned no audio data.")
        return bytes(audio)

    async def _send_event(
        self,
        websocket: websockets.ClientConnection,
        event: EventType,
        payload: dict,
        session_id: str = "",
    ) -> None:
        message = TTSWebSocketMessage(
            msg_type=MsgType.FullClientRequest,
            flag=MsgTypeFlag.WithEvent,
            event=event,
            session_id=session_id,
            payload=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        )
        await websocket.send(message.marshal())

    async def _receive_message(self, websocket: websockets.ClientConnection) -> TTSWebSocketMessage:
        data = await asyncio.wait_for(websocket.recv(), timeout=120)
        if not isinstance(data, bytes):
            raise RuntimeError(f"unexpected websocket text response: {data}")
        return TTSWebSocketMessage.from_bytes(data)

    async def _receive_expected(
        self,
        websocket: websockets.ClientConnection,
        expected_event: EventType,
    ) -> TTSWebSocketMessage:
        message = await self._receive_message(websocket)
        if message.event in {EventType.ConnectionFailed, EventType.SessionFailed}:
            raise RuntimeError(f"{getattr(message.event, 'name', message.event)}: {message.payload_json()}")
        if message.event != expected_event:
            raise RuntimeError(
                f"expected {expected_event.name}, got {getattr(message.event, 'name', message.event)}: {message.payload_json()}"
            )
        return message
