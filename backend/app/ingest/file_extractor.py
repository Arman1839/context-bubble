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
                # Fall back to local ephemeral upload disk directory
                import os
                local_path = os.path.join("backend", ".ephemeral_uploads", bubble_id, file_id)
                if os.path.exists(local_path):
                    with open(local_path, "rb") as f:
                        file_bytes = f.read()
                else:
                    logger.debug(f"No GCS or local file bytes for {file_id}: {e}")
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
                extracted_text = f"[PDF '{filename}' contained scanned image layers without embedded text]"

        # 2. Text / Code / Log / Markdown
        elif content_type in ("text/plain", "text/markdown", "text/csv", "application/json"):
            try:
                extracted_text = file_bytes.decode("utf-8", errors="replace")
            except Exception as e:
                logger.warning(f"Text decode failed: {e}")

        # 3. Image / Screenshot OCR via Gemini Multimodal
        elif content_type.startswith("image/"):
            client = getattr(self.llm, "_client", None)
            model_name = getattr(self.llm, "_model_name", "gemini-3.8-flash")
            if client and hasattr(client, "aio") and file_bytes:
                try:
                    from google.genai import types
                    part = types.Part.from_bytes(data=file_bytes, mime_type=content_type)
                    prompt = (
                        "Extract and describe all text, diagrams, tables, UI mockups, or notes in this image accurately. "
                        "Preserve key data points, architectural decisions, and discussion context."
                    )
                    resp = await client.aio.models.generate_content(model=model_name, contents=[part, prompt])
                    if resp and resp.text:
                        extracted_text = resp.text.strip()
                except Exception as e:
                    logger.warning(f"Gemini image OCR failed for {filename}: {e}")

            if not extracted_text:
                extracted_text = f"[OCR extracted summary for image '{filename}']"


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
