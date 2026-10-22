import uuid
from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
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
from app.chat.presence import presence_manager
from app.intelligence.stream_manager import stream_manager
from app.pop.scheduler import PopScheduler

router = APIRouter()


class AnonymousModeRequest(BaseModel):
    enabled: bool


class UpdateHostIdentityRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=50)
    avatar_url: str | None = None
    avatar_animal: str | None = None


@router.post("", response_model=BubbleResponse, status_code=status.HTTP_201_CREATED)
async def create_bubble(
    req: CreateBubbleRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    bubble_id = str(uuid.uuid4())[:8]
    join_code = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=req.duration_minutes)

    bubble_doc_ref = db.collection("bubbles").document(bubble_id)
    host_member = BubbleMember(
        id=user.uid,
        name=user.name,
        avatar=req.host_avatar_url or f"https://api.dicebear.com/9.x/notionists/svg?seed={user.uid}",
        avatar_animal=req.host_avatar_animal,
        role="host",
    )

    bubble_data = {
        "id": bubble_id,
        "join_code": join_code,
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
        join_code=join_code,
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
        avatar_animal=req.avatar_animal,
        join_code=req.join_code,
    )
    return member


@router.patch("/{bubble_id}/host/identity")
async def update_host_identity(
    bubble_id: str,
    req: UpdateHostIdentityRequest,
    host=Depends(require_bubble_host),
):
    """Update the host's display name and avatar before entering the room."""
    db = get_async_firestore_client()
    member_ref = db.collection("bubbles").document(bubble_id).collection("participants").document(host["id"])
    member_snap = await member_ref.get()
    member_data = member_snap.to_dict() or {}
    if not member_snap.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host membership was not found.")

    updated_fields = {
        "name": req.display_name.strip(),
        "avatar": req.avatar_url if not req.avatar_animal else None,
        "avatar_animal": req.avatar_animal,
        "last_seen_at": firestore.SERVER_TIMESTAMP,
    }
    await member_ref.update(updated_fields)
    member_data.update({**updated_fields, "last_seen_at": datetime.now(timezone.utc)})
    updated_member = BubbleMember(**member_data)
    member_payload = updated_member.model_dump(mode="json")
    await presence_manager.update_presence(bubble_id, host["id"], req.display_name.strip())
    await stream_manager.broadcast(bubble_id, "member_joined", member_payload)
    return member_payload


@router.get("/history")
async def list_bubble_history(user: AuthenticatedUser = Depends(get_current_user)):
    """List bubbles attended by this user, including non-viewable tombstones."""
    db = get_async_firestore_client()
    docs = await db.collection("user_bubble_history").document(user.uid).collection("bubbles").get()
    rows = [doc.to_dict() or {} for doc in docs]
    rows.sort(key=lambda row: row.get("popped_at", ""), reverse=True)
    now = datetime.now(timezone.utc)
    for row in rows:
        until = row.get("view_until")
        if isinstance(until, str):
            try:
                until = datetime.fromisoformat(until)
            except ValueError:
                until = None
        if until and until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        if row.get("retention_policy") == "view-only" and until and until <= now:
            row["is_viewable"] = False
    return rows


