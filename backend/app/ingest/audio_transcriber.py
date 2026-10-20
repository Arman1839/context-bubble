"""
Audio transcription session.
Manages a live WebSocket audio stream from a browser participant.

Transcription pipeline:
  1. AssemblyAI Real-Time streaming WebSocket — low latency (~1-2s), runs concurrently
     while the user is speaking. Partial results appear immediately.
  2. AssemblyAI batch upload — used for the final high-accuracy pass if real-time fails.
  3. Gemini multimodal — final fallback.
"""
import asyncio
import io
import base64
import json
import time
from typing import Optional
from fastapi import WebSocket
from app.core.firestore_compat import firestore

from app.core.config import settings
from app.core.logging import logger
from app.intelligence.stream_manager import stream_manager
from app.rag.pipeline import RAGPipeline
from app.llm.base import LLMAdapter


ASSEMBLYAI_RT_URL = "wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&encoding=pcm_s16le"


class AudioTranscriptionSession:
    """
    Bridges the browser WebSocket (sending WebM/Opus chunks) to
    AssemblyAI real-time streaming for fast, live transcription.
    """

    def __init__(
        self,
        websocket: WebSocket,
        bubble_id: str,
        user_id: str,
        user_name: str,
        db: firestore.AsyncClient,
        llm: LLMAdapter,
    ):
        self.ws = websocket
        self.bubble_id = bubble_id
        self.user_id = user_id
        self.user_name = user_name
        self.db = db
        self.llm = llm
        self.rag = RAGPipeline(db, llm)
        self._audio_buffer = bytearray()   # full recording for batch fallback
        self._is_active = True
        self._partial_texts: list[str] = []  # accumulates real-time partials

    async def handle_stream(self):
        await self.ws.accept()
        logger.info(f"Audio session started for user={self.user_id} bubble={self.bubble_id}")

        # Try to open AssemblyAI real-time connection in parallel
        aai_task: Optional[asyncio.Task] = None
        pcm_queue: Optional[asyncio.Queue] = None

        if settings.ASSEMBLYAI_API_KEY:
            pcm_queue = asyncio.Queue()
            aai_task = asyncio.create_task(
                self._assemblyai_realtime(pcm_queue)
            )

        try:
            last_heartbeat = time.time()

            while self._is_active:
                message = await self.ws.receive()

                if "bytes" in message and message["bytes"]:
                    chunk = message["bytes"]
                    self._audio_buffer.extend(chunk)

                    # If we have AssemblyAI real-time, send PCM-converted chunk
                    if pcm_queue is not None:
                        await pcm_queue.put(chunk)

                    # Heartbeat every 3s so the client knows we're alive
                    now = time.time()
                    if now - last_heartbeat >= 3.0:
                        last_heartbeat = now
                        try:
                            await self.ws.send_json({
                                "type": "partial",
                                "speaker": self.user_name,
                                "text": f"Listening… ({len(self._audio_buffer) // 1024} KB)",
                            })
                        except Exception:
                            pass

                elif "text" in message and message["text"]:
                    data = message["text"]
                    if data == "END_SPEECH" or '"action":"stop"' in data:
                        await self._finalize(pcm_queue, aai_task)

        except Exception as e:
            logger.info(f"Audio stream closed for user={self.user_id}: {e}")
        finally:
            if self._audio_buffer:
                try:
                    await self._finalize(pcm_queue, aai_task)
                except Exception:
                    pass

    async def _assemblyai_realtime(self, pcm_queue: asyncio.Queue):
        """
        Connects to AssemblyAI real-time WebSocket and forwards PCM audio chunks.
        Sends partial transcripts back to the browser as they arrive.
        """
        try:
            import websockets as ws_lib
        except ImportError:
            logger.warning("websockets package not available for AssemblyAI real-time")
            return

        api_key = settings.ASSEMBLYAI_API_KEY
        url = f"{ASSEMBLYAI_RT_URL}"

        try:
            async with ws_lib.connect(
                url,
                extra_headers={"Authorization": api_key},
                ping_interval=5,
                ping_timeout=20,
            ) as aai_ws:
                logger.info("AssemblyAI real-time WebSocket connected")

                async def send_audio():
                    """Forward audio chunks from queue to AssemblyAI."""
                    while True:
                        chunk = await pcm_queue.get()
                        if chunk is None:
                            break
                        try:
                            # AssemblyAI real-time expects base64-encoded PCM
                            encoded = base64.b64encode(chunk).decode("utf-8")
                            await aai_ws.send(json.dumps({"audio_data": encoded}))
                        except Exception as e:
                            logger.debug(f"AssemblyAI send error: {e}")
                            break

                async def receive_transcripts():
                    """Receive transcript events and forward partials to browser."""
                    async for raw_msg in aai_ws:
                        try:
                            msg = json.loads(raw_msg)
                            msg_type = msg.get("message_type")

                            if msg_type == "PartialTranscript":
                                text = msg.get("text", "").strip()
                                if text:
                                    self._partial_texts.append(text)
                                    try:
                                        await self.ws.send_json({
                                            "type": "partial",
                                            "speaker": self.user_name,
                                            "text": text,
                                        })
                                    except Exception:
                                        pass

                            elif msg_type == "FinalTranscript":
                                text = msg.get("text", "").strip()
                                if text:
                                    # Keep the best final text
                                    self._partial_texts.append(f"[FINAL:{text}]")

                        except Exception:
                            pass

                # Run send and receive concurrently
                await asyncio.gather(send_audio(), receive_transcripts())

        except Exception as e:
            logger.warning(f"AssemblyAI real-time connection failed: {e}")

    async def _finalize(
        self,
        pcm_queue: Optional[asyncio.Queue],
        aai_task: Optional[asyncio.Task],
    ):
        if not self._audio_buffer:
            return

        raw_bytes = bytes(self._audio_buffer)
        self._audio_buffer.clear()

        # Stop the real-time stream
        if pcm_queue:
            await pcm_queue.put(None)  # sentinel to stop send_audio loop
        if aai_task and not aai_task.done():
            await asyncio.wait_for(asyncio.shield(aai_task), timeout=3.0)

        # Signal to the client that we're transcribing
        try:
            await self.ws.send_json({
                "type": "partial",
                "speaker": self.user_name,
                "text": "Finalising transcription…",
            })
        except Exception:
            pass

        # Extract best transcript from real-time results
        final_text = self._extract_best_transcript()

        # If real-time gave nothing useful, fall back to batch
        if not final_text:
            final_text = await self._transcribe_batch(raw_bytes)

        final_text = (final_text or "").strip()

        # Send final result to the browser
        try:
            await self.ws.send_json({
                "type": "final",
                "speaker": self.user_name,
                "text": final_text,
            })
        except Exception as e:
            logger.warning(f"Failed to send final transcript: {e}")
            return

        if not final_text:
            return

        # Persist to Firestore as a user contribution
        contrib_ref = (
            self.db.collection("bubbles")
            .document(self.bubble_id)
            .collection("contributions")
            .document()
        )
        await contrib_ref.set({
            "id": contrib_ref.id,
            "bubble_id": self.bubble_id,
            "author_id": self.user_id,
            "author_name": self.user_name,
            "is_anonymous": False,
            "text": final_text,
            "source_type": "voice_transcript",
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        # Index in RAG
        await self.rag.ingest_and_index(
            bubble_id=self.bubble_id,
            source_id=contrib_ref.id,
            text=final_text,
            extra_metadata={"speaker": self.user_name, "type": "voice"},
        )

        # Broadcast to SSE so other participants see it immediately
        await stream_manager.broadcast(
            bubble_id=self.bubble_id,
            event_type="message",
            data={
                "id": contrib_ref.id,
                "bubble_id": self.bubble_id,
                "seq": 0,
                "type": "user",
                "author_id": self.user_id,
                "author_name": self.user_name,
                "author_avatar": f"https://api.dicebear.com/9.x/notionists/svg?seed={self.user_id}",
                "is_anonymous": False,
                "text": final_text,
                "created_at": firestore.SERVER_TIMESTAMP,
            },
        )

        logger.info(f"Voice transcript saved for user={self.user_id}: {final_text[:80]}")

    def _extract_best_transcript(self) -> str:
        """
        Extract the best transcript from the real-time partial accumulation.
        Prefer the last FINAL transcript, then fall back to the last partial.
        """
        finals = [t[7:-1] for t in self._partial_texts if t.startswith("[FINAL:")]
        if finals:
            # Join all final segments (AssemblyAI sends one per utterance)
            return " ".join(finals).strip()

        # Fall back to the last partial (most complete)
        partials = [t for t in self._partial_texts if not t.startswith("[FINAL:")]
        if partials:
            return partials[-1].strip()

        return ""

    async def _transcribe_batch(self, audio_data: bytes) -> str:
        """Batch transcription fallback: AssemblyAI REST → Gemini multimodal."""
        import io as _io, wave

        # Detect / normalise audio
        mime_type = "audio/webm"
        if audio_data.startswith(b"RIFF"):
            mime_type = "audio/wav"
        elif audio_data.startswith(b"OggS"):
            mime_type = "audio/ogg"
        elif audio_data.startswith(b"ID3") or audio_data.startswith(b"\xff\xfb"):
            mime_type = "audio/mp3"
        elif not audio_data.startswith(b"\x1aE\xdf\xa3"):
            # Raw PCM → wrap in WAV
            buf = _io.BytesIO()
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(audio_data)
            audio_data = buf.getvalue()
            mime_type = "audio/wav"

        # 1. Fast Gemini multimodal audio transcription (takes ~1-2s)
        client = getattr(self.llm, "_client", None)
        if not client and hasattr(self.llm, "primary"):
            client = getattr(self.llm.primary, "_client", None)
        model = getattr(self.llm, "_model_name", None) or getattr(getattr(self.llm, "primary", None), "_model_name", "gemini-flash-lite-latest")
        if client and hasattr(client, "aio"):
            try:
                from google.genai import types  # pyrefly: ignore[missing-import]
                part = types.Part.from_bytes(data=audio_data, mime_type=mime_type)
                resp = await client.aio.models.generate_content(
                    model=model,
                    contents=[part, "Transcribe the spoken audio accurately. Output ONLY the transcribed speech. Do not add any extra explanations, notes, or timestamps."],
                )
                txt = (resp.text or "").strip()
                if txt and txt.upper() != "SILENCE":
                    return txt
            except Exception as e:
                logger.warning(f"Fast Gemini audio transcription failed, trying AssemblyAI: {e}")

        # 2. Secondary fallback: AssemblyAI batch (with rapid 0.5s polling)
        if settings.ASSEMBLYAI_API_KEY:
            try:
                import httpx
                api_key = settings.ASSEMBLYAI_API_KEY
                headers = {"authorization": api_key}
                base = "https://api.assemblyai.com/v2"
                async with httpx.AsyncClient(timeout=30) as c:
                    r = await c.post(f"{base}/upload", headers=headers, content=audio_data)
                    r.raise_for_status()
                    upload_url = r.json()["upload_url"]

                    r = await c.post(f"{base}/transcript", headers={**headers, "content-type": "application/json"},
                                     json={"audio_url": upload_url, "language_detection": True,
                                           "punctuate": True, "format_text": True})
                    r.raise_for_status()
                    tid = r.json()["id"]

                    for _ in range(20):
                        await asyncio.sleep(0.5)
                        r = await c.get(f"{base}/transcript/{tid}", headers=headers)
                        r.raise_for_status()
                        d = r.json()
                        if d.get("status") == "completed":
                            return d.get("text", "").strip()
                        if d.get("status") == "error":
                            break
            except Exception as e:
                logger.warning(f"AssemblyAI batch fallback failed: {e}")

        return ""
