import pytest
import asyncio
from app.chat.service import ChatService
from app.models.message import PostMessageRequest
from app.core.exceptions import BubbleFullException


@pytest.mark.anyio
async def test_100_concurrent_participants_simulation(mock_db):
    chat_svc = ChatService(mock_db)
    bubble_id = "load-test-bubble"

    await mock_db.collection("bubbles").document(bubble_id).set({
        "id": bubble_id,
        "title": "High Concurrency Simulation",
        "member_count": 0,
        "pop_state": "ACTIVE",
        "last_seq": 0,
        "trigger_mode": "mention",
    })

    # 1. 100 concurrent join requests
    async def try_join(user_index: int):
        try:
            member = await chat_svc.join_bubble_transactional(
                bubble_id=bubble_id,
                user_id=f"concurrent_user_{user_index}",
                display_name=f"Participant {user_index}",
            )
            return True, member
        except BubbleFullException:
            return False, None

    join_results = await asyncio.gather(*[try_join(i) for i in range(100)])

    admitted = [res for success, res in join_results if success]
    rejected_count = sum(1 for success, _ in join_results if not success)

    # Exactly 10 must be admitted and 90 rejected
    assert len(admitted) == 10
    assert rejected_count == 90

    # 2. 10 admitted participants post 10 messages each simultaneously (100 total messages)
    async def post_burst(user_id: str, msg_num: int):
        return await chat_svc.post_message_transactional(
            bubble_id=bubble_id,
            user_id=user_id,
            user_name=f"User {user_id}",
            user_avatar=None,
            req=PostMessageRequest(text=f"Concurrent message #{msg_num} from {user_id}"),
        )

    burst_tasks = []
    for member in admitted:
        for m_idx in range(10):
            burst_tasks.append(post_burst(member.id, m_idx))

    created_messages = await asyncio.gather(*burst_tasks)

    # Verify monotonic sequencing across all 100 messages
    seq_numbers = [m.seq for m in created_messages]
    assert len(seq_numbers) == 100
    assert len(set(seq_numbers)) == 100  # Zero duplicate sequence numbers!
    assert min(seq_numbers) == 1
    assert max(seq_numbers) == 100
