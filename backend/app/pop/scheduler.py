import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Optional
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


_local_pop_tasks: Dict[str, asyncio.Task] = {}


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
            self._schedule_local_pop(bubble_id, run_at)
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
            self._schedule_local_pop(bubble_id, run_at)
            return f"local_fallback_{bubble_id}_{int(run_at.timestamp())}"

    def _schedule_local_pop(self, bubble_id: str, run_at: datetime) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning(f"Could not start local expiry timer for bubble {bubble_id}; sweeper remains the fallback.")
            return

        previous = _local_pop_tasks.get(bubble_id)
        if previous and not previous.done():
            previous.cancel()
        _local_pop_tasks[bubble_id] = loop.create_task(self._run_local_pop(bubble_id, run_at))

    async def _run_local_pop(self, bubble_id: str, run_at: datetime) -> None:
        current_task = asyncio.current_task()
        try:
            if run_at.tzinfo is None:
                run_at = run_at.replace(tzinfo=timezone.utc)
            await asyncio.sleep(max(0.0, (run_at - datetime.now(timezone.utc)).total_seconds()))
            from app.pop.state_machine import PopStateMachine

            await PopStateMachine(self.db).begin_expiry_grace(bubble_id)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Local expiry timer failed for bubble {bubble_id}: {e}")
        finally:
            if _local_pop_tasks.get(bubble_id) is current_task:
                _local_pop_tasks.pop(bubble_id, None)

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
            logger.warning(f"Expiry sweeper query failed: {e}")
            expired_docs = []

        if expired_docs:
            logger.info(f"Sweeper identified {len(expired_docs)} expired bubbles to notify their hosts.")

        for doc in expired_docs or []:
            b_id = doc.id
            lock = DistributedLock(self.db, f"pop_sweeper_{b_id}", ttl_seconds=30.0)
            if not await lock.acquire():
                continue
            try:
                if pop_trigger_callback:
                    await pop_trigger_callback(b_id, is_timer_expired=True)
                else:
                    sm = PopStateMachine(self.db)
                    await sm.begin_expiry_grace(b_id)
                logger.info(f"Sweeper successfully triggered auto-pop for bubble {b_id}")
            except Exception as e:
                logger.error(f"Sweeper failed to pop expired bubble {b_id}: {e}")

        try:
            retained_docs = await (
                self.db.collection("bubbles")
                .where("view_until", "<=", now)
                .limit(25)
                .get()
            )
        except Exception as e:
            logger.warning(f"View-only retention sweep failed: {e}")
            retained_docs = []

        if retained_docs:
            from app.crypto.shredder import CryptoShredder
            shredder = CryptoShredder(self.db)
            for doc in retained_docs:
                data = doc.to_dict() or {}
                if data.get("retention_policy") != "view-only":
                    continue
                try:
                    await shredder.execute_shredding(
                        bubble_id=doc.id,
                        host_id=data.get("host_id", "system-retention"),
                        retention_policy=(
                            "temporary-plus-record"
                            if data.get("decision_record_shared")
                            else "temporary"
                        ),
                    )
                except Exception as e:
                    logger.error(f"View-only cleanup failed for bubble {doc.id}: {e}")

    async def start_background_loop(self, interval_seconds: float = 30.0):
        """Starts a persistent background sweeper loop."""
        logger.info(f"Starting persistent PopScheduler sweeper daemon (every {interval_seconds}s)")
        try:
            while True:
                await asyncio.sleep(interval_seconds)
                await self.run_sweeper_backstop()
        except asyncio.CancelledError:
            logger.info("PopScheduler sweeper daemon stopped.")

