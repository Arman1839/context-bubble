from typing import List, Literal, Optional, Dict
from pydantic import BaseModel, Field


NodeType = Literal["topic", "claim", "consensus", "blocker", "decision", "debate", "action_item"]
EdgeType = Literal["supports", "disputes", "depends_on", "resolves"]
NodeStatus = Literal["consensus", "contested", "unresolved"]


class StanceCounts(BaseModel):
    agree_count: int = 0
    disagree_count: int = 0
    neutral_count: int = 0
    supporter_ids: List[str] = Field(default_factory=list)
    challenger_ids: List[str] = Field(default_factory=list)


class ReactFlowNodeData(BaseModel):
    label: str
    node_type: NodeType
    status: NodeStatus
    stance: StanceCounts
    supporting_contribution_ids: List[str] = Field(default_factory=list)
    confidence: float = 1.0


class ReactFlowNode(BaseModel):
    id: str
    type: str = "customBubbleNode"
    data: ReactFlowNodeData
    position: Dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0})


class ReactFlowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None
    type: EdgeType = "supports"
    animated: bool = False
    style: Optional[Dict[str, str]] = None


class KnowledgeGraph(BaseModel):
    bubble_id: str
    nodes: List[ReactFlowNode] = Field(default_factory=list)
    edges: List[ReactFlowEdge] = Field(default_factory=list)
    version: int = 1
