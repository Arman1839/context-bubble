from datetime import datetime, timezone
from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel, Field


class TokenUsage(BaseModel):
    bubble_id: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLog(BaseModel):
    id: str
    bubble_id: str
    action: Literal[
        "bubble_created",
        "participant_joined",
        "participant_left",
        "contribution_ingested",
        "pop_triggered",
        "briefing_generated",
        "export_attempted",
        "export_succeeded",
        "export_failed",
        "crypto_shred_verified",
        "bubble_closed"
    ]
    actor_id: str
    actor_role: Literal["host", "participant", "system", "ai"]
    metadata_only: Dict[str, Any] = Field(
        default_factory=dict,
        description="Non-sensitive operational audit details. No user content or PII."
    )
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ShredReceipt(BaseModel):
    receipt_id: str
    bubble_id: str
    host_id: str
    popped_at: datetime
    shredded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_document_count: int
    deleted_storage_objects_count: int
    deleted_vectors_count: int
    key_destruction_verified: bool = True
    crypto_signature: str
