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
    doc_data = contrib.model_dump(mode="json")
    doc_data["timestamp"] = firestore.SERVER_TIMESTAMP

    await contrib_ref.set(doc_data)

    # Index into RAG vector store
    await rag.ingest_and_index(
        bubble_id=bubble_id,
        source_id=contrib.id,
        text=contrib.text,
        extra_metadata={"author_id": user.uid, "author_name": participant.get("name", user.name)}
    )

    # Notify debounce for live synthesis
    debounce.notify_event(bubble_id, synthesizer.run_synthesis)

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
    return [Contribution(**c.to_dict()) for c in snap]
