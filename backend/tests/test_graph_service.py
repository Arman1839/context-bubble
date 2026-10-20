import pytest

from app.graph.service import GraphService
from app.models.insight import Insight


@pytest.mark.anyio
async def test_graph_is_persisted_and_contains_insight_edges(mock_db):
    bubble_id = "graph-test-bubble"
    insight = Insight(
        insight_id="insight-1",
        type="decision",
        text="Prioritize improving onboarding",
        confidence=0.9,
        supporting_contribution_ids=["contribution-1", "contribution-2"],
    )

    graph = await GraphService(mock_db).update_graph_from_insights(bubble_id, [insight])
    persisted = await GraphService(mock_db).get_graph(bubble_id)

    assert len(graph.nodes) == 2
    assert len(graph.edges) == 1
    assert graph.edges[0].type == "supports"
    assert persisted.nodes[1].data.label == "Prioritize improving onboarding"
