import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
try:
    # pyrefly: ignore[missing-import]
    from google.cloud import tasks_v2
    # pyrefly: ignore[missing-source-for-stubs]
    from google.protobuf import timestamp_pb2
    HAS_TASKS = True
except ImportError:
    tasks_v2 = None
    timestamp_pb2 = None
    HAS_TASKS = False

from app.core.firestore_compat import firestore

from app.core.config import settings
from app.core.logging import logger


class PopScheduler:
    def __init__(self, db: firestore.AsyncClient):
        self.db = db
        try:
            assert tasks_v2 is not None
            self._client = tasks_v2.CloudTasksClient()
        except Exception:
            self._client = None
            logger.info("CloudTasksClient running in local/fallback mode")

    def schedule_pop_task(self, bubble_id: str, run_at: datetime) -> Optional[str]:
        if not self._client or settings.ENVIRONMENT == "development":
            logger.info(f"Local dev timer: Bubble {bubble_id} scheduled to pop at {run_at.isoformat()}")
            return f"mock_task_{bubble_id}_{int(run_at.timestamp())}"

        try:
            parent = settings.CLOUD_TASKS_QUEUE_PATH
            task_name = f"{parent}/tasks/pop_{bubble_id}_{int(run_at.timestamp())}"

            # Convert datetime to protobuf timestamp
            assert timestamp_pb2 is not None
            timestamp = timestamp_pb2.Timestamp()
            timestamp.FromDatetime(run_at)

            assert tasks_v2 is not None
            task = {
                "name": task_name,
                "http_request": {
                    "http_method": tasks_v2.HttpMethod.POST,
                    "url": settings.CLOUD_TASKS_HANDLER_URL,
                    "headers": {
                        "Content-Type": "application/json",
                        "X-Server-Internal-Secret": settings.SERVER_INTERNAL_SECRET,
                    },
                    "body": json.dumps({"bubble_id": bubble_id}).encode(),
                },
                "schedule_time": timestamp,
            }

            created_task = self._client.create_task(parent=parent, task=task)
            return created_task.name
        except Exception as e:
            logger.warning(f"Cloud Task scheduling error for bubble {bubble_id}: {e}")
            return None

    async def run_sweeper_backstop(self, pop_trigger_callback=None):
        """
        Sweeper running periodically to pop any expired bubbles
        that may have been missed due to transient task issues or restarts.
        """
        from app.core.lock import DistributedLock
        from app.pop.state_machine import PopStateMachine

        now = datetime.now(timezone.utc)
        query = (
            # pyrefly: ignore[missing-attribute]
            self.db.collection("bubbles")
            .where("pop_state", "==", "ACTIVE")
            .where("expires_at", "<=", now)
            .limit(25)
        )
        try:
            expired_docs = await query.get()
        except Exception as e:
            logger.debug(f"Sweeper query check: {e}")
            return

        if not expired_docs:
            return

        logger.info(f"Sweeper identified {len(expired_docs)} expired bubbles to pop.")

        for doc in expired_docs:
            b_id = doc.id
            lock = DistributedLock(self.db, f"pop_sweeper_{b_id}", ttl_seconds=30.0)
            if not await lock.acquire():
                continue
            try:
                if pop_trigger_callback:
                    await pop_trigger_callback(b_id, is_timer_expired=True)
                else:
                    sm = PopStateMachine(self.db)
                    await sm.initiate_pop(b_id, actor_id="system_sweeper", is_timer_expiry=True)
                logger.info(f"Sweeper successfully triggered auto-pop for bubble {b_id}")
            except Exception as e:
                logger.error(f"Sweeper failed to pop expired bubble {b_id}: {e}")

    async def start_background_loop(self, interval_seconds: float = 30.0):
        """Starts a persistent background sweeper loop."""
        logger.info(f"Starting persistent PopScheduler sweeper daemon (every {interval_seconds}s)")
        try:
            while True:
                await asyncio.sleep(interval_seconds)
                await self.run_sweeper_backstop()
        except asyncio.CancelledError:
            logger.info("PopScheduler sweeper daemon stopped.")

