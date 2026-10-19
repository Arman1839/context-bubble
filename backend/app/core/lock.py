import asyncio
import time
import uuid
from typing import Optional
from app.core.firestore_compat import firestore
from app.core.logging import logger


class DistributedLock:
    """
    Concurrency-safe distributed lease backed by Firestore documents.
    Prevents duplicate debounce executions or duplicate AI participant generation
    across multiple horizontal Cloud Run instances.
    """

    def __init__(
        self,
        db: firestore.AsyncClient,
        lock_name: str,
        ttl_seconds: float = 15.0
    ):
        self.db = db
        self.lock_name = lock_name
        self.ttl_seconds = ttl_seconds
        self.token = str(uuid.uuid4())
        self._doc_ref = self.db.collection("_distributed_locks").document(lock_name)

    async def acquire(self) -> bool:
        now = time.time()
        expires_at = now + self.ttl_seconds

        @firestore.async_transactional
        async def _acquire_in_tx(transaction: firestore.AsyncTransaction) -> bool:
            snapshot = await self._doc_ref.get(transaction=transaction)
            if snapshot.exists:
                data = snapshot.to_dict() or {}
                cur_expires = data.get("expires_at", 0)
                cur_token = data.get("token")
                # If current lease is still active and owned by another token, reject
                if cur_expires > now and cur_token != self.token:
                    return False

            transaction.set(
                self._doc_ref,
                {
                    "token": self.token,
                    "acquired_at": now,
                    "expires_at": expires_at,
                    "lock_name": self.lock_name,
                }
            )
            return True

        try:
            tx = self.db.transaction()
            acquired = await _acquire_in_tx(tx)
            return acquired
        except Exception as e:
            logger.warning(
                f"Failed to acquire distributed lock for {self.lock_name}: {e}"
            )
            return False

    async def release(self) -> bool:
        @firestore.async_transactional
        async def _release_in_tx(transaction: firestore.AsyncTransaction) -> bool:
            snapshot = await self._doc_ref.get(transaction=transaction)
            if not snapshot.exists:
                return True
            data = snapshot.to_dict() or {}
            if data.get("token") == self.token:
                transaction.delete(self._doc_ref)
                return True
            return False

        try:
            tx = self.db.transaction()
            return await _release_in_tx(tx)
        except Exception as e:
            logger.warning(
                f"Failed to release distributed lock for {self.lock_name}: {e}"
            )
            return False

    async def __aenter__(self):
        acquired = await self.acquire()
        if not acquired:
            raise TimeoutError(f"Could not acquire lock for {self.lock_name}")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.release()
