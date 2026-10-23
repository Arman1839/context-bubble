"""
File extraction & processing worker.
Supports PDF, Excel (.xlsx/.xls), Word (.docx/.doc), PowerPoint (.pptx/.ppt),
images (via Gemini OCR), text/markdown/CSV/JSON, and audio files.
Extracts text, indexes it into the RAG vector store, and triggers AI document review.
"""
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
        cloudinary_url: Optional[str] = None,
    ) -> str:
        """
        Extracts text from uploaded file, indexes it in RAG, and records the file.
        Returns the extracted text.
        """
        # Download bytes if not directly supplied
        if file_bytes is None and cloudinary_url:
            import httpx
            try:
                async with httpx.AsyncClient(timeout=30) as c:
                    r = await c.get(cloudinary_url)
                    if r.status_code == 200:
                        file_bytes = r.content
            except Exception as e:
                logger.warning(f"Failed to download from Cloudinary: {e}")

        if file_bytes is None:
            file_bytes = b""

        extracted_text = await self._extract_text(filename, content_type, file_bytes)

        # Keep an upload record even when OCR/text extraction returns no text.
        # The original asset must remain discoverable and reopenable either way.
        file_doc_ref = self.db.collection("bubbles").document(bubble_id).collection("files").document(file_id)
        await file_doc_ref.set({
            "file_id": file_id,
            "bubble_id": bubble_id,
            "uploaded_by": user_id,
            "filename": filename,
            "content_type": content_type,
            "char_count": len(extracted_text),
            "cloudinary_url": cloudinary_url,
            "extraction_status": "extracted" if extracted_text else "no_text_extracted",
            "created_at": firestore.SERVER_TIMESTAMP,
        })

        if extracted_text:
            try:
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
                await file_doc_ref.update({"extraction_status": "indexed"})
            except Exception as e:
                # Storage and viewing must continue to work when an embedding/quota
                # failure prevents indexing the extracted document text.
                logger.warning(f"Could not index uploaded file {filename} ({file_id}): {e}")
                await file_doc_ref.update({"extraction_status": "extracted_not_indexed"})

        logger.info(f"Recorded uploaded file {filename} ({file_id}) for bubble {bubble_id}; extracted {len(extracted_text)} chars")

        return extracted_text

    async def _extract_text(self, filename: str, content_type: str, file_bytes: bytes) -> str:
        """Extract text from file based on content type."""
        if not file_bytes:
            return ""

        # 1. PDF
        if content_type == "application/pdf" or (filename or "").lower().endswith(".pdf"):
            return self._extract_pdf(file_bytes, filename)

        # 2. Excel (.xlsx, .xls)
        if content_type in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ) or (filename or "").lower().endswith((".xlsx", ".xls")):
            return self._extract_excel(file_bytes, filename)

        # 3. Word (.docx, .doc)
        if content_type in (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ) or (filename or "").lower().endswith((".docx", ".doc")):
            return self._extract_word(file_bytes, filename)

        # 4. PowerPoint (.pptx, .ppt)
        if content_type in (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.ms-powerpoint",
        ) or (filename or "").lower().endswith((".pptx", ".ppt")):
            return self._extract_ppt(file_bytes, filename)

        # 5. Images — Gemini multimodal OCR
        if content_type.startswith("image/"):
            return await self._extract_image_ocr(file_bytes, content_type, filename)

        # 6. Audio — transcription via AssemblyAI / Gemini
        if content_type.startswith("audio/"):
            return await self._extract_audio_transcription(file_bytes, content_type, filename)

        # 7. Text / Markdown / CSV / JSON
        if content_type in ("text/plain", "text/markdown", "text/csv", "application/json") or \
           (filename or "").lower().endswith((".txt", ".md", ".csv", ".json")):
            try:
                return file_bytes.decode("utf-8", errors="replace")
            except Exception as e:
                logger.warning(f"Text decode failed: {e}")
                return ""

        logger.warning(f"Unsupported content type: {content_type}")
        return f"[Unsupported file type '{content_type}' for '{filename}']"

    def _extract_pdf(self, file_bytes: bytes, filename: str) -> str:
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = [page.extract_text() or "" for page in reader.pages]
            text = "\n".join(pages_text).strip()
            if text:
                return text
            return f"[PDF '{filename}' — scanned image layers without embedded text]"
        except Exception as e:
            logger.warning(f"pypdf extraction failed for {filename}: {e}")
            return f"[PDF '{filename}' — extraction error: {e}]"

    def _extract_excel(self, file_bytes: bytes, filename: str) -> str:
        try:
            from openpyxl import load_workbook
            wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
            all_rows = []
            for sheet in wb.worksheets:
                all_rows.append(f"--- Sheet: {sheet.title} ---")
                for row in sheet.iter_rows(values_only=True):
                    cells = [str(c) if c is not None else "" for c in row]
                    if any(cells):
                        all_rows.append("\t".join(cells))
            text = "\n".join(all_rows).strip()
            return text if text else f"[Excel '{filename}' — no data in cells]"
        except Exception as e:
            logger.warning(f"Excel extraction failed for {filename}: {e}")
            return f"[Excel '{filename}' — extraction error: {e}]"

    def _extract_word(self, file_bytes: bytes, filename: str) -> str:
        try:
            from docx import Document as DocxDocument
            doc = DocxDocument(io.BytesIO(file_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            # Also extract tables
            for table in doc.tables:
                for row in table.rows:
                    cells = [cell.text.strip() for cell in row.cells]
                    if any(cells):
                        paragraphs.append("\t".join(cells))
            text = "\n".join(paragraphs).strip()
            return text if text else f"[Word '{filename}' — no text content]"
        except Exception as e:
            logger.warning(f"Word extraction failed for {filename}: {e}")
            return f"[Word '{filename}' — extraction error: {e}]"

    def _extract_ppt(self, file_bytes: bytes, filename: str) -> str:
        try:
            from pptx import Presentation
            prs = Presentation(io.BytesIO(file_bytes))
            slides_text = []
            for idx, slide in enumerate(prs.slides, 1):
                texts = []
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        for para in shape.text_frame.paragraphs:
                            t = para.text.strip()
                            if t:
                                texts.append(t)
                    if shape.has_table:
                        for row in shape.table.rows:
                            cells = [cell.text.strip() for cell in row.cells]
                            if any(cells):
                                texts.append("\t".join(cells))
                if texts:
                    slides_text.append(f"--- Slide {idx} ---\n" + "\n".join(texts))
            text = "\n\n".join(slides_text).strip()
            return text if text else f"[PowerPoint '{filename}' — no text in slides]"
        except Exception as e:
            logger.warning(f"PowerPoint extraction failed for {filename}: {e}")
            return f"[PowerPoint '{filename}' — extraction error: {e}]"

    async def _extract_image_ocr(self, file_bytes: bytes, content_type: str, filename: str) -> str:
        client = getattr(self.llm, "_client", None)
        model_name = getattr(self.llm, "_model_name", "gemini-3.5-flash-lite")
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
                    return resp.text.strip()
            except Exception as e:
                logger.warning(f"Gemini image OCR failed for {filename}: {e}")
        return f"[OCR extracted summary for image '{filename}']"

    async def _extract_audio_transcription(self, file_bytes: bytes, content_type: str, filename: str) -> str:
        """Transcribes uploaded audio files using AssemblyAI or Gemini."""
        import asyncio
        from app.core.config import settings

        # Try AssemblyAI batch transcription
        if settings.ASSEMBLYAI_API_KEY:
            try:
                import httpx
                api_key = settings.ASSEMBLYAI_API_KEY
                headers = {"authorization": api_key, "content-type": "application/json"}
                base_url = "https://api.assemblyai.com/v2"

                async with httpx.AsyncClient(timeout=120.0) as client:
                    # Upload
                    upload_resp = await client.post(f"{base_url}/upload",
                                                    headers={"authorization": api_key},
                                                    content=file_bytes)
                    upload_resp.raise_for_status()
                    upload_url = upload_resp.json()["upload_url"]

                    # Submit
                    transcript_resp = await client.post(f"{base_url}/transcript",
                                                         headers=headers,
                                                         json={"audio_url": upload_url,
                                                               "language_detection": True,
                                                               "punctuate": True,
                                                               "format_text": True})
                    transcript_resp.raise_for_status()
                    transcript_id = transcript_resp.json()["id"]

                    # Poll
                    poll_url = f"{base_url}/transcript/{transcript_id}"
                    for _ in range(60):
                        await asyncio.sleep(2)
                        poll_resp = await client.get(poll_url, headers=headers)
                        poll_resp.raise_for_status()
                        data = poll_resp.json()
                        if data.get("status") == "completed":
                            return data.get("text", "").strip()
                        if data.get("status") == "error":
                            raise RuntimeError(f"AssemblyAI error: {data.get('error')}")
                    logger.warning(f"AssemblyAI transcription timed out for {filename}")
            except Exception as e:
                logger.warning(f"AssemblyAI transcription failed for {filename}: {e}")

        # Fallback: Gemini multimodal
        client = getattr(self.llm, "_client", None)
        model_name = getattr(self.llm, "_model_name", "gemini-3.5-flash-lite")
        if client and hasattr(client, "aio"):
            try:
                from google.genai import types
                mime = content_type or "audio/webm"
                part = types.Part.from_bytes(data=file_bytes, mime_type=mime)
                prompt = "Transcribe the spoken audio accurately. Output ONLY the transcription text."
                resp = await client.aio.models.generate_content(model=model_name, contents=[part, prompt])
                if resp and resp.text:
                    return resp.text.strip()
            except Exception as e:
                logger.warning(f"Gemini audio transcription failed for {filename}: {e}")

        return f"[Audio transcription unavailable for '{filename}']"

    async def trigger_ai_document_review(
        self,
        bubble_id: str,
        file_id: str,
        filename: str,
        content_type: str,
        extracted_text: str,
        user_name: str = "Participant",
    ):
        """
        After a document is uploaded and text is extracted, trigger the AI to review it.
        The AI's response goes to the intelligence panel (not the chat feed) via SSE.
        """
        if not extracted_text or len(extracted_text) < 20:
            return

        try:
            from app.intelligence.stream_manager import stream_manager

            # Truncate very long documents for the AI prompt
            max_chars = 8000
            doc_text = extracted_text[:max_chars]
            if len(extracted_text) > max_chars:
                doc_text += "\n\n[... document truncated for review ...]"

            system_prompt = (
                "You are 'Bubble AI', reviewing a document that a participant just uploaded to the session. "
                "Provide a concise, insightful review: summarize the key content, flag important data points, "
                "highlight anything that contradicts or supports the ongoing discussion, and suggest questions. "
                "Keep it under 200 words. This is shown in the intelligence panel, not the chat feed."
            )

            user_prompt = f"""
### DOCUMENT REVIEW REQUEST
File: {filename}
Type: {content_type}
Uploaded by: {user_name}

### EXTRACTED DOCUMENT CONTENT:
{doc_text}

Please review this document and provide:
1. A brief summary of what it contains
2. Key data points or decisions
3. How it relates to a team deliberation context
"""

            # Broadcast "AI is reviewing" status
            await stream_manager.broadcast(
                bubble_id=bubble_id,
                event_type="ai_token",
                data={"token": f"📄 Reviewing {filename}..."},
            )

            # Generate the review
            response = await self.llm.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.3,
                max_tokens=800,
            )

            review_text = response.content.strip() if response.content else ""

            if review_text:
                # Store the AI review alongside the file
                db = self.db
                review_ref = db.collection("bubbles").document(bubble_id).collection("ai_responses").document()
                await review_ref.set({
                    "id": review_ref.id,
                    "bubble_id": bubble_id,
                    "text": f"📄 **Document Review: {filename}**\n\n{review_text}",
                    "source": "document_review",
                    "file_id": file_id,
                    "created_at": firestore.SERVER_TIMESTAMP,
                })

                # Broadcast the completed review to the intelligence panel
                await stream_manager.broadcast(
                    bubble_id=bubble_id,
                    event_type="ai_complete",
                    data={
                        "text": f"📄 **Document Review: {filename}**\n\n{review_text}",
                        "id": review_ref.id,
                    },
                )

                logger.info(f"AI document review completed for {filename} in bubble {bubble_id}")

        except Exception as e:
            logger.error(f"AI document review failed for {filename}: {e}")