@router.delete("/history/{bubble_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bubble_history_entry(
    bubble_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Remove one bubble from the current user's personal history."""
    db = get_async_firestore_client()
    history_ref = (
        db.collection("user_bubble_history").document(user.uid)
        .collection("bubbles").document(bubble_id)
    )
    await history_ref.delete()


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_bubble_history(user: AuthenticatedUser = Depends(get_current_user)):
    """Clear the current user's personal bubble history."""
    db = get_async_firestore_client()
    entries = await db.collection("user_bubble_history").document(user.uid).collection("bubbles").get()
    for entry in entries:
        await entry.reference.delete()


@router.get("/{bubble_id}", response_model=BubbleResponse)
async def get_bubble(
    bubble_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    bubbles_ref = db.collection("bubbles")
    snap = await bubbles_ref.document(bubble_id).get()
    if not snap.exists:
        matches = await bubbles_ref.where("join_code", "==", bubble_id).limit(1).get()
        if matches:
            snap = matches[0]
            bubble_id = snap.id
    if not snap.exists:
        raise BubbleNotFoundException(bubble_id)

    data = snap.to_dict() or {}
    if data.get("pop_state") == "POPPED":
        history_snap = await (
            db.collection("user_bubble_history").document(user.uid)
            .collection("bubbles").document(bubble_id).get()
        )
        history = history_snap.to_dict() or {}
        if not history_snap.exists or not history.get("is_viewable"):
            raise BubbleNotFoundException(bubble_id)
        until = data.get("view_until")
        if isinstance(until, str):
            try:
                until = datetime.fromisoformat(until)
            except ValueError:
                until = None
        if until and until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        if until and until <= datetime.now(timezone.utc):
            raise BubbleNotFoundException(bubble_id)
    # Fetch members list
    members_snap = await db.collection("bubbles").document(bubble_id).collection("participants").get()
    members = [BubbleMember(**m.to_dict()) for m in members_snap]

    # Fetch latest intelligence snapshot
    intel_snap = await db.collection("bubbles").document(bubble_id).collection("intelligence").document("latest").get()
    intelligence = None
    if intel_snap.exists:
        intelligence = intel_snap.to_dict() or {}

    exp = data.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None

    cat = data.get("created_at")
    if isinstance(cat, str):
        try:
            cat = datetime.fromisoformat(cat)
        except Exception:
            cat = datetime.now(timezone.utc)
    elif not isinstance(cat, datetime):
        cat = datetime.now(timezone.utc)

    return BubbleResponse(
        id=bubble_id,
        title=data.get("title", ""),
        is_live=data.get("is_live", True),
        expires_at=exp,
        member_count=data.get("member_count", len(members)),
        members=members,
        retention_policy=data.get("retention_policy", "temporary"),
        anonymous_mode_enabled=data.get("anonymous_mode_enabled", False),
        host_id=data.get("host_id", ""),
        pop_state=data.get("pop_state", "ACTIVE"),
        trigger_mode=data.get("trigger_mode", "mention"),
        e2ee_enabled=data.get("e2ee_enabled", False),
        created_at=cat,
        intelligence=intelligence,
        expiry_decision_deadline=data.get("expiry_decision_deadline"),
        view_until=data.get("view_until"),
        join_code=data.get("join_code") or bubble_id,
    )


@router.patch("/{bubble_id}/anonymous-mode")
async def update_anonymous_mode(
    bubble_id: str,
    req: AnonymousModeRequest,
    host=Depends(require_bubble_host),
):
    db = get_async_firestore_client()
    bubble_ref = db.collection("bubbles").document(bubble_id)
    snap = await bubble_ref.get()
    if not snap.exists:
        raise BubbleNotFoundException(bubble_id)
    await bubble_ref.update({
        "anonymous_mode_enabled": req.enabled,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    await stream_manager.broadcast(bubble_id, "anonymous_mode_updated", {"enabled": req.enabled})
    return {"status": "updated", "anonymous_mode_enabled": req.enabled}


@router.post("/{bubble_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_bubble(
    bubble_id: str,
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    if participant.get("role") == "host":
        raise HTTPException(status_code=400, detail="The host cannot leave; end the bubble instead.")

    db = get_async_firestore_client()
    bubble_ref = db.collection("bubbles").document(bubble_id)
    member_ref = bubble_ref.collection("participants").document(user.uid)
    tx = db.transaction()

    @firestore.async_transactional
    async def _leave(transaction):
        member = await member_ref.get(transaction=transaction)
        if member.exists:
            bubble = await bubble_ref.get(transaction=transaction)
            bubble_data = bubble.to_dict() or {}
            transaction.delete(member_ref)
            transaction.update(bubble_ref, {"member_count": max(0, int(bubble_data.get("member_count", 1)) - 1)})
            return True
        return False

    removed = await _leave(tx)
    if not removed:
        raise HTTPException(status_code=404, detail="You are no longer a member of this bubble.")

    await presence_manager.update_presence(bubble_id, user.uid, participant.get("name", user.name), status="offline")
    await stream_manager.broadcast(bubble_id, "member_left", {
        "user_id": user.uid,
        "display_name": participant.get("name", user.name),
    })
    return None


@router.delete("/{bubble_id}/participants/{participant_id}")
async def remove_bubble_participant(
    bubble_id: str,
    participant_id: str,
    host=Depends(require_bubble_host),
):
    db = get_async_firestore_client()
    bubble_ref = db.collection("bubbles").document(bubble_id)
    bubble_snap = await bubble_ref.get()
    if not bubble_snap.exists:
        raise BubbleNotFoundException(bubble_id)
    if (bubble_snap.to_dict() or {}).get("host_id") == participant_id:
        raise HTTPException(status_code=400, detail="The host cannot be removed from the bubble.")

    member_ref = bubble_ref.collection("participants").document(participant_id)
    member_snap = await member_ref.get()
    if not member_snap.exists:
        raise HTTPException(status_code=404, detail="Participant not found.")
    member_data = member_snap.to_dict() or {}
    tx = db.transaction()
    new_join_code = uuid.uuid4().hex[:8]

    @firestore.async_transactional
    async def _remove(transaction):
        member = await member_ref.get(transaction=transaction)
        if not member.exists:
            return False
        bubble = await bubble_ref.get(transaction=transaction)
        current = (bubble.to_dict() or {}).get("member_count", 1)
        transaction.delete(member_ref)
        transaction.update(bubble_ref, {
            "member_count": max(0, int(current) - 1),
            "join_code": new_join_code,
            "updated_at": firestore.SERVER_TIMESTAMP,
        })
        transaction.set(bubble_ref.collection("removed_participants").document(participant_id), {
            "id": participant_id,
            "name": member_data.get("name", "Participant"),
            "removed_at": firestore.SERVER_TIMESTAMP,
        })
        return True

    removed = await _remove(tx)
    if not removed:
        raise HTTPException(status_code=404, detail="Participant not found.")
    await presence_manager.update_presence(bubble_id, participant_id, member_data.get("name", "Participant"), status="offline")
    await stream_manager.broadcast(bubble_id, "member_removed", {"user_id": participant_id, "removed_by_host": True})
    return {"join_code": new_join_code}


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
    pop_state = data.get("pop_state", "ACTIVE")
    if pop_state == "EXPIRY_PENDING":
        deadline = data.get("expiry_decision_deadline")
        if isinstance(deadline, str):
            try:
                deadline = datetime.fromisoformat(deadline)
            except ValueError:
                deadline = None
        if deadline and deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        if deadline and deadline < datetime.now(timezone.utc):
            raise BubblePoppedException(bubble_id)
    elif pop_state != "ACTIVE":
        raise BubblePoppedException(bubble_id)

    cur_expires: datetime = data.get("expires_at")
    new_expires = cur_expires + timedelta(minutes=req.additional_minutes)

    await bubble_ref.update({
        "expires_at": new_expires,
        "pop_state": "ACTIVE",
        "is_live": True,
        "expiry_decision_deadline": None,
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
