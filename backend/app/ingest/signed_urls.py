import datetime
import uuid
from typing import Dict, Any
from app.core.config import settings
from app.services.firebase import get_storage_client
from app.core.logging import logger


ALLOWED_MIME_TYPES = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "image/png",
    "image/jpeg",
    "image/webp",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB max


def generate_upload_signed_url(
    bubble_id: str,
    user_id: str,
    filename: str,
    content_type: str,
    size_bytes: int,
) -> Dict[str, Any]:
    if content_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"Content type '{content_type}' is not supported. Allowed: {list(ALLOWED_MIME_TYPES)}")

    if size_bytes > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File size exceeds 25 MB limit (requested: {size_bytes / (1024*1024):.2f} MB)")

    file_id = f"f_{uuid.uuid4().hex[:12]}"
    object_name = f"bubbles/{bubble_id}/uploads/{file_id}_{filename}"

    client = get_storage_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(object_name)

    try:
        # V4 Signed URL generation
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=15),
            method="PUT",
            content_type=content_type,
        )
    except Exception as e:
        logger.warning(f"Could not generate real GCS signed URL (local/emulator): {e}")
        signed_url = f"http://localhost:{settings.PORT}/api/v1/bubbles/{bubble_id}/files/mock-upload/{file_id}"

    return {

        "file_id": file_id,
        "object_name": object_name,
        "upload_url": signed_url,
        "content_type": content_type,
        "expires_in_seconds": 900,
    }
