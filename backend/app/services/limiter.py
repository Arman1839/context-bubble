import time
from typing import Dict, Tuple
from app.core.firestore_compat import firestore
from app.core.config import settings
from app.core.exceptions import RateLimitExceededException, TokenBudgetExceededException
from app.core.logging import logger


class RateLimiter:
    """
    Sliding window in-memory rate limiter per (bubble_id, user_id).
    """
    def __init__(self, requests_per_minute: int = settings.RATE_LIMIT_PER_USER_RPM):
        self.rpm = requests_per_minute
        # Key: (bubble_id, user_id) -> list of request timestamps
        self._history: Dict[Tuple[str, str], list[float]] = {}

    def check_rate_limit(self, bubble_id: str, user_id: str):
        now = time.time()
        key = (bubble_id, user_id)
        window_start = now - 60.0

        timestamps = self._history.get(key, [])
        # Filter timestamps within current 60s window
        timestamps = [t for t in timestamps if t > window_start]

        if len(timestamps) >= self.rpm:
            retry_after = int(60.0 - (now - timestamps[0])) if timestamps else 60
            logger.warning(f"Rate limit exceeded for user={user_id} in bubble={bubble_id}")
            raise RateLimitExceededException(retry_after=max(1, retry_after))

        timestamps.append(now)
        self._history[key] = timestamps


class TokenBudgetManager:
    """
    Tracks and enforces token consumption per bubble in Firestore.
    """
    def __init__(self, db: firestore.AsyncClient):
        self.db = db

    async def verify_and_consume(self, bubble_id: str, estimated_or_actual_tokens: int) -> int:
        bubble_ref = self.db.collection("bubbles").document(bubble_id)

        @firestore.async_transactional
        async def _consume_in_tx(transaction: firestore.AsyncTransaction) -> int:
            snapshot = await bubble_ref.get(transaction=transaction)
            if not snapshot.exists:
                return 0
            data = snapshot.to_dict() or {}
            budget = data.get("token_budget", settings.BUBBLE_DEFAULT_TOKEN_BUDGET)
            used = data.get("tokens_used", 0)

            if used + estimated_or_actual_tokens > budget:
                raise TokenBudgetExceededException(bubble_id, budget)

            new_used = used + estimated_or_actual_tokens
            transaction.update(bubble_ref, {"tokens_used": new_used})
            return new_used

        tx = self.db.transaction()
        return await _consume_in_tx(tx)


rate_limiter = RateLimiter()
