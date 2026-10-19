from datetime import datetime, timezone
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


InsightType = Literal["consensus", "debate", "blocker", "action_item", "decision"]
DeltaAction = Literal["added", "updated", "removed", "unchanged"]


class Insight(BaseModel):
    insight_id: str
    type: InsightType
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    supporting_contribution_ids: List[str] = Field(default_factory=list)
    embedding: Optional[List[float]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InsightDelta(BaseModel):
    action: DeltaAction
    insight: Insight
    similarity_score: Optional[float] = None


class DisagreementItem(BaseModel):
    id: str
    sideA: dict
    sideB: dict


class MissingPiece(BaseModel):
    id: str
    description: str
    action: Literal["request", "suggest"]
    actionLabel: str


class Intelligence(BaseModel):
    summary: str
    disagreements: List[DisagreementItem] = Field(default_factory=list)
    missingPieces: List[MissingPiece] = Field(default_factory=list)
    nextSteps: List[str] = Field(default_factory=list)
    raw_insights: List[Insight] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SSEStreamEvent(BaseModel):
    event_id: str
    event_type: str
    data: dict
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

