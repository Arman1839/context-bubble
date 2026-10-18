import json
from datetime import datetime, timezone
from typing import Optional
try:
    from google.cloud import tasks_v2
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
            timestamp = timestamp_pb2.Timestamp()
            timestamp.FromDatetime(run_at)

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

    async def run_sweeper_backstop(self, pop_trigger_callback):
        """
        Cloud Scheduler sweeper running every 2-5 minutes to pop any expired bubbles
        that may have been missed due to transient task issues.
        """
        now = datetime.now(timezone.utc)
        logger.info(f"Running Cloud Scheduler sweeper backstop at {now.isoformat()}")

        query = (
            self.db.collection("bubbles")
            .where("pop_state", "==", "ACTIVE")
            .where("expires_at", "<=", now)
            .limit(25)
        )
        expired_docs = await query.get()
        logger.info(f"Sweeper identified {len(expired_docs)} expired bubbles to pop.")

        for doc in expired_docs:
            b_id = doc.id
            try:
                await pop_trigger_callback(b_id, is_timer_expired=True)
            except Exception as e:
                logger.error(f"Sweeper failed to pop expired bubble {b_id}: {e}")
