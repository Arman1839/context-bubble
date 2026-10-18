from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.services.firebase import get_async_firestore_client
from app.llm.factory import get_llm_adapter
from app.ingest.audio_transcriber import AudioTranscriptionSession
from app.core.logging import logger

router = APIRouter()


@router.websocket("")
async def websocket_audio_transcription(
    websocket: WebSocket,
    bubble_id: str,
    user_id: str = Query(default="speaker-1"),
    user_name: str = Query(default="Speaker"),
):
    db = get_async_firestore_client()
    llm = get_llm_adapter()

    session = AudioTranscriptionSession(
        websocket=websocket,
        bubble_id=bubble_id,
        user_id=user_id,
        user_name=user_name,
        db=db,
        llm=llm,
    )
    await session.handle_stream()
