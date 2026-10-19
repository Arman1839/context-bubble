from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.core.firestore_compat import firestore

from app.core.config import settings
from app.core.exceptions import (
    BubbleNotFoundException,
    BubbleFullException,
    BubblePoppedException,
)
from app.core.logging import logger
from app.models.bubble import BubbleMember
from app.models.message import Message, PostMessageRequest
from app.llm.factory import get_llm_adapter
from app.chat.ai_participant import AIParticipantHandler
from app.intelligence.debounce import DebounceManager
from app.intelligence.synthesizer import IntelligenceSynthesizer

# Singleton AI participant handler — persists across requests so background tasks
# are not garbage-collected when ChatService goes out of scope
_ai_participant: Optional[AIParticipantHandler] = None
_debounce_manager: Optional[DebounceManager] = None
_synthesizer: Optional[IntelligenceSynthesizer] = None

def get_ai_participant(db, llm) -> AIParticipantHandler:
    global _ai_participant
    if _ai_participant is None:
        _ai_participant = AIParticipantHandler(db, llm)
    return _ai_participant

def get_debounce_manager(db) -> DebounceManager:
    global _debounce_manager
    if _debounce_manager is None:
        _debounce_manager = DebounceManager(db)
    return _debounce_manager

def get_synthesizer(db, llm) -> IntelligenceSynthesizer:
    global _synthesizer
    if _synthesizer is None:
        _synthesizer = IntelligenceSynthesizer(db, llm)
    return _synthesizer


class ChatService:
    def __init__(self, db: firestore.AsyncClient):
        self.db = db
        self.llm = get_llm_adapter()
        self.ai_participant = get_ai_participant(db, self.llm)
        self.synthesizer = get_synthesizer(db, self.llm)
        self.debounce = get_debounce_manager(db)

    async def join_bubble_transactional(
        self,
        bubble_id: str,
        user_id: str,
        display_name: str,
        avatar_url: Optional[str] = None,
        role: str = "participant",
    ) -> BubbleMember:
        """
        Enforces HARD CAP of 10 participants via a Firestore atomic transaction.
        Gracefully handles rejoins and duplicate joins without consuming extra slots.
        """
        bubble_ref = self.db.collection("bubbles").document(bubble_id)
        member_ref = bubble_ref.collection("participants").document(user_id)

        @firestore.async_transactional
        async def _join_tx(transaction: firestore.AsyncTransaction) -> BubbleMember:
            b_snap = await bubble_ref.get(transaction=transaction)
            if not b_snap.exists:
                raise BubbleNotFoundException(bubble_id)

            b_data = b_snap.to_dict() or {}
            if b_data.get("pop_state") != "ACTIVE":
                raise BubblePoppedException(bubble_id)

            existing_member_snap = await member_ref.get(transaction=transaction)
            current_count = b_data.get("member_count", 0)

            if not existing_member_snap.exists:
                # If joining for the first time, check hard cap
                if current_count >= settings.BUBBLE_MAX_PARTICIPANTS:
                    raise BubbleFullException(bubble_id, limit=settings.BUBBLE_MAX_PARTICIPANTS)

                new_count = current_count + 1
                transaction.update(bubble_ref, {"member_count": new_count})
            else:
                new_count = current_count

            member_data = {
                "id": user_id,
                "name": display_name,
                "avatar": avatar_url or f"https://api.dicebear.com/9.x/notionists/svg?seed={user_id}",
                "role": role,
                "joined_at": firestore.SERVER_TIMESTAMP,
                "last_seen_at": firestore.SERVER_TIMESTAMP,
            }
            transaction.set(member_ref, member_data, merge=True)
            return BubbleMember(**{**member_data, "joined_at": datetime.now(timezone.utc), "last_seen_at": datetime.now(timezone.utc)})

        tx = self.db.transaction()
        joined_member = await _join_tx(tx)

        # Broadcast member join to SSE stream for all peers
        try:
            from app.intelligence.stream_manager import stream_manager
            await stream_manager.broadcast(
                bubble_id=bubble_id,
                event_type="member_joined",
                data=joined_member.model_dump(mode="json"),
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast member_joined event: {e}")

        return joined_member

    async def post_message_transactional(
        self,
        bubble_id: str,
        user_id: str,
        user_name: str,
        user_avatar: Optional[str],
        req: PostMessageRequest,
    ) -> Message:
        bubble_ref = self.db.collection("bubbles").document(bubble_id)

        # Idempotency check
        if req.idempotency_key:
            existing = (
                await bubble_ref.collection("messages")
                .where("idempotency_key", "==", req.idempotency_key)
                .limit(1)
                .get()
            )
            if existing:
                doc = existing[0]
                return Message(**doc.to_dict())

        @firestore.async_transactional
        async def _post_msg_tx(transaction: firestore.AsyncTransaction) -> Message:
            b_snap = await bubble_ref.get(transaction=transaction)
            if not b_snap.exists:
                raise BubbleNotFoundException(bubble_id)

            b_data = b_snap.to_dict() or {}
            if b_data.get("pop_state") != "ACTIVE":
                raise BubblePoppedException(bubble_id)

            # Monotonic sequence assignment
            next_seq = b_data.get("last_seq", 0) + 1
            transaction.update(bubble_ref, {"last_seq": next_seq, "updated_at": firestore.SERVER_TIMESTAMP})

            is_anon = req.is_anonymous if req.is_anonymous is not None else b_data.get("anonymous_mode_enabled", False)
            author_display = "Anonymous" if is_anon else user_name
            author_av = None if is_anon else user_avatar

            msg_ref = bubble_ref.collection("messages").document()
            msg_data = {
                "id": msg_ref.id,
                "bubble_id": bubble_id,
                "seq": next_seq,
                "type": "user",
                "author_id": user_id,
                "author_name": author_display,
                "author_avatar": author_av,
                "is_anonymous": is_anon,
                "text": req.text,
                "attachments": [a.model_dump(mode="json") for a in req.attachments] if req.attachments else None,
                "created_at": firestore.SERVER_TIMESTAMP,
                "idempotency_key": req.idempotency_key,
            }
            transaction.set(msg_ref, msg_data)

            # Also mirror into contributions collection for RAG indexing
            contrib_ref = bubble_ref.collection("contributions").document(msg_ref.id)
            transaction.set(contrib_ref, {
                **msg_data,
                "timestamp": firestore.SERVER_TIMESTAMP,
                "source_type": "chat"
            })

            return Message(**{**msg_data, "created_at": datetime.now(timezone.utc)})

        tx = self.db.transaction()
        created_msg = await _post_msg_tx(tx)

        # Broadcast message to live SSE stream for real-time peer synchronization
        try:
            from app.intelligence.stream_manager import stream_manager
            await stream_manager.broadcast(
                bubble_id=bubble_id,
                event_type="message",
                data=created_msg.model_dump(mode="json"),
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast message event: {e}")

        # Trigger background processing
        # 1. Trigger Bubble AI participant check
        bubble_snap = await bubble_ref.get()
        trigger_mode = bubble_snap.to_dict().get("trigger_mode", "mention")
        self.ai_participant.on_new_message(bubble_id, trigger_mode, req.text)

        # 2. Trigger debounce trailing window for live intelligence synthesis
        self.debounce.notify_event(bubble_id, self.synthesizer.run_synthesis)

        return created_msg
