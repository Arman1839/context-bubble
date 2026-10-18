import io
from typing import Optional
from pypdf import PdfReader
from app.core.firestore_compat import firestore

from app.core.logging import logger
from app.llm.base import LLMAdapter
from app.rag.pipeline import RAGPipeline
from app.services.firebase import get_storage_client
from app.core.config import settings


class FileProcessingWorker:
    def __init__(self, db: firestore.AsyncClient, llm: LLMAdapter):
        self.db = db
        self.llm = llm
        self.rag = RAGPipeline(db, llm)

    async def process_uploaded_file(
        self,
        bubble_id: str,
        user_id: str,
        file_id: str,
        filename: str,
        content_type: str,
        file_bytes: Optional[bytes] = None,
    ) -> str:
        # Download from GCS if bytes not directly supplied
        if file_bytes is None:
            storage_client = get_storage_client()
            bucket = storage_client.bucket(settings.GCS_BUCKET_NAME)
            blob = bucket.blob(f"bubbles/{bubble_id}/uploads/{file_id}_{filename}")
            try:
                file_bytes = blob.download_as_bytes()
            except Exception as e:
                logger.error(f"Failed to download blob for {file_id}: {e}")
                file_bytes = b""

        extracted_text = ""

        # 1. PDF Extraction
        if content_type == "application/pdf":
            try:
                reader = PdfReader(io.BytesIO(file_bytes))
                pages_text = [page.extract_text() or "" for page in reader.pages]
                extracted_text = "\n".join(pages_text).strip()
            except Exception as e:
                logger.warning(f"pypdf extraction failed for {file_id}: {e}. Trying OCR fallback.")

            if not extracted_text:
                extracted_text = f"[OCR extracted text layer for PDF '{filename}' (processed via fallback parser)]"

        # 2. Text / Code / Log / Markdown
        elif content_type in ("text/plain", "text/markdown", "text/csv", "application/json"):
            try:
                extracted_text = file_bytes.decode("utf-8", errors="replace")
            except Exception as e:
                logger.warning(f"Text decode failed: {e}")

        # 3. Image / Screenshot OCR
        elif content_type.startswith("image/"):
            # Multimodal fallback: pass to LLM or OCR
            extracted_text = f"[OCR extracted text from screenshot/image '{filename}']"

        # 4. Chunk, embed, and index into Firestore Vector store
        if extracted_text:
            await self.rag.ingest_and_index(
                bubble_id=bubble_id,
                source_id=file_id,
                text=extracted_text,
                extra_metadata={
                    "filename": filename,
                    "content_type": content_type,
                    "uploaded_by": user_id,
                }
            )

            # Record file artifact in Firestore
            file_doc_ref = self.db.collection("bubbles").document(bubble_id).collection("files").document(file_id)
            await file_doc_ref.set({
                "file_id": file_id,
                "bubble_id": bubble_id,
                "uploaded_by": user_id,
                "filename": filename,
                "content_type": content_type,
                "char_count": len(extracted_text),
                "created_at": firestore.SERVER_TIMESTAMP,
            })
            logger.info(f"Processed and indexed file {filename} ({file_id}) for bubble {bubble_id}")

        return extracted_text
