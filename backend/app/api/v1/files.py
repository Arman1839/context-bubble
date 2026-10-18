from fastapi import APIRouter, Depends, Request, status, Query, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import AuthenticatedUser, get_current_user, get_bubble_participant
from app.ingest.signed_urls import generate_upload_signed_url
from app.ingest.file_extractor import FileProcessingWorker
from app.services.firebase import get_async_firestore_client
from app.llm.factory import get_llm_adapter

router = APIRouter()


class RequestSignedUrlRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=3)
    size_bytes: int = Field(..., gt=0)


class ProcessFileRequest(BaseModel):
    filename: str
    content_type: str


@router.post("/upload-url")
async def get_upload_url(
    bubble_id: str,
    req: RequestSignedUrlRequest,
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        url_info = generate_upload_signed_url(
            bubble_id=bubble_id,
            user_id=user.uid,
            filename=req.filename,
            content_type=req.content_type,
            size_bytes=req.size_bytes,
        )
        return url_info
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{file_id}/process")
async def trigger_file_processing(
    bubble_id: str,
    file_id: str,
    req: ProcessFileRequest,
    participant=Depends(get_bubble_participant),
    user: AuthenticatedUser = Depends(get_current_user),
):
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


@router.put("/mock-upload/{bubble_id}/{file_id}")
async def mock_upload(bubble_id: str, file_id: str, request: Request):
    """Local dev upload handler when real GCS bucket credentials are not provided."""
    import os
    body = await request.body()
    upload_dir = os.path.join("backend", ".ephemeral_uploads", bubble_id)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file_id)
    with open(file_path, "wb") as f:
        f.write(body)
    return {"status": "uploaded", "bytes_received": len(body), "file_id": file_id}

