import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.core.config import settings
from app.core.logging import logger
from app.core.telemetry import init_telemetry
from app.core.exceptions import BubbleException
from app.services.firebase import init_firebase, get_async_firestore_client
from app.api.v1 import api_v1_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting Context Bubble backend (Env: {settings.ENVIRONMENT})")
    init_telemetry("context-bubble-backend")
    init_firebase()
    # Eagerly initialize Firestore async client
    get_async_firestore_client()
    yield
    # Shutdown
    logger.info("Shutting down Context Bubble backend")


app = FastAPI(
    title="Context Bubble Backend API",
    description="High-velocity ephemeral collaboration backend with live intelligence and auto-pop shredding",
    version="0.1.0",
    lifespan=lifespan,
)

# OpenTelemetry Instrumentation
FastAPIInstrumentor.instrument_app(app)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def logging_and_timing_middleware(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        duration_ms = round((time.time() - start_time) * 1000, 2)
        logger.info(
            f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)"
        )
        response.headers["X-Response-Time-Ms"] = str(duration_ms)
        return response
    except Exception as exc:
        duration_ms = round((time.time() - start_time) * 1000, 2)
        logger.error(
            f"Unhandled error on {request.method} {request.url.path} ({duration_ms}ms): {exc}",
            exc_info=True,
        )
        raise exc


@app.exception_handler(BubbleException)
async def bubble_exception_handler(request: Request, exc: BubbleException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.detail,
                "extra": exc.extra,
            }
        },
        headers=exc.headers,
    )


# Mount API v1 router
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "service": "Context Bubble Backend",
        "version": "0.1.0",
        "status": "operational",
        "docs_url": "/docs",
    }
