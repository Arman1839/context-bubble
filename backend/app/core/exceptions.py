from typing import Any, Dict, Optional
from fastapi import HTTPException, status


class BubbleException(HTTPException):
    def __init__(
        self,
        status_code: int,
        detail: str,
        code: str,
        headers: Optional[Dict[str, str]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code
        self.extra = extra or {}


class BubbleNotFoundException(BubbleException):
    def __init__(self, bubble_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bubble '{bubble_id}' was not found or has already expired and popped.",
            code="BUBBLE_NOT_FOUND",
        )


class BubbleFullException(BubbleException):
    def __init__(self, bubble_id: str, limit: int = 10):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bubble '{bubble_id}' has reached its hard limit of {limit} participants.",
            code="BUBBLE_FULL",
            extra={"limit": limit},
        )


class BubblePoppedException(BubbleException):
    def __init__(self, bubble_id: str):
        super().__init__(
            status_code=status.HTTP_410_GONE,
            detail=f"Bubble '{bubble_id}' is in the process of popping or has completed destruction.",
            code="BUBBLE_POPPED",
        )


class UnauthorizedBubbleActionException(BubbleException):
    def __init__(self, action: str = "perform this action"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only the bubble host has permission to {action}.",
            code="HOST_PERMISSION_REQUIRED",
        )


class RateLimitExceededException(BubbleException):
    def __init__(self, retry_after: int = 60):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please throttle your requests.",
            code="RATE_LIMIT_EXCEEDED",
            headers={"Retry-After": str(retry_after)},
        )


class TokenBudgetExceededException(BubbleException):
    def __init__(self, bubble_id: str, budget: int):
        super().__init__(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Bubble '{bubble_id}' has exhausted its AI token budget ({budget} tokens).",
            code="TOKEN_BUDGET_EXCEEDED",
        )
