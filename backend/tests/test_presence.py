import pytest

from app.chat.presence import EphemeralPresenceManager


@pytest.mark.anyio
async def test_active_presence_excludes_explicitly_offline_participants():
    manager = EphemeralPresenceManager()
    await manager.update_presence("bubble-1", "host-1", "Host", status="online")
    await manager.update_presence("bubble-1", "guest-1", "Guest", status="online")
    await manager.update_presence("bubble-1", "guest-1", "Guest", status="offline")

    active = manager.get_active_members("bubble-1")
    assert [member.user_id for member in active] == ["host-1"]
