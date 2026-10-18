from typing import List, Dict, Any
from app.llm.base import LLMAdapter


class EmbeddingService:
    def __init__(self, llm_adapter: LLMAdapter):
        self.llm = llm_adapter

    async def embed_chunks(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not chunks:
            return []
        texts = [c["text"] for c in chunks]
        vectors = await self.llm.embed(texts)
        for chunk, vector in zip(chunks, vectors):
            chunk["embedding"] = vector
        return chunks
