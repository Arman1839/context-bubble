from typing import List, Dict, Any, Optional
from app.core.firestore_compat import firestore

from app.llm.base import LLMAdapter
from app.rag.chunker import chunk_text
from app.rag.embeddings import EmbeddingService
from app.rag.vector_store import FirestoreVectorStore


class RAGPipeline:
    def __init__(self, db: firestore.AsyncClient, llm: LLMAdapter):
        self.db = db
        self.llm = llm
        self.vector_store = FirestoreVectorStore(db)
        self.embedding_service = EmbeddingService(llm)

    async def ingest_and_index(
        self,
        bubble_id: str,
        source_id: str,
        text: str,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ):
        chunks = chunk_text(text, source_id, bubble_id, extra_metadata=extra_metadata)
        if not chunks:
            return
        embedded_chunks = await self.embedding_service.embed_chunks(chunks)
        await self.vector_store.save_chunks(bubble_id, embedded_chunks)

    async def assemble_context(
        self,
        bubble_id: str,
        latest_text: str,
        previous_summary: Optional[str] = None,
        top_k: int = 5,
    ) -> str:
        # Generate query vector for the latest contributions
        query_vectors = await self.llm.embed([latest_text])
        relevant_chunks: List[Dict[str, Any]] = []
        if query_vectors and query_vectors[0]:
            relevant_chunks = await self.vector_store.search_top_k(
                bubble_id=bubble_id,
                query_vector=query_vectors[0],
                k=top_k,
            )

        context_parts = []
        if previous_summary:
            context_parts.append(f"### CURRENT ROLLING SUMMARY:\n{previous_summary}\n")

        if relevant_chunks:
            context_parts.append("### RELEVANT BACKGROUND EXCERPTS FROM SESSION:")
            for idx, c in enumerate(relevant_chunks, 1):
                context_parts.append(f"[{idx}] {c['text']}")

        return "\n\n".join(context_parts)
