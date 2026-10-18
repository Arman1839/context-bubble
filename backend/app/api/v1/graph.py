from fastapi import APIRouter, Depends
from app.api.deps import get_bubble_participant
from app.models.graph import KnowledgeGraph
from app.services.firebase import get_async_firestore_client
from app.graph.service import GraphService

router = APIRouter()


@router.get("", response_model=KnowledgeGraph)
async def get_bubble_knowledge_graph(
    bubble_id: str,
    participant=Depends(get_bubble_participant),
):
    db = get_async_firestore_client()
    graph_svc = GraphService(db)
    return await graph_svc.get_graph(bubble_id)
