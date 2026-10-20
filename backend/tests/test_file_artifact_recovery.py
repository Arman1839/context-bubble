import pytest

from app.ingest.file_extractor import FileProcessingWorker
from app.llm.gemini import GeminiAdapter, _is_quota_or_rate_limit_error


@pytest.mark.anyio
async def test_upload_artifact_is_saved_even_when_indexing_fails(mock_db):
    worker = FileProcessingWorker(mock_db, GeminiAdapter(api_key="AIzaSyFakeKeyForTest"))

    async def fail_indexing(**kwargs):
        raise RuntimeError("embedding quota exhausted")

    worker.rag.ingest_and_index = fail_indexing
    extracted = await worker.process_uploaded_file(
        bubble_id="artifact-bubble",
        user_id="participant-1",
        file_id="file-1",
        filename="notes.txt",
        content_type="text/plain",
        file_bytes=b"Important uploaded notes that should remain viewable.",
        cloudinary_url="https://example.test/notes.txt",
    )

    saved = await mock_db.collection("bubbles").document("artifact-bubble").collection("files").document("file-1").get()
    assert extracted.startswith("Important uploaded notes")
    assert saved.exists
    assert saved.to_dict()["cloudinary_url"] == "https://example.test/notes.txt"
    assert saved.to_dict()["extraction_status"] == "extracted_not_indexed"


@pytest.mark.anyio
async def test_empty_extraction_still_records_uploaded_asset(mock_db):
    worker = FileProcessingWorker(mock_db, GeminiAdapter(api_key="AIzaSyFakeKeyForTest"))

    await worker.process_uploaded_file(
        bubble_id="artifact-bubble",
        user_id="participant-1",
        file_id="file-empty",
        filename="scan.png",
        content_type="image/png",
        file_bytes=b"",
        cloudinary_url="https://example.test/scan.png",
    )

    saved = await mock_db.collection("bubbles").document("artifact-bubble").collection("files").document("file-empty").get()
    assert saved.exists
    assert saved.to_dict()["extraction_status"] == "no_text_extracted"


def test_gemini_quota_errors_are_classified_for_immediate_failover():
    assert _is_quota_or_rate_limit_error(RuntimeError("RESOURCE_EXHAUSTED: daily limit reached"))
    assert _is_quota_or_rate_limit_error(RuntimeError("429 Too Many Requests"))
    assert not _is_quota_or_rate_limit_error(RuntimeError("404 model not found"))
