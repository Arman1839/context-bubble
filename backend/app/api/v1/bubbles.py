import uuid
from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, status
from app.core.firestore_compat import firestore

from app.api.deps import (
    AuthenticatedUser,
    get_current_user,
    get_bubble_participant,
    require_bubble_host,
)
from app.core.exceptions import BubbleNotFoundException, BubblePoppedException
from app.models.bubble import (
    CreateBubbleRequest,
    JoinBubbleRequest,
    ExtendBubbleRequest,
    UpdateTriggerModeRequest,
    BubbleResponse,
    BubbleMember,
)
from app.services.firebase import get_async_firestore_client
from app.chat.service import ChatService
from app.pop.scheduler import PopScheduler

router = APIRouter()


@router.post("", response_model=BubbleResponse, status_code=status.HTTP_201_CREATED)
async def create_bubble(
    req: CreateBubbleRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    bubble_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=req.duration_minutes)

    bubble_doc_ref = db.collection("bubbles").document(bubble_id)
    host_member = BubbleMember(
        id=user.uid,
        name=user.name,
        avatar=f"https://api.dicebear.com/9.x/notionists/svg?seed={user.uid}",
        role="host",
    )

    bubble_data = {
        "id": bubble_id,
        "title": req.title,
        "is_live": True,
        "expires_at": expires_at,
        "member_count": 1,
        "retention_policy": req.retention_policy,
        "anonymous_mode_enabled": req.anonymous_mode_enabled,
        "host_id": user.uid,
        "pop_state": "ACTIVE",
        "trigger_mode": req.trigger_mode,
        "token_budget": req.token_budget or 250000,
        "tokens_used": 0,
        "e2ee_enabled": req.e2ee_enabled,
        "e2ee_public_key": req.e2ee_public_key,
        "last_seq": 0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    await bubble_doc_ref.set(bubble_data)
    await bubble_doc_ref.collection("participants").document(user.uid).set(host_member.model_dump(mode="json"))

    # Schedule Cloud Tasks pop timer
    scheduler = PopScheduler(db)
    scheduler.schedule_pop_task(bubble_id=bubble_id, run_at=expires_at)

    return BubbleResponse(
        id=bubble_id,
        title=req.title,
        is_live=True,
        expires_at=expires_at,
        member_count=1,
        members=[host_member],
        retention_policy=req.retention_policy,
        anonymous_mode_enabled=req.anonymous_mode_enabled,
        host_id=user.uid,
        pop_state="ACTIVE",
        trigger_mode=req.trigger_mode,
        e2ee_enabled=req.e2ee_enabled,
        created_at=now,
    )


@router.post("/{bubble_id}/join", response_model=BubbleMember)
async def join_bubble(
    bubble_id: str,
    req: JoinBubbleRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    chat_svc = ChatService(db)
    member = await chat_svc.join_bubble_transactional(
        bubble_id=bubble_id,
        user_id=user.uid,
        display_name=req.display_name,
        avatar_url=req.avatar_url,
    )
    return member


@router.get("/{bubble_id}", response_model=BubbleResponse)
async def get_bubble(
    bubble_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    snap = await db.collection("bubbles").document(bubble_id).get()
    if not snap.exists:
        raise BubbleNotFoundException(bubble_id)

    data = snap.to_dict() or {}
    # Fetch members list
    members_snap = await db.collection("bubbles").document(bubble_id).collection("participants").get()
    members = [BubbleMember(**m.to_dict()) for m in members_snap]

    return BubbleResponse(
        id=bubble_id,
        title=data.get("title", ""),
        is_live=data.get("is_live", True),
        expires_at=data.get("expires_at"),
        member_count=data.get("member_count", len(members)),
        members=members,
        retention_policy=data.get("retention_policy", "temporary"),
        anonymous_mode_enabled=data.get("anonymous_mode_enabled", False),
        host_id=data.get("host_id", ""),
        pop_state=data.get("pop_state", "ACTIVE"),
        trigger_mode=data.get("trigger_mode", "mention"),
        e2ee_enabled=data.get("e2ee_enabled", False),
        created_at=data.get("created_at") or datetime.now(timezone.utc),
    )


@router.post("/{bubble_id}/extend")
async def extend_bubble(
    bubble_id: str,
    req: ExtendBubbleRequest,
    host=Depends(require_bubble_host),
):
    db = get_async_firestore_client()
    bubble_ref = db.collection("bubbles").document(bubble_id)
    snap = await bubble_ref.get()
    if not snap.exists:
        raise BubbleNotFoundException(bubble_id)

    data = snap.to_dict() or {}
    if data.get("pop_state") != "ACTIVE":
        raise BubblePoppedException(bubble_id)

    cur_expires: datetime = data.get("expires_at")
    new_expires = cur_expires + timedelta(minutes=req.additional_minutes)

    await bubble_ref.update({
        "expires_at": new_expires,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    # Reschedule Cloud Tasks pop timer
    scheduler = PopScheduler(db)
    scheduler.schedule_pop_task(bubble_id=bubble_id, run_at=new_expires)

    return {"status": "extended", "new_expires_at": new_expires}


@router.patch("/{bubble_id}/trigger-mode")
async def update_trigger_mode(
    bubble_id: str,
    req: UpdateTriggerModeRequest,
    host=Depends(require_bubble_host),
):
    db = get_async_firestore_client()
    bubble_ref = db.collection("bubbles").document(bubble_id)
    await bubble_ref.update({
        "trigger_mode": req.trigger_mode,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"status": "updated", "trigger_mode": req.trigger_mode}
