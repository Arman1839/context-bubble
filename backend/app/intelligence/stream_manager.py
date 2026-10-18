import asyncio
import json
import time
from typing import Dict, Set, List, Optional
from app.models.insight import SSEStreamEvent
from app.core.logging import logger


class StreamManager:
    """
    Registry for active SSE clients per bubble.
    Supports token streaming, final delta emissions, and Last-Event-ID resumption.
    """

    def __init__(self, history_buffer_size: int = 50):
        # bubble_id -> set of asyncio.Queue instances
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        # bubble_id -> list of recent SSEStreamEvents
        self._history: Dict[str, List[SSEStreamEvent]] = {}
        self.history_buffer_size = history_buffer_size
        self._event_counter = 0

    def subscribe(self, bubble_id: str, last_event_id: Optional[str] = None) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        if bubble_id not in self._subscribers:
            self._subscribers[bubble_id] = set()
            self._history[bubble_id] = []
        self._subscribers[bubble_id].add(queue)

        # Replay events since last_event_id if requested
        if last_event_id and bubble_id in self._history:
            found = False
            for event in self._history[bubble_id]:
                if found:
                    queue.put_nowait(event)
                elif event.event_id == last_event_id:
                    found = True

        return queue

    def unsubscribe(self, bubble_id: str, queue: asyncio.Queue):
        if bubble_id in self._subscribers:
            self._subscribers[bubble_id].discard(queue)
            if not self._subscribers[bubble_id]:
                self._subscribers.pop(bubble_id, None)

    async def broadcast(self, bubble_id: str, event_type: str, data: dict):
        self._event_counter += 1
        event_id = f"evt_{int(time.time()*1000)}_{self._event_counter}"
        event = SSEStreamEvent(
            event_id=event_id,
            event_type=event_type,
            data=data,
        )

        # Update replay buffer
        if bubble_id not in self._history:
            self._history[bubble_id] = []
        buf = self._history[bubble_id]
        buf.append(event)
        if len(buf) > self.history_buffer_size:
            self._history[bubble_id] = buf[-self.history_buffer_size:]

        # Dispatch to all connected client queues for this bubble
        subscribers = self._subscribers.get(bubble_id, set())
        for q in list(subscribers):
            try:
                q.put_nowait(event)
            except Exception as e:
                logger.warning(f"Failed to push SSE event to queue: {e}")


stream_manager = StreamManager()
