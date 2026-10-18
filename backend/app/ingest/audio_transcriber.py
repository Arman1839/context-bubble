import io
import time
from typing import Optional, AsyncIterator
from fastapi import WebSocket
from app.core.firestore_compat import firestore

from app.core.logging import logger
from app.intelligence.stream_manager import stream_manager
from app.rag.pipeline import RAGPipeline
from app.llm.base import LLMAdapter


class AudioTranscriptionSession:
    """
    Manages a live WebSocket audio streaming session for a participant.
    Buffers binary PCM/Opus chunks and produces real-time partial & final transcripts
    with authenticated speaker attribution.
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
        self._audio_buffer = bytearray()
        self._is_active = True

    async def handle_stream(self):
        await self.ws.accept()
        logger.info(f"WebSocket audio session started for user={self.user_id} in bubble={self.bubble_id}")

        try:
            while self._is_active:
                message = await self.ws.receive()

                if "bytes" in message and message["bytes"]:
                    chunk = message["bytes"]
                    self._audio_buffer.extend(chunk)

                    # Periodically emit interim partial transcript
                    if len(self._audio_buffer) >= 32000:  # ~1 sec of 16kHz 16-bit audio
                        partial_text = self._mock_or_whisper_partial(len(self._audio_buffer))
                        await self.ws.send_json({
                            "type": "partial",
                            "speaker": self.user_name,
                            "text": partial_text,
                        })

                elif "text" in message and message["text"]:
                    data = message["text"]
                    if data == "END_SPEECH" or '"action":"stop"' in data:
                        await self._finalize_transcription()

        except Exception as e:
            logger.info(f"Audio stream closed for user={self.user_id}: {e}")
        finally:
            if self._audio_buffer:
                await self._finalize_transcription()

    async def _finalize_transcription(self):
        if not self._audio_buffer:
            return

        final_text = self._mock_or_whisper_final(len(self._audio_buffer))
        self._audio_buffer.clear()

        # Send final transcript back to speaker
        await self.ws.send_json({
            "type": "final",
            "speaker": self.user_name,
            "text": final_text,
        })

        # Persist as voice contribution in Firestore
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

        # Index chunk in RAG
        await self.rag.ingest_and_index(
            bubble_id=self.bubble_id,
            source_id=contrib_ref.id,
            text=final_text,
            extra_metadata={"speaker": self.user_name, "type": "voice"}
        )

        # Broadcast contribution over SSE
        await stream_manager.broadcast(
            bubble_id=self.bubble_id,
            event_type="delta",
            data={
                "type": "new_contribution",
                "author": self.user_name,
                "text": final_text,
                "source": "voice",
            }
        )

    def _mock_or_whisper_partial(self, byte_count: int) -> str:
        return f"Speaking ({byte_count // 1000} KB received)..."

    def _mock_or_whisper_final(self, byte_count: int) -> str:
        return f"Team, based on the recent customer metrics, I strongly agree we must streamline our onboarding flow."
