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

    async def update_graph_from_insights(
        self,
        bubble_id: str,
        insights: List[Insight],
        *,
        summary: str = "",
        disagreements: List[Dict[str, Any]] | None = None,
        missing_pieces: List[Dict[str, Any]] | None = None,
        next_steps: List[str] | None = None,
    ) -> KnowledgeGraph:
        bubble_ref = self.db.collection("bubbles").document(bubble_id)
        nodes: List[ReactFlowNode] = []
        edges: List[ReactFlowEdge] = []

        # Central Topic Node
        topic_node = ReactFlowNode(
            id=f"topic_{bubble_id}",
            type="topicNode",
            data=ReactFlowNodeData(
                label=summary.strip() or "Session Focus",
                node_type="topic",
                status="consensus",
                stance=StanceCounts(agree_count=1),
                confidence=1.0,
            ),
            position={"x": 360.0, "y": 40.0},
        )
        nodes.append(topic_node)

        # Categorize items strictly into semantic buckets
        debates: List[Tuple[str, str, float, List[str]]] = []
        consensus_decisions: List[Tuple[str, str, float, List[str]]] = []
        blockers: List[Tuple[str, str, float, List[str]]] = []
        action_items: List[Tuple[str, str, float, List[str]]] = []

        # 1. From insights
        for ins in insights:
            if not ins.text or not ins.text.strip():
                continue
            text = ins.text.strip()
            item_type = ins.type.lower()
            if item_type == "debate":
                debates.append((text, "debate", ins.confidence, ins.supporting_contribution_ids))
            elif item_type == "blocker":
                blockers.append((text, "blocker", ins.confidence, ins.supporting_contribution_ids))
            elif item_type == "action_item":
                action_items.append((text, "action_item", ins.confidence, ins.supporting_contribution_ids))
            elif item_type in ("consensus", "decision"):
                consensus_decisions.append((text, item_type, ins.confidence, ins.supporting_contribution_ids))

        # 2. From disagreements
        seen_debates = {t[0].casefold() for t in debates}
        for item in disagreements or []:
            side_a = item.get("sideA") or {}
            side_b = item.get("sideB") or {}
            label_a = side_a.get("label", "") if isinstance(side_a, dict) else str(side_a)
            label_b = side_b.get("label", "") if isinstance(side_b, dict) else str(side_b)
            label = " vs ".join(part.strip() for part in (label_a, label_b) if part and part.strip())
            if not label:
                label = str(item.get("topic") or "").strip()
            if label and label.casefold() not in seen_debates:
                seen_debates.add(label.casefold())
                debates.append((label, "debate", 0.85, []))

        # 3. From missing pieces
        seen_blockers = {t[0].casefold() for t in blockers}
        for item in missing_pieces or []:
            description = str(item.get("description", "")).strip()
            if description and description.casefold() not in seen_blockers:
                seen_blockers.add(description.casefold())
                blockers.append((description, "blocker", 0.8, []))

        # 4. From next steps
        seen_actions = {t[0].casefold() for t in action_items}
        for step in next_steps or []:
            text = step.strip() if isinstance(step, str) else ""
            if text and text.casefold() not in seen_actions:
                seen_actions.add(text.casefold())
                action_items.append((text, "action_item", 0.85, []))

        # Determine horizontal column positions (Category columns arranged horizontally, similar insights stacked vertically)
        col_x = 40.0
        col_step = 320.0
        row_step = 160.0
        start_y = 80.0

        topic_x = col_x
        col_x += col_step

        consensus_x = None
        if consensus_decisions:
            consensus_x = col_x
            col_x += col_step

        debates_x = None
        if debates:
            debates_x = col_x
            col_x += col_step

        blockers_x = None
        if blockers:
            blockers_x = col_x
            col_x += col_step

        actions_x = None
        if action_items:
            actions_x = col_x
            col_x += col_step

        # Vertical centering for Topic node relative to the tallest column
        max_rows = max(
            len(consensus_decisions[:4]),
            len(debates[:4]),
            len(blockers[:4]),
            len(action_items[:4]),
            1,
        )
        topic_y = start_y + ((max_rows - 1) * row_step) / 2.0
        topic_node.position = {"x": topic_x, "y": topic_y}

        # Track created node IDs for interconnecting edges
        debate_node_ids: List[str] = []
        consensus_node_ids: List[str] = []
        blocker_node_ids: List[str] = []
        action_node_ids: List[str] = []

        # 1. Consensus / Decision nodes (Column 1: stacked vertically)
        if consensus_x is not None:
            for i, (label, node_type, conf, contrib_ids) in enumerate(consensus_decisions[:4]):
                nid = self.generate_node_id(label, node_type)
                consensus_node_ids.append(nid)
                agree = max(2, len(contrib_ids))
                stance = StanceCounts(agree_count=agree, disagree_count=0, supporter_ids=contrib_ids)
                nodes.append(ReactFlowNode(
                    id=nid,
                    type="customBubbleNode",
                    data=ReactFlowNodeData(
                        label=label,
                        node_type=node_type,
                        status="consensus",
                        stance=stance,
                        supporting_contribution_ids=contrib_ids,
                        confidence=conf,
                    ),
                    position={"x": consensus_x, "y": start_y + i * row_step},
                ))
                # Edge: Topic -> Consensus (supports)
                edges.append(ReactFlowEdge(
                    id=self.generate_edge_id(topic_node.id, nid, "supports"),
                    source=topic_node.id,
                    target=nid,
                    type="supports",
                    animated=False,
                ))

        # 2. Debate nodes (Column 2: stacked vertically)
        if debates_x is not None:
            for i, (label, node_type, conf, contrib_ids) in enumerate(debates[:4]):
                nid = self.generate_node_id(label, node_type)
                debate_node_ids.append(nid)
                stance = StanceCounts(agree_count=1, disagree_count=2, supporter_ids=contrib_ids[:1])
                nodes.append(ReactFlowNode(
                    id=nid,
                    type="customBubbleNode",
                    data=ReactFlowNodeData(
                        label=label,
                        node_type=node_type,
                        status="contested",
                        stance=stance,
                        supporting_contribution_ids=contrib_ids,
                        confidence=conf,
                    ),
                    position={"x": debates_x, "y": start_y + i * row_step},
                ))
                # Edge: Connect from consensus or topic (disputes)
                src_id = consensus_node_ids[i % len(consensus_node_ids)] if consensus_node_ids else topic_node.id
                edges.append(ReactFlowEdge(
                    id=self.generate_edge_id(src_id, nid, "disputes"),
                    source=src_id,
                    target=nid,
                    type="disputes",
                    animated=True,
                ))

        # 3. Blocker nodes (Column 3: stacked vertically)
        if blockers_x is not None:
            for i, (label, node_type, conf, contrib_ids) in enumerate(blockers[:4]):
                nid = self.generate_node_id(label, node_type)
                blocker_node_ids.append(nid)
                stance = StanceCounts(agree_count=1, disagree_count=1)
                nodes.append(ReactFlowNode(
                    id=nid,
                    type="customBubbleNode",
                    data=ReactFlowNodeData(
                        label=label,
                        node_type=node_type,
                        status="unresolved",
                        stance=stance,
                        supporting_contribution_ids=contrib_ids,
                        confidence=conf,
                    ),
                    position={"x": blockers_x, "y": start_y + i * row_step},
                ))
                # Edge: connect from debate or topic
                src_id = debate_node_ids[i % len(debate_node_ids)] if debate_node_ids else topic_node.id
                edges.append(ReactFlowEdge(
                    id=self.generate_edge_id(src_id, nid, "depends_on"),
                    source=src_id,
                    target=nid,
                    type="depends_on",
                    animated=False,
                ))

        # 4. Action Item nodes (Column 4: stacked vertically)
        if actions_x is not None:
            for i, (label, node_type, conf, contrib_ids) in enumerate(action_items[:4]):
                nid = self.generate_node_id(label, node_type)
                action_node_ids.append(nid)
                stance = StanceCounts(agree_count=2, disagree_count=0)
                nodes.append(ReactFlowNode(
                    id=nid,
                    type="customBubbleNode",
                    data=ReactFlowNodeData(
                        label=label,
                        node_type=node_type,
                        status="consensus",
                        stance=stance,
                        supporting_contribution_ids=contrib_ids,
                        confidence=conf,
                    ),
                    position={"x": actions_x, "y": start_y + i * row_step},
                ))
                # Edge: Action Item resolves Blocker or Debate!
                if blocker_node_ids:
                    target_blocker = blocker_node_ids[i % len(blocker_node_ids)]
                    edges.append(ReactFlowEdge(
                        id=self.generate_edge_id(nid, target_blocker, "resolves"),
                        source=nid,
                        target=target_blocker,
                        type="resolves",
                        animated=True,
                    ))
                elif debate_node_ids:
                    target_debate = debate_node_ids[i % len(debate_node_ids)]
                    edges.append(ReactFlowEdge(
                        id=self.generate_edge_id(nid, target_debate, "resolves"),
                        source=nid,
                        target=target_debate,
                        type="resolves",
                        animated=True,
                    ))
                else:
                    edges.append(ReactFlowEdge(
                        id=self.generate_edge_id(topic_node.id, nid, "supports"),
                        source=topic_node.id,
                        target=nid,
                        type="supports",
                        animated=False,
                    ))
            else:
                edges.append(ReactFlowEdge(
                    id=self.generate_edge_id(topic_node.id, nid, "supports"),
                    source=topic_node.id,
                    target=nid,
                    type="supports",
                    animated=False,
                ))

        graph_ref = bubble_ref.collection("graph").document("latest")
        previous = await graph_ref.get()
        previous_data = previous.to_dict() if previous.exists else {}
        graph = KnowledgeGraph(
            bubble_id=bubble_id,
            nodes=nodes,
            edges=edges,
            version=int((previous_data or {}).get("version", 0)) + 1,
        )

        # Store in Firestore
        graph_data = graph.model_dump(mode="json")
        await graph_ref.set(graph_data)

        # Broadcast graph update over SSE
        await stream_manager.broadcast(
            bubble_id=bubble_id,
            event_type="graph",
            data=graph_data
        )

        return graph

    async def get_graph(self, bubble_id: str) -> KnowledgeGraph:
        bubble_ref = self.db.collection("bubbles").document(bubble_id)
        snap = await bubble_ref.collection("graph").document("latest").get()
        intel_snap = await bubble_ref.collection("intelligence").document("latest").get()

        if intel_snap.exists:
            intelligence = intel_snap.to_dict() or {}
            raw_insights = intelligence.get("raw_insights") or []
            disagreements = intelligence.get("disagreements") or []
            missing_pieces = intelligence.get("missingPieces") or intelligence.get("missing_pieces") or []
            next_steps = intelligence.get("nextSteps") or intelligence.get("next_steps") or []

            graph_data = snap.to_dict() if snap.exists else {}
            current_nodes = graph_data.get("nodes", [])

            # Check if current graph has old "claim" nodes or is missing semantic nodes
            has_claims = any(
                isinstance(n, dict) and n.get("data", {}).get("node_type") == "claim"
                for n in current_nodes
            )
            has_content = bool(raw_insights or disagreements or missing_pieces or next_steps)

            if not snap.exists or has_claims or (has_content and len(current_nodes) <= 1):
                insights = [Insight(**item) for item in raw_insights if isinstance(item, dict)]
                return await self.update_graph_from_insights(
                    bubble_id,
                    insights,
                    summary=str(intelligence.get("summary") or ""),
                    disagreements=disagreements,
                    missing_pieces=missing_pieces,
                    next_steps=next_steps,
                )

        if snap.exists:
            return KnowledgeGraph(**(snap.to_dict() or {}))
        return KnowledgeGraph(bubble_id=bubble_id, nodes=[], edges=[])
