from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from app.core.firestore_compat import firestore

from app.api.deps import (
    AuthenticatedUser,
    get_current_user,
    get_bubble_participant,
)
from app.core.exceptions import BubbleNotFoundException
from app.models.message import Message, PostMessageRequest, PresenceUpdate
from app.services.firebase import get_async_firestore_client
from app.chat.service import ChatService
from app.chat.presence import presence_manager

router = APIRouter()


@router.post("", response_model=Message, status_code=status.HTTP_201_CREATED)
async def post_message(
    bubble_id: str,
    req: PostMessageRequest,
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    chat_svc = ChatService(db)

    msg = await chat_svc.post_message_transactional(
        bubble_id=bubble_id,
        user_id=user.uid,
        user_name=participant.get("name", user.name),
        user_avatar=participant.get("avatar"),
        req=req,
    )
    return msg


@router.get("", response_model=List[Message])
async def list_messages(
    bubble_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    b_snap = await db.collection("bubbles").document(bubble_id).get()
    if not b_snap.exists:
        raise BubbleNotFoundException(bubble_id)

    snap = await (
        db.collection("bubbles")
        .document(bubble_id)
        .collection("messages")
        .order_by("seq", direction=firestore.Query.ASCENDING)
        .limit(limit)
        .get()
    )
    return [Message(**m.to_dict()) for m in snap]


@router.post("/presence")
async def update_presence(
    bubble_id: str,
    is_typing: bool = Query(default=False),
    presence_status: str = Query(default="online", alias="status"),
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    await presence_manager.update_presence(
        bubble_id=bubble_id,
        user_id=user.uid,
        display_name=participant.get("name", user.name),
        status=presence_status,
        is_typing=is_typing,
    )
    return {"status": "ok"}
