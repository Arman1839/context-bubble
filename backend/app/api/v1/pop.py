from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from app.core.firestore_compat import firestore

from app.api.deps import require_bubble_host, get_bubble_participant, AuthenticatedUser, get_current_user
from app.core.config import settings
from app.models.export import PopBubbleRequest, ExportConfig, ExportRecord
from app.services.firebase import get_async_firestore_client
from app.pop.state_machine import PopStateMachine
from app.pop.scheduler import PopScheduler

router = APIRouter()


class TaskExecutePayload(BaseModel):
    bubble_id: str


@router.post("")
async def pop_bubble(
    bubble_id: str,
    req: PopBubbleRequest = PopBubbleRequest(),
    host=Depends(require_bubble_host),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Host action to pop the bubble, generate executive briefing, export, and crypto-shred."""
    db = get_async_firestore_client()
    state_machine = PopStateMachine(db)
    final_state = await state_machine.initiate_pop(
        bubble_id=bubble_id,
        actor_id=user.uid,
        req=req,
        is_timer_expiry=False,
    )
    return {"status": "ok", "pop_state": final_state}


@router.get("/status")
async def get_pop_status(
    bubble_id: str,
    participant=Depends(get_bubble_participant),
):
    db = get_async_firestore_client()
    snap = await db.collection("bubbles").document(bubble_id).get()
    if not snap.exists:
        return {"pop_state": "POPPED"}

    bdata = snap.to_dict() or {}
    exports_snap = await db.collection("bubbles").document(bubble_id).collection("exports").get()
    exports = [ExportRecord(**e.to_dict()) for e in exports_snap]

    return {
        "bubble_id": bubble_id,
        "pop_state": bdata.get("pop_state", "ACTIVE"),
        "popped_at": bdata.get("popped_at"),
        "exports": exports,
    }


@router.get("/briefing")
async def get_briefing(
    bubble_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Returns the real executive briefing generated during pop."""
    db = get_async_firestore_client()
    snap = await db.collection("bubbles").document(bubble_id).collection("briefing").document("latest").get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Briefing not found for this bubble.")
    return snap.to_dict()


@router.post("/export-config")
async def configure_export_target(
    bubble_id: str,
    config: ExportConfig,
    host=Depends(require_bubble_host),
):
    db = get_async_firestore_client()
    cfg_ref = db.collection("bubbles").document(bubble_id).collection("export_configs").document(config.target)
    await cfg_ref.set(config.model_dump(mode="json"))
    return {"status": "configured", "target": config.target}


@router.post("/tasks/execute")
async def execute_cloud_task_pop(
    payload: TaskExecutePayload,
    x_server_internal_secret: Optional[str] = Header(None, alias="X-Server-Internal-Secret"),
):
    """Internal webhook called by Google Cloud Tasks when the timer hits zero."""
    if x_server_internal_secret != settings.SERVER_INTERNAL_SECRET and settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal task secret.")

    db = get_async_firestore_client()
    state_machine = PopStateMachine(db)
    final_state = await state_machine.initiate_pop(
        bubble_id=payload.bubble_id,
        actor_id="system-cloud-task",
        req=PopBubbleRequest(force_shred_on_export_failure=False),
        is_timer_expiry=True,
    )
    return {"status": "task_executed", "bubble_id": payload.bubble_id, "pop_state": final_state}


@router.post("/tasks/sweeper")
async def execute_sweeper(
    x_server_internal_secret: Optional[str] = Header(None, alias="X-Server-Internal-Secret"),
):
    """Internal webhook called by Google Cloud Scheduler to check for missed expired bubbles."""
    if x_server_internal_secret != settings.SERVER_INTERNAL_SECRET and settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal secret.")

    db = get_async_firestore_client()
    scheduler = PopScheduler(db)
    state_machine = PopStateMachine(db)

    async def _sweeper_pop_cb(bubble_id: str, is_timer_expired: bool = True):
        await state_machine.initiate_pop(
            bubble_id=bubble_id,
            actor_id="system-sweeper",
            is_timer_expiry=True,
        )

    await scheduler.run_sweeper_backstop(_sweeper_pop_cb)
    return {"status": "sweeper_completed"}
