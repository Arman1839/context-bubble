import pytest
import asyncio
from app.models.insight import Insight
from app.intelligence.semantic_diff import SemanticDiffer
from app.intelligence.debounce import DebounceManager


@pytest.mark.anyio
async def test_debounce_coalescing(mock_db):
    call_count = 0

    async def callback(bubble_id: str):
        nonlocal call_count
        call_count += 1

    debounce = DebounceManager(mock_db, trailing_seconds=0.1, max_wait_seconds=0.3)

    # Fire 5 rapid events within trailing window
    for _ in range(5):
        debounce.notify_event("test-debounce-bubble", callback)
        await asyncio.sleep(0.02)

    # Wait for trailing window to elapse
    await asyncio.sleep(0.15)
    assert call_count == 1


def test_semantic_diffing():
    differ = SemanticDiffer(similarity_threshold=0.85)

    v1 = [0.1] * 768
    v1_slightly_diff = [0.1 if i % 2 == 0 else 0.09 for i in range(768)]
    v2_unrelated = [-0.1] * 768

    prev = [
        Insight(insight_id="ins_1", type="consensus", text="Original text", confidence=0.9, embedding=v1),
        Insight(insight_id="ins_2", type="blocker", text="Unrelated blocker", confidence=0.8, embedding=v2_unrelated),
    ]

    new = [
        # Exactly matched ID, updated text
        Insight(insight_id="ins_1", type="consensus", text="Updated text", confidence=0.95, embedding=v1_slightly_diff),
        # Brand new insight
        Insight(insight_id="ins_3", type="debate", text="New debate", confidence=0.85, embedding=[0.5]*768),
    ]

    deltas = differ.compute_diff(prev, new)
    actions = {d.insight.insight_id: d.action for d in deltas}

    assert actions["ins_1"] == "updated"
    assert actions["ins_2"] == "removed"
    assert actions["ins_3"] == "added"
