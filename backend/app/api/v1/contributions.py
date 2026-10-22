from typing import List
from fastapi import APIRouter, Depends, Query, status
from app.core.firestore_compat import firestore

from app.api.deps import (
    AuthenticatedUser,
    get_current_user,
    get_bubble_participant,
)
from app.models.message import Contribution, Attachment
from app.services.firebase import get_async_firestore_client
from app.rag.pipeline import RAGPipeline
from app.llm.factory import get_llm_adapter
from app.intelligence.debounce import DebounceManager
from app.intelligence.synthesizer import IntelligenceSynthesizer

router = APIRouter()


@router.post("", response_model=Contribution, status_code=status.HTTP_201_CREATED)
async def create_contribution(
    bubble_id: str,
    contrib: Contribution,
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    db = get_async_firestore_client()
    llm = get_llm_adapter()
    rag = RAGPipeline(db, llm)
    synthesizer = IntelligenceSynthesizer(db, llm)
    debounce = DebounceManager(db)

    contrib_ref = db.collection("bubbles").document(bubble_id).collection("contributions").document(contrib.id)
    bubble_snap = await db.collection("bubbles").document(bubble_id).get()
    bubble_data = bubble_snap.to_dict() or {}
    is_anonymous = bool(contrib.is_anonymous and bubble_data.get("anonymous_mode_enabled", False))
    doc_data = contrib.model_dump(mode="json")
    doc_data.update({
        "author_id": f"anonymous-{contrib.id}" if is_anonymous else user.uid,
        "author_name": "Anonymous" if is_anonymous else participant.get("name", user.name),
        "author_avatar": None if is_anonymous else participant.get("avatar"),
        "author_animal": None if is_anonymous else participant.get("avatar_animal"),
        "is_anonymous": is_anonymous,
    })
    doc_data["timestamp"] = firestore.SERVER_TIMESTAMP

    await contrib_ref.set(doc_data)

    # Index into RAG vector store
    await rag.ingest_and_index(
        bubble_id=bubble_id,
        source_id=contrib.id,
        text=contrib.text,
        extra_metadata={
            "author_id": "anonymous" if is_anonymous else user.uid,
            "author_name": "Anonymous" if is_anonymous else participant.get("name", user.name),
        }
    )

    # Notify debounce for live synthesis
    debounce.notify_event(bubble_id, synthesizer.run_synthesis)

    contrib.author_id = doc_data["author_id"]
    contrib.author_name = doc_data["author_name"]
    contrib.author_avatar = doc_data["author_avatar"]
    contrib.author_animal = doc_data["author_animal"]
    contrib.is_anonymous = is_anonymous
    return contrib


@router.get("", response_model=List[Contribution])
async def list_contributions(
    bubble_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    participant=Depends(get_bubble_participant),
):
    db = get_async_firestore_client()
    snap = await (
        db.collection("bubbles")
        .document(bubble_id)
        .collection("contributions")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .get()
    )
    rows = []
    for c in snap:
        data = c.to_dict() or {}
        if data.get("is_anonymous"):
            data.update({"author_id": f"anonymous-{data.get('id', c.id)}", "author_name": "Anonymous", "author_avatar": None, "author_animal": None})
        rows.append(Contribution(**data))
    return rows
