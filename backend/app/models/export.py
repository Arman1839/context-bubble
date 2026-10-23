from datetime import datetime, timezone
from typing import List, Literal, Optional, Dict
from pydantic import BaseModel, Field


ExportTarget = Literal["notion", "jira", "linear", "slack", "markdown", "pdf"]
ExportStatus = Literal["pending", "in_progress", "completed", "failed", "dry_run"]


class ActionItem(BaseModel):
    task: str
    owner: Optional[str] = "Unassigned"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    deadline_hint: Optional[str] = None


class DisagreementSummary(BaseModel):
    topic: str
    perspective_a: str
    perspective_b: str
    unresolved_questions: List[str] = Field(default_factory=list)


class GraphRelationshipSummary(BaseModel):
    total_nodes: int = 0
    total_edges: int = 0
    key_relationships: List[str] = Field(default_factory=list)


class ExecutiveBriefingExtraction(BaseModel):
    executive_summary: str = ""
    decisions: List[str] = Field(default_factory=list)
    consensus_points: List[str] = Field(default_factory=list)
    disagreements: List[DisagreementSummary] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)
    action_items: List[ActionItem] = Field(default_factory=list)


class ExecutiveBriefing(BaseModel):
    bubble_id: str = ""
    bubble_title: str = ""
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    executive_summary: str = ""
    decisions: List[str] = Field(default_factory=list)
    consensus_points: List[str] = Field(default_factory=list)
    disagreements: List[DisagreementSummary] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)
    action_items: List[ActionItem] = Field(default_factory=list)
    graph_summary: Optional[GraphRelationshipSummary] = None
    markdown_content: Optional[str] = None


class ExportConfig(BaseModel):
    target: ExportTarget
    enabled: bool = True
    workspace_id: Optional[str] = None
    target_channel_or_db: Optional[str] = None  # Slack channel, Notion DB ID, Linear Team ID, Jira Project Key
    encrypted_auth_secret_id: Optional[str] = None


class ExportRecord(BaseModel):
    id: str
    bubble_id: str
    target: ExportTarget
    status: ExportStatus = "pending"
    idempotency_key: str
    external_url: Optional[str] = None
    external_item_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None


class PopBubbleRequest(BaseModel):
    force_shred_on_export_failure: bool = False
    dry_run: bool = False
    custom_briefing_prompt: Optional[str] = None
    retention_policy: Optional[Literal["temporary", "temporary-plus-record", "permanent", "view-only"]] = None
    share_decision_record: bool = False
    view_retention_days: int = Field(default=3, ge=1, le=14)
