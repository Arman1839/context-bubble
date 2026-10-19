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
            # High-performance NumPy vectorized fallback for emulator / unindexed environments
            logger.debug(f"Using vectorized NumPy cosine similarity for vector search: {e}")
            all_chunks = await chunks_col.limit(500).get()
            if not all_chunks:
                return []

            import numpy as np

            q = np.array(query_vector, dtype=np.float32)
            q_norm = np.linalg.norm(q)
            if q_norm == 0:
                return []
            q_unit = q / q_norm

            matrix_rows = []
            chunk_metadata = []

            for d in all_chunks:
                data = d.to_dict() or {}
                emb = data.get("embedding")
                if emb is not None:
                    raw_vec = emb.values if hasattr(emb, "values") else emb
                    matrix_rows.append(raw_vec)
                    chunk_metadata.append(data)

            if not matrix_rows:
                return []

            mat = np.array(matrix_rows, dtype=np.float32)
            # Row-wise L2 norms
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            mat_unit = mat / norms

            # Cosine similarity is the dot product of unit vectors
            scores = np.dot(mat_unit, q_unit)
            top_indices = np.argsort(scores)[::-1][:k]

            return [
                {
                    "chunk_id": chunk_metadata[idx].get("chunk_id", ""),
                    "source_id": chunk_metadata[idx].get("source_id"),
                    "text": chunk_metadata[idx].get("text", ""),
                    "score": float(scores[idx]),
                }
                for idx in top_indices
            ]

