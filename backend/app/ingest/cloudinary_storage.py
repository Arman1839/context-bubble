"""
Cloudinary storage module — handles uploads of images, audio, and documents
with automatic expiration tied to the bubble's lifetime.

All assets are uploaded to a folder structure: bubbles/{bubble_id}/uploads/
and tagged with the bubble_id so they can be deleted when the bubble pops.
"""
import time
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from app.core.config import settings
from app.core.logging import logger

try:
    import cloudinary
    import cloudinary.uploader
    import cloudinary.api
    HAS_CLOUDINARY = True
except ImportError:
    HAS_CLOUDINARY = False
    cloudinary = None


def _init_cloudinary():
    if not HAS_CLOUDINARY:
        return False
    if not settings.CLOUDINARY_CLOUD_NAME or not settings.CLOUDINARY_API_KEY:
        return False
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )
    return True


# Cloudinary resource type mapping
# - "image" for images (gets auto-optimization, transformations)
# - "video" for audio (Cloudinary treats audio as "video" resource type)
# - "raw" for documents (PDFs, Excel, Word, etc. — stored as-is)
def _get_resource_type(content_type: str) -> str:
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("audio/"):
        return "video"  # Cloudinary uses "video" resource type for audio
    return "raw"  # PDFs, Excel, Word, etc.


async def upload_to_cloudinary(
    bubble_id: str,
    user_id: str,
    file_id: str,
    filename: str,
    content_type: str,
    file_bytes: bytes,
    expires_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Uploads a file to Cloudinary under bubbles/{bubble_id}/uploads/{file_id}_{filename}.
    Returns dict with secure_url, public_id, resource_type, and expiration info.
    """
    if not _init_cloudinary():
        logger.warning("Cloudinary not configured — returning mock upload URL")
        return {
            "file_id": file_id,
            "upload_url": f"http://localhost:{settings.PORT}/api/v1/bubbles/{bubble_id}/files/mock-upload/{file_id}",
            "secure_url": None,
            "public_id": None,
            "resource_type": _get_resource_type(content_type),
            "provider": "mock",
        }

    resource_type = _get_resource_type(content_type)
    public_id = f"bubbles/{bubble_id}/uploads/{file_id}_{filename}"

    # Calculate expiration: Cloudinary supports auto-deletion via "eager_async" or
    # we set a TTL. For raw/video, we use the "expires_at" parameter (Cloudinary Pro).
    # For community tier, we tag with bubble_id and delete on pop.
    upload_kwargs: Dict[str, Any] = {
        "public_id": public_id,
        "resource_type": resource_type,
        "tags": [f"bubble_{bubble_id}", "ephemeral"],
        "context": {
            "bubble_id": bubble_id,
            "uploaded_by": user_id,
            "filename": filename,
        },
        "overwrite": True,
    }

    # For images, auto-format and quality optimization
    if resource_type == "image":
        upload_kwargs["quality"] = "auto"
        upload_kwargs["fetch_format"] = "auto"

    try:
        result = cloudinary.uploader.upload(file_bytes, **upload_kwargs)
        logger.info(f"Cloudinary upload OK: {public_id} ({resource_type}, {len(file_bytes)} bytes)")

        return {
            "file_id": file_id,
            "upload_url": result.get("secure_url", ""),
            "secure_url": result.get("secure_url", ""),
            "public_id": result.get("public_id", public_id),
            "resource_type": resource_type,
            "bytes": result.get("bytes", len(file_bytes)),
            "provider": "cloudinary",
            "expires_at": expires_at.isoformat() if expires_at else None,
        }
    except Exception as e:
        logger.warning(f"Cloudinary upload failed ({e}). Falling back to mock URL.")
        return {
            "file_id": file_id,
            "upload_url": f"http://localhost:{settings.PORT}/api/v1/bubbles/{bubble_id}/files/mock-upload/{file_id}",
            "secure_url": None,
            "public_id": None,
            "resource_type": resource_type,
            "provider": "mock",
            "error": str(e),
        }


async def delete_bubble_assets(bubble_id: str) -> int:
    """
    Deletes all Cloudinary assets tagged with bubble_{bubble_id}.
    Called during bubble pop / crypto-shredding to clean up stored files.
    Returns the count of deleted assets.
    """
    if not _init_cloudinary():
        return 0

    tag = f"bubble_{bubble_id}"
    deleted_count = 0

    for resource_type in ("image", "video", "raw"):
        try:
            result = cloudinary.api.delete_resources_by_tag(tag, resource_type=resource_type)
            deleted = result.get("deleted", {})
            deleted_count += sum(1 for v in deleted.values() if v == "deleted")
        except Exception as e:
            logger.debug(f"Cloudinary cleanup for {tag}/{resource_type}: {e}")

    if deleted_count > 0:
        logger.info(f"Cloudinary: deleted {deleted_count} assets for bubble {bubble_id}")

    return deleted_count


async def download_from_cloudinary(public_id: str, resource_type: str = "raw") -> Optional[bytes]:
    """
    Downloads asset bytes from Cloudinary by public_id.
    Used by FileProcessingWorker to fetch uploaded files for text extraction.
    """
    if not _init_cloudinary():
        return None

    import httpx
    try:
        url = cloudinary.utils.cloudinary_url(public_id, resource_type=resource_type)[0]
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(url)
            if r.status_code == 200:
                return r.content
            logger.warning(f"Cloudinary download failed: {r.status_code} for {public_id}")
            return None
    except Exception as e:
        logger.warning(f"Cloudinary download error: {e}")
        return None
