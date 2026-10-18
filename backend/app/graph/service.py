import hashlib
from typing import List, Dict, Any, Tuple
from app.core.firestore_compat import firestore

from app.models.graph import (
    ReactFlowNode,
    ReactFlowNodeData,
    ReactFlowEdge,
    KnowledgeGraph,
    NodeStatus,
    StanceCounts,
)
from app.models.insight import Insight
from app.intelligence.stream_manager import stream_manager


def evaluate_node_status(stance: StanceCounts) -> NodeStatus:
    """
    Evaluates stance status by explicit thresholds:
    - consensus: agree_count >= 3 and disagree_count == 0, or agree ratio >= 0.75 (min 3 votes).
    - contested: agree_count >= 1, disagree_count >= 1, and disagree ratio >= 0.33.
    - unresolved: total votes < 2 or neutral dominance.
    """
    total = stance.agree_count + stance.disagree_count
    if total < 2:
        return "unresolved"

    agree_ratio = stance.agree_count / total
    if stance.disagree_count == 0 and stance.agree_count >= 3:
        return "consensus"
    if agree_ratio >= 0.75 and total >= 3:
        return "consensus"
    if (stance.disagree_count / total) >= 0.33:
        return "contested"
    return "unresolved"


class GraphService:
    def __init__(self, db: firestore.AsyncClient):
        self.db = db

    def generate_node_id(self, label: str, node_type: str) -> str:
        h = hashlib.sha256(f"{node_type}:{label.strip().lower()}".encode("utf-8")).hexdigest()[:10]
        return f"node_{h}"

    def generate_edge_id(self, source_id: str, target_id: str, edge_type: str) -> str:
        h = hashlib.sha256(f"{source_id}->{target_id}:{edge_type}".encode("utf-8")).hexdigest()[:10]
        return f"edge_{h}"

    async def update_graph_from_insights(self, bubble_id: str, insights: List[Insight]) -> KnowledgeGraph:
        bubble_ref = self.db.collection("bubbles").document(bubble_id)
        nodes: List[ReactFlowNode] = []
        edges: List[ReactFlowEdge] = []

        # Central Topic Node
        topic_node = ReactFlowNode(
            id=f"topic_{bubble_id}",
            type="topicNode",
            data=ReactFlowNodeData(
                label="Session Focus",
                node_type="topic",
                status="consensus",
                stance=StanceCounts(agree_count=1),
                confidence=1.0,
            ),
            position={"x": 300.0, "y": 50.0},
        )
        nodes.append(topic_node)

        # Map insights to graph nodes
        y_offset = 180.0
        x_spacing = 260.0
        for idx, ins in enumerate(insights):
            node_id = self.generate_node_id(ins.text, ins.type)
            # Simulated or computed stance
            agree = len(ins.supporting_contribution_ids) or (3 if ins.type in ("consensus", "decision") else 1)
            disagree = 2 if ins.type in ("debate", "blocker") else 0
            stance = StanceCounts(agree_count=agree, disagree_count=disagree)
            status = evaluate_node_status(stance)

            node = ReactFlowNode(
                id=node_id,
                type="customBubbleNode",
                data=ReactFlowNodeData(
                    label=ins.text,
                    node_type=ins.type,
                    status=status,
                    stance=stance,
                    supporting_contribution_ids=ins.supporting_contribution_ids,
                    confidence=ins.confidence,
                ),
                position={"x": 80.0 + (idx % 3) * x_spacing, "y": y_offset + (idx // 3) * 160.0},
            )
            nodes.append(node)

            # Edge from topic to insight node
            edge_type = "supports" if ins.type in ("consensus", "decision") else "disputes" if ins.type == "debate" else "depends_on"
            edge = ReactFlowEdge(
                id=self.generate_edge_id(topic_node.id, node_id, edge_type),
                source=topic_node.id,
                target=node_id,
                type=edge_type,
                animated=(status == "contested"),
            )
            edges.append(edge)

        graph = KnowledgeGraph(bubble_id=bubble_id, nodes=nodes, edges=edges)

        # Store in Firestore
        graph_data = graph.model_dump(mode="json")
        await bubble_ref.collection("graph").document("latest").set(graph_data)

        # Broadcast graph update over SSE
        await stream_manager.broadcast(
            bubble_id=bubble_id,
            event_type="graph",
            data=graph_data
        )

        return graph

    async def get_graph(self, bubble_id: str) -> KnowledgeGraph:
        snap = await self.db.collection("bubbles").document(bubble_id).collection("graph").document("latest").get()
        if snap.exists:
            return KnowledgeGraph(**snap.to_dict())
        return KnowledgeGraph(bubble_id=bubble_id, nodes=[], edges=[])
