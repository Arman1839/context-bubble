from datetime import datetime, timezone
from typing import List, Literal, Optional, Any
from pydantic import BaseModel, Field, field_validator


MessageType = Literal["user", "ai", "system"]
AttachmentType = Literal["link", "image", "audio", "file"]


class Attachment(BaseModel):
    type: AttachmentType
    label: str
    url: Optional[str] = None
    file_id: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None


class Message(BaseModel):
    id: str
    bubble_id: str
    seq: int = Field(description="Monotonically increasing sequence number per bubble")
    type: MessageType = "user"
    author_id: str
    author_name: str
    author_avatar: Optional[str] = None
    is_anonymous: bool = False
    text: str = Field(..., max_length=10000)
    attachments: Optional[List[Attachment]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    idempotency_key: Optional[str] = None
    tokens_consumed: Optional[int] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def sanitize_created_at(cls, v: Any) -> datetime:
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except Exception:
                pass
        return datetime.now(timezone.utc)


class PostMessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    attachments: Optional[List[Attachment]] = None
    is_anonymous: Optional[bool] = None
    idempotency_key: Optional[str] = None


class Contribution(BaseModel):
    id: str
    bubble_id: str
    author_id: str
    author_name: str
    author_avatar: Optional[str] = None
    is_anonymous: bool = False
    text: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    attachments: Optional[List[Attachment]] = None
    extracted_text: Optional[str] = None
    source_type: Literal["chat", "voice_transcript", "document_ocr", "link_extract"] = "chat"

    @field_validator("timestamp", mode="before")
    @classmethod
    def sanitize_timestamp(cls, v: Any) -> datetime:
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except Exception:
                pass
        return datetime.now(timezone.utc)


class PresenceUpdate(BaseModel):
    user_id: str
    display_name: str
    status: Literal["online", "away", "offline"] = "online"
    is_typing: bool = False
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
