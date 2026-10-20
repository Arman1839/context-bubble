from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


Role = Literal["host", "participant"]
RetentionPolicy = Literal["temporary", "temporary-plus-record", "permanent", "view-only"]
PopState = Literal[
    "ACTIVE",
    "EXPIRY_PENDING",
    "POPPING",
    "EXPORTING",
    "SHREDDING",
    "POPPED",
    "FAILED_EXPORT"
]
AITriggerMode = Literal["mention", "auto", "always"]


class BubbleMember(BaseModel):
    id: str
    name: str
    avatar: Optional[str] = None
    role: Role = "participant"
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Bubble(BaseModel):
    id: str
    title: str
    is_live: bool = True
    expires_at: datetime
    member_count: int = 1
    retention_policy: RetentionPolicy = "temporary"
    anonymous_mode_enabled: bool = False
    host_id: str
    pop_state: PopState = "ACTIVE"
    trigger_mode: AITriggerMode = "mention"
    token_budget: int = 250000
    tokens_used: int = 0
    e2ee_enabled: bool = False
    e2ee_public_key: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    popped_at: Optional[datetime] = None
    expiry_decision_deadline: Optional[datetime] = None
    view_until: Optional[datetime] = None


class CreateBubbleRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    duration_minutes: int = Field(default=120, ge=5, le=1440)
    retention_policy: RetentionPolicy = "temporary"
    anonymous_mode_enabled: bool = False
    trigger_mode: AITriggerMode = "mention"
    token_budget: Optional[int] = Field(default=250000, ge=10000, le=1000000)
    e2ee_enabled: bool = False
    e2ee_public_key: Optional[str] = None


class JoinBubbleRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=50)
    avatar_url: Optional[str] = None


class ExtendBubbleRequest(BaseModel):
    additional_minutes: int = Field(..., ge=5, le=360)


class UpdateTriggerModeRequest(BaseModel):
    trigger_mode: AITriggerMode


class BubbleResponse(BaseModel):
    id: str
    title: str
    is_live: bool = True
    expires_at: Optional[datetime] = None
    member_count: int = 1
    members: List[BubbleMember] = Field(default_factory=list)
    retention_policy: RetentionPolicy = "temporary"
    anonymous_mode_enabled: bool = False
    host_id: str = ""
    pop_state: PopState = "ACTIVE"
    trigger_mode: AITriggerMode = "mention"
    e2ee_enabled: bool = False
    created_at: Optional[datetime] = None
    intelligence: Optional[Dict[str, Any]] = None
    expiry_decision_deadline: Optional[datetime] = None
    view_until: Optional[datetime] = None
