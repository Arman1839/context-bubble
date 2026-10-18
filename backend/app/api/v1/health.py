from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.get("/liveness")
async def liveness():
    return {"status": "live", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/readiness")
async def readiness():
    return {
        "status": "ready",
        "environment": settings.ENVIRONMENT,
        "llm_provider": settings.LLM_PROVIDER,
        "project": settings.GOOGLE_CLOUD_PROJECT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
