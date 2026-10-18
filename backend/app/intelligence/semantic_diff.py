from typing import List, Tuple, Dict, Optional
from app.models.insight import Insight, InsightDelta
from app.rag.vector_store import cosine_similarity


class SemanticDiffer:
    """
    Compares newly extracted insights against the previously published insight set.
    Uses two-stage matching:
    1. Exact ID matching (if ID was preserved).
    2. Embedding cosine similarity (threshold >= 0.85 indicates semantic update).
    Emits only 'added', 'updated', 'removed', or 'unchanged' deltas.
    """

    def __init__(self, similarity_threshold: float = 0.85):
        self.similarity_threshold = similarity_threshold

    def compute_diff(
        self,
        previous_insights: List[Insight],
        new_insights: List[Insight]
    ) -> List[InsightDelta]:
        deltas: List[InsightDelta] = []
        matched_prev_ids = set()

        prev_by_id: Dict[str, Insight] = {p.insight_id: p for p in previous_insights}

        for new_item in new_insights:
            # Stage 1: Exact ID matching
            if new_item.insight_id in prev_by_id:
                prev_item = prev_by_id[new_item.insight_id]
                matched_prev_ids.add(prev_item.insight_id)
                if prev_item.text.strip() == new_item.text.strip() and prev_item.type == new_item.type:
                    deltas.append(InsightDelta(action="unchanged", insight=new_item, similarity_score=1.0))
                else:
                    deltas.append(InsightDelta(action="updated", insight=new_item, similarity_score=1.0))
                continue

            # Stage 2: Embedding semantic similarity matching
            best_match: Optional[Insight] = None
            highest_score: float = -1.0

            if new_item.embedding:
                for prev_item in previous_insights:
                    if prev_item.insight_id in matched_prev_ids or not prev_item.embedding:
                        continue
                    sim = cosine_similarity(new_item.embedding, prev_item.embedding)
                    if sim > highest_score:
                        highest_score = sim
                        best_match = prev_item

            if best_match and highest_score >= self.similarity_threshold:
                # Inherit the stable ID of the previously matched insight to stabilize React keys
                new_item.insight_id = best_match.insight_id
                matched_prev_ids.add(best_match.insight_id)

                if best_match.text.strip() == new_item.text.strip() and best_match.type == new_item.type:
                    deltas.append(InsightDelta(action="unchanged", insight=new_item, similarity_score=highest_score))
                else:
                    deltas.append(InsightDelta(action="updated", insight=new_item, similarity_score=highest_score))
            else:
                # Truly new insight
                deltas.append(InsightDelta(action="added", insight=new_item, similarity_score=0.0))

        # Check for removed insights
        for prev_item in previous_insights:
            if prev_item.insight_id not in matched_prev_ids:
                deltas.append(InsightDelta(action="removed", insight=prev_item, similarity_score=0.0))

        return deltas
