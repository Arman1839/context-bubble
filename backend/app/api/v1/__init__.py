# API v1 Router
from fastapi import APIRouter
from app.api.v1.bubbles import router as bubbles_router
from app.api.v1.messages import router as messages_router
from app.api.v1.contributions import router as contributions_router
from app.api.v1.stream import router as stream_router
from app.api.v1.files import router as files_router
from app.api.v1.audio import router as audio_router
from app.api.v1.graph import router as graph_router
from app.api.v1.pop import router as pop_router
from app.api.v1.health import router as health_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router, prefix="/health", tags=["Health"])
api_v1_router.include_router(bubbles_router, prefix="/bubbles", tags=["Bubbles"])
api_v1_router.include_router(messages_router, prefix="/bubbles/{bubble_id}/messages", tags=["Messages"])
api_v1_router.include_router(contributions_router, prefix="/bubbles/{bubble_id}/contributions", tags=["Contributions"])
api_v1_router.include_router(stream_router, prefix="/bubbles/{bubble_id}/stream", tags=["SSE Stream"])
api_v1_router.include_router(files_router, prefix="/bubbles/{bubble_id}/files", tags=["Files"])
api_v1_router.include_router(audio_router, prefix="/bubbles/{bubble_id}/audio", tags=["Live Audio"])
api_v1_router.include_router(graph_router, prefix="/bubbles/{bubble_id}/graph", tags=["Knowledge Graph"])
api_v1_router.include_router(pop_router, prefix="/bubbles/{bubble_id}/pop", tags=["Pop & Export"])
