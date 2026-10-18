import pytest
from app.pop.state_machine import PopStateMachine
from app.models.export import PopBubbleRequest


@pytest.mark.anyio
async def test_pop_state_machine_flow(mock_db):
    sm = PopStateMachine(mock_db)
    bubble_id = "test-pop-bubble"

    await mock_db.collection("bubbles").document(bubble_id).set({
        "id": bubble_id,
        "title": "Strategy Discussion",
        "pop_state": "ACTIVE",
        "host_id": "host-1",
    })

    # Execute dry-run pop
    final_state = await sm.initiate_pop(
        bubble_id=bubble_id,
        actor_id="host-1",
        req=PopBubbleRequest(dry_run=True),
    )

    assert final_state == "POPPED"
    snap = await mock_db.collection("bubbles").document(bubble_id).get()
    assert snap.to_dict()["pop_state"] == "POPPED"
