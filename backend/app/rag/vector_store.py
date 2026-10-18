import math
from typing import List, Dict, Any
try:
    from google.cloud import firestore
    from google.cloud.firestore_v1.vector import Vector
    from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
    HAS_FIRESTORE_VECTOR = True
except ImportError:
    from app.core.firestore_compat import firestore
    Vector = lambda x: x
    DistanceMeasure = None
    HAS_FIRESTORE_VECTOR = False
from app.core.logging import logger


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


class FirestoreVectorStore:
    def __init__(self, db: firestore.AsyncClient):
        self.db = db

    async def save_chunks(self, bubble_id: str, chunks: List[Dict[str, Any]]):
        chunks_col = self.db.collection("bubbles").document(bubble_id).collection("chunks")
        batch = self.db.batch()
        for c in chunks:
            doc_ref = chunks_col.document(c["chunk_id"])
            doc_data = {
                "chunk_id": c["chunk_id"],
                "source_id": c["source_id"],
                "bubble_id": bubble_id,
                "text": c["text"],
                "chunk_index": c.get("chunk_index", 0),
                "created_at": firestore.SERVER_TIMESTAMP,
            }
            if "embedding" in c and c["embedding"]:
                # Store vector field using Firestore Vector
                doc_data["embedding"] = Vector(c["embedding"])
            batch.set(doc_ref, doc_data)
        await batch.commit()

    async def search_top_k(
        self,
        bubble_id: str,
        query_vector: List[float],
        k: int = 6,
    ) -> List[Dict[str, Any]]:
        chunks_col = self.db.collection("bubbles").document(bubble_id).collection("chunks")

        try:
            # Native Firestore Vector Search
            vector_query = chunks_col.find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_vector),
                distance_measure=DistanceMeasure.COSINE,
                limit=k,
            )
            docs = await vector_query.get()
            results = []
            for d in docs:
                data = d.to_dict() or {}
                results.append({
                    "chunk_id": data.get("chunk_id", d.id),
                    "source_id": data.get("source_id"),
                    "text": data.get("text", ""),
                })
            return results
        except Exception as e:
            # Fallback for Firestore emulator / unindexed vector environments
            logger.info(f"Using in-memory cosine similarity fallback for vector search: {e}")
            all_chunks = await chunks_col.limit(100).get()
            scored = []
            for d in all_chunks:
                data = d.to_dict() or {}
                emb = data.get("embedding")
                if emb is not None:
                    # In python, Vector might be wrapped or list
                    raw_vec = emb.values if hasattr(emb, "values") else emb
                    score = cosine_similarity(query_vector, list(raw_vec))
                    scored.append((score, data))

            scored.sort(key=lambda x: x[0], reverse=True)
            return [
                {
                    "chunk_id": item[1].get("chunk_id", ""),
                    "source_id": item[1].get("source_id"),
                    "text": item[1].get("text", ""),
                    "score": item[0],
                }
                for item in scored[:k]
            ]
