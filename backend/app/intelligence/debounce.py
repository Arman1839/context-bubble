import asyncio
import time
from typing import Callable, Coroutine, Dict, Any, Optional
from app.core.firestore_compat import firestore

from app.core.config import settings
from app.core.lock import DistributedLock
from app.core.logging import logger


class DebounceManager:
    """
    Manages trailing-window debouncing with max-wait cap per bubble.
    Guarantees that high-frequency message bursts trigger only one LLM run,
    and coordinates cross-instance concurrency using Firestore distributed leases.
    """

    def __init__(
        self,
        db: firestore.AsyncClient,
        trailing_seconds: float = settings.DEBOUNCE_TRAILING_SECONDS,
        max_wait_seconds: float = settings.DEBOUNCE_MAX_WAIT_SECONDS,
    ):
        self.db = db
        self.trailing_seconds = trailing_seconds
        self.max_wait_seconds = max_wait_seconds

        # In-process state tracking: bubble_id -> metadata
        self._timers: Dict[str, asyncio.Task] = {}
        self._first_event_at: Dict[str, float] = {}
        self._last_event_at: Dict[str, float] = {}

    def notify_event(
        self,
        bubble_id: str,
        callback: Callable[[str], Coroutine[Any, Any, None]]
    ):
        now = time.time()
        if bubble_id not in self._first_event_at:
            self._first_event_at[bubble_id] = now
        self._last_event_at[bubble_id] = now

        # Cancel existing timer task if still waiting and max-wait is not reached
        time_since_first = now - self._first_event_at[bubble_id]
        if bubble_id in self._timers and not self._timers[bubble_id].done():
            if time_since_first < self.max_wait_seconds:
                self._timers[bubble_id].cancel()

        delay = min(self.trailing_seconds, max(0.1, self.max_wait_seconds - time_since_first))
        self._timers[bubble_id] = asyncio.create_task(
            self._execute_after_delay(bubble_id, delay, callback)
        )

    async def _execute_after_delay(
        self,
        bubble_id: str,
        delay: float,
        callback: Callable[[str], Coroutine[Any, Any, None]]
    ):
        try:
            await asyncio.sleep(delay)
            # Acquire distributed lease to prevent multiple Cloud Run instances running simultaneously
            lock = DistributedLock(self.db, f"synth_{bubble_id}", ttl_seconds=25.0)
            acquired = await lock.acquire()
            if not acquired:
                logger.info(f"Debounce execution skipped for bubble={bubble_id} (lease held by another instance)")
                return

            try:
                # Reset debounce timers for this bubble
                self._first_event_at.pop(bubble_id, None)
                self._last_event_at.pop(bubble_id, None)
                await callback(bubble_id)
            finally:
                await lock.release()

        except asyncio.CancelledError:
            # Expected when cancelled by newer event within trailing window
            pass
        except Exception as e:
            logger.error(f"Error during debounce execution for bubble {bubble_id}: {e}")
