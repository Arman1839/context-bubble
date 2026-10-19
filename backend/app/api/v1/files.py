"""
File upload & processing API.
Accepts direct file uploads from the frontend, stores them on Cloudinary
(with expiration tied to the bubble's lifetime), extracts text content,
indexes it into the RAG vector store, and triggers AI review.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, Request, status, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from app.api.deps import AuthenticatedUser, get_current_user, get_bubble_participant
from app.ingest.cloudinary_storage import upload_to_cloudinary
from app.ingest.file_extractor import FileProcessingWorker
from app.services.firebase import get_async_firestore_client
from app.llm.factory import get_llm_adapter
from app.core.config import settings
from app.core.logging import logger
from app.core.firestore_compat import firestore

router = APIRouter()


# Allowed MIME types for upload
ALLOWED_MIME_TYPES = {
    # Documents
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    # Excel
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",  # .xls
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/vnd.ms-powerpoint",  # .ppt
    # Images
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    # Audio
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
}

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


class ProcessFileRequest(BaseModel):
    filename: str
    content_type: str


@router.post("/upload")
async def upload_file(
    bubble_id: str,
    file: UploadFile = File(...),
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Direct file upload endpoint.
    The frontend sends the file as multipart/form-data.
    The backend stores it on Cloudinary (with bubble expiration), extracts text,
    indexes it in RAG, and triggers AI document review.
    """
    # Validate content type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        # Also allow by file extension as fallback
        allowed_extensions = (".pdf", ".txt", ".md", ".json", ".csv", ".xlsx", ".xls",
                              ".docx", ".doc", ".pptx", ".ppt", ".png", ".jpg", ".jpeg",
                              ".webp", ".gif", ".webm", ".mp3", ".wav", ".ogg", ".m4a")
        if not file.filename or not file.filename.lower().endswith(allowed_extensions):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: {content_type}. Allowed: PDF, Excel, Word, PPT, images, audio, text.",
            )

    # Read file bytes
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds 50 MB limit (received {len(file_bytes) / (1024*1024):.1f} MB).",
        )

    file_id = f"f_{uuid.uuid4().hex[:12]}"
    filename = file.filename or f"upload_{file_id}"
    db = get_async_firestore_client()
    llm = get_llm_adapter()

    # Look up bubble expiry for Cloudinary TTL
    bubble_snap = await db.collection("bubbles").document(bubble_id).get()
    expires_at = None
    if bubble_snap.exists:
        exp = bubble_snap.to_dict().get("expires_at")
        if isinstance(exp, datetime):
            expires_at = exp
        elif isinstance(exp, str):
            try:
                expires_at = datetime.fromisoformat(exp)
            except Exception:
                pass

    # 1. Upload to Cloudinary
    upload_result = await upload_to_cloudinary(
        bubble_id=bubble_id,
        user_id=user.uid,
        file_id=file_id,
        filename=filename,
        content_type=content_type,
        file_bytes=file_bytes,
        expires_at=expires_at,
    )

    # 2. Extract text & index in RAG
    worker = FileProcessingWorker(db, llm)
    extracted_text = await worker.process_uploaded_file(
        bubble_id=bubble_id,
        user_id=user.uid,
        file_id=file_id,
        filename=filename,
        content_type=content_type,
        file_bytes=file_bytes,
        cloudinary_url=upload_result.get("secure_url"),
    )

    # 3. Trigger AI document review (async, non-blocking)
    import asyncio
    asyncio.create_task(worker.trigger_ai_document_review(
        bubble_id=bubble_id,
        file_id=file_id,
        filename=filename,
        content_type=content_type,
        extracted_text=extracted_text,
        user_name=user.name,
    ))

    return {
        "file_id": file_id,
        "filename": filename,
        "content_type": content_type,
        "char_count": len(extracted_text),
        "secure_url": upload_result.get("secure_url"),
        "public_id": upload_result.get("public_id"),
        "provider": upload_result.get("provider"),
        "status": "uploaded_and_indexed",
    }


@router.post("/upload-url")
async def get_upload_url(
    bubble_id: str,
    req: Request,
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Legacy endpoint kept for backward compat — returns a mock URL.
    Frontend should use /upload (direct multipart) instead.
    """
    body = await req.json()
    return {
        "file_id": f"f_{uuid.uuid4().hex[:12]}",
        "upload_url": f"http://localhost:{settings.PORT}/api/v1/bubbles/{bubble_id}/files/upload",
        "object_name": body.get("filename", "file"),
        "content_type": body.get("content_type", "application/octet-stream"),
        "expires_in_seconds": 900,
    }


@router.post("/{file_id}/process")
async def trigger_file_processing(
    bubble_id: str,
    file_id: str,
    req: ProcessFileRequest,
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Legacy endpoint — reprocess an already-uploaded file."""
    db = get_async_firestore_client()
    llm = get_llm_adapter()
    worker = FileProcessingWorker(db, llm)
    extracted_text = await worker.process_uploaded_file(
        bubble_id=bubble_id,
        user_id=user.uid,
        file_id=file_id,
        filename=req.filename,
        content_type=req.content_type,
    )
    return {"status": "indexed", "file_id": file_id, "char_count": len(extracted_text)}


@router.get("")
async def list_files(
    bubble_id: str,
    participant=Depends(get_bubble_participant),
):
    """Lists all files uploaded to a bubble."""
    db = get_async_firestore_client()
    snap = await db.collection("bubbles").document(bubble_id).collection("files").get()
    files = [doc.to_dict() for doc in snap]
    return files
