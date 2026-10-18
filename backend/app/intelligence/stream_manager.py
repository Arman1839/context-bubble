import asyncio
import json
import time
from typing import Dict, Set, List, Optional
from app.models.insight import SSEStreamEvent
from app.core.config import settings
from app.core.logging import logger

try:
    import redis.asyncio as aioredis
    HAS_REDIS = True
except ImportError:
    aioredis = None
    HAS_REDIS = False


class StreamManager:
    """
    Production SSE Event Registry with:
    - Multi-node Redis Pub/Sub backplane for horizontal Cloud Run scaling
    - Seamless local in-memory fallback when Redis is unconfigured
    - Last-Event-ID reconnection and replay buffer
    """

    def __init__(self, history_buffer_size: int = 50):
        # bubble_id -> set of asyncio.Queue instances
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        # bubble_id -> list of recent SSEStreamEvents
        self._history: Dict[str, List[SSEStreamEvent]] = {}
        self.history_buffer_size = history_buffer_size
        self._event_counter = 0

        self._redis: Optional[any] = None
        self._pubsub_task: Optional[asyncio.Task] = None
        self._is_redis_ready = False

    async def initialize_redis(self):
        """Initializes Redis Pub/Sub client if REDIS_URL is configured."""
        if not HAS_REDIS or not settings.REDIS_URL:
            logger.info("StreamManager running in local in-memory pub/sub mode.")
            return

        try:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await self._redis.ping()
            self._is_redis_ready = True
            self._pubsub_task = asyncio.create_task(self._listen_redis())
            logger.info(f"StreamManager connected to Redis at {settings.REDIS_URL} for distributed SSE.")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis ({settings.REDIS_URL}): {e}. Using local in-memory mode.")
            self._is_redis_ready = False
            self._redis = None

    async def _listen_redis(self):
        """Background listener for multi-instance pub/sub events."""
        if not self._redis:
            return
        pubsub = self._redis.pubsub()
        await pubsub.psubscribe("bubble_stream:*")
        logger.info("Subscribed to Redis pattern bubble_stream:*")

        try:
            async for message in pubsub.listen():
                if message["type"] == "pmessage":
                    channel = message["channel"]
                    bubble_id = channel.split(":", 1)[1] if ":" in channel else ""
                    if bubble_id and bubble_id in self._subscribers:
                        raw_data = message["data"]
                        try:
                            payload = json.loads(raw_data)
                            event = SSEStreamEvent(**payload)
                            self._dispatch_local(bubble_id, event, is_from_redis=True)
                        except Exception as e:
                            logger.warning(f"Error parsing Redis SSE payload: {e}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Redis pub/sub listener interrupted: {e}")

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

        # If Redis is active, publish to channel so all cluster nodes receive it
        if self._is_redis_ready and self._redis:
            try:
                payload = json.dumps(event.model_dump())
                await self._redis.publish(f"bubble_stream:{bubble_id}", payload)
                return
            except Exception as e:
                logger.warning(f"Failed to publish to Redis pub/sub ({e}); falling back to local dispatch.")

        # Local dispatch
        self._dispatch_local(bubble_id, event, is_from_redis=False)

    def _dispatch_local(self, bubble_id: str, event: SSEStreamEvent, is_from_redis: bool = False):
        # Update replay buffer
        if bubble_id not in self._history:
            self._history[bubble_id] = []
        buf = self._history[bubble_id]
        buf.append(event)
        if len(buf) > self.history_buffer_size:
            self._history[bubble_id] = buf[-self.history_buffer_size:]

        # Dispatch to all locally connected client queues
        subscribers = self._subscribers.get(bubble_id, set())
        for q in list(subscribers):
            try:
                q.put_nowait(event)
            except Exception as e:
                logger.warning(f"Failed to push SSE event to queue: {e}")


stream_manager = StreamManager()
