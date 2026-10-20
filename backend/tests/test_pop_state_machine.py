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

    # Dry-run produces a briefing but must leave the bubble and its data active.
    final_state = await sm.initiate_pop(
        bubble_id=bubble_id,
        actor_id="host-1",
        req=PopBubbleRequest(dry_run=True),
    )

    assert final_state == "ACTIVE"
    snap = await mock_db.collection("bubbles").document(bubble_id).get()
    assert snap.to_dict()["pop_state"] == "ACTIVE"
    assert snap.to_dict()["is_live"] is True


@pytest.mark.anyio
async def test_stale_expiry_task_does_not_pop_extended_bubble(mock_db):
    from datetime import datetime, timedelta, timezone

    sm = PopStateMachine(mock_db)
    bubble_id = "extended-pop-bubble"
    future_expiry = datetime.now(timezone.utc) + timedelta(minutes=10)
    await mock_db.collection("bubbles").document(bubble_id).set({
        "id": bubble_id,
        "title": "Extended Session",
        "pop_state": "ACTIVE",
        "host_id": "host-1",
        "expires_at": future_expiry,
    })

    result = await sm.initiate_pop(bubble_id, actor_id="system", is_timer_expiry=True)

    assert result == "ACTIVE"
    snap = await mock_db.collection("bubbles").document(bubble_id).get()
    assert snap.to_dict()["pop_state"] == "ACTIVE"
    assert snap.to_dict()["expires_at"] == future_expiry
