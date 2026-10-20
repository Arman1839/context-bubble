import time
from typing import Dict, List
from app.models.message import PresenceUpdate
from app.intelligence.stream_manager import stream_manager


class EphemeralPresenceManager:
    """
    Manages in-memory presence and typing indicators without persisting to Firestore.
    Broadcasts updates via SSE to all connected peers in the bubble.
    """

    def __init__(self, heartbeat_timeout_seconds: float = 20.0):
        self.heartbeat_timeout = heartbeat_timeout_seconds
        # bubble_id -> { user_id: (PresenceUpdate, last_seen_epoch) }
        self._presence: Dict[str, Dict[str, tuple[PresenceUpdate, float]]] = {}

    async def update_presence(
        self,
        bubble_id: str,
        user_id: str,
        display_name: str,
        status: str = "online",
        is_typing: bool = False
    ):
        now = time.time()
        if bubble_id not in self._presence:
            self._presence[bubble_id] = {}

        update = PresenceUpdate(
            user_id=user_id,
            display_name=display_name,
            status=status,
            is_typing=is_typing,
        )
        self._presence[bubble_id][user_id] = (update, now)

        # Broadcast ephemeral presence event over SSE
        await stream_manager.broadcast(
            bubble_id=bubble_id,
            event_type="presence",
            data=update.model_dump(mode="json")
        )

    def get_active_members(self, bubble_id: str) -> List[PresenceUpdate]:
        now = time.time()
        active = []
        if bubble_id in self._presence:
            for uid, (presence, last_seen) in list(self._presence[bubble_id].items()):
                if presence.status != "offline" and now - last_seen <= self.heartbeat_timeout:
                    active.append(presence)
                else:
                    self._presence[bubble_id].pop(uid, None)
        return active


presence_manager = EphemeralPresenceManager()
