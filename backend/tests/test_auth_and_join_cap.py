import pytest
from app.chat.service import ChatService
from app.core.exceptions import BubbleFullException


@pytest.mark.anyio
async def test_join_hard_cap_enforcement(mock_db):
    chat_svc = ChatService(mock_db)
    bubble_id = "test-cap-bubble"

    # Initialize bubble with 0 members
    await mock_db.collection("bubbles").document(bubble_id).set({
        "id": bubble_id,
        "title": "Hard Cap Test",
        "member_count": 0,
        "pop_state": "ACTIVE",
    })

    # Join 10 participants successfully
    for i in range(1, 11):
        member = await chat_svc.join_bubble_transactional(
            bubble_id=bubble_id,
            user_id=f"user_{i}",
            display_name=f"User {i}",
        )
        assert member.id == f"user_{i}"

    bubble_snap = await mock_db.collection("bubbles").document(bubble_id).get()
    assert bubble_snap.to_dict()["member_count"] == 10

    # 11th participant MUST be rejected with BubbleFullException
    with pytest.raises(BubbleFullException):
        await chat_svc.join_bubble_transactional(
            bubble_id=bubble_id,
            user_id="user_11",
            display_name="User 11",
        )

    # Existing participant rejoining should succeed and not increment count
    rejoin_member = await chat_svc.join_bubble_transactional(
        bubble_id=bubble_id,
        user_id="user_5",
        display_name="User 5 Updated",
    )
    assert rejoin_member.id == "user_5"

    bubble_snap_after = await mock_db.collection("bubbles").document(bubble_id).get()
    assert bubble_snap_after.to_dict()["member_count"] == 10
