import asyncio
import json
from typing import Optional
from fastapi import APIRouter, Request, Header, Query
from sse_starlette.sse import EventSourceResponse

from app.intelligence.stream_manager import stream_manager
from app.models.insight import SSEStreamEvent
from app.core.logging import logger

router = APIRouter()


@router.get("")
async def stream_bubble_events(
    bubble_id: str,
    request: Request,
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    token: Optional[str] = Query(None),
):
    """
    SSE stream endpoint for the bubble.
    Streams token-level partials, final semantic insight deltas, presence updates, and knowledge graph diffs.
    Supports reconnection replay via Last-Event-ID header.
    """
    queue = stream_manager.subscribe(bubble_id, last_event_id)

    async def event_generator():
        try:
            # Send initial connected ping
            yield {
                "event": "connected",
                "id": f"conn_{int(asyncio.get_event_loop().time())}",
                "data": json.dumps({"status": "streaming_active", "bubble_id": bubble_id}),
            }

            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break

                try:
                    # Wait up to 15s for new event, otherwise yield ping heartbeat
                    event: SSEStreamEvent = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield {
                        "event": event.event_type,
                        "id": event.event_id,
                        "data": json.dumps(event.data),
                    }
                except asyncio.TimeoutError:
                    yield {
                        "event": "ping",
                        "data": json.dumps({"timestamp": int(asyncio.get_event_loop().time())}),
                    }
        except asyncio.CancelledError:
            pass
        finally:
            stream_manager.unsubscribe(bubble_id, queue)
            logger.info(f"SSE stream client disconnected from bubble={bubble_id}")

    return EventSourceResponse(event_generator())
