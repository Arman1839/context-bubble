import re
from typing import List, Dict, Any


def chunk_text(
    text: str,
    source_id: str,
    bubble_id: str,
    chunk_size: int = 500,
    chunk_overlap: int = 80,
    extra_metadata: Dict[str, Any] = None,
) -> List[Dict[str, Any]]:
    """
    Splits text into overlapping semantic chunks with stable metadata tracking.
    """
    clean_text = text.strip()
    if not clean_text:
        return []

    # If small enough, return as single chunk
    if len(clean_text) <= chunk_size:
        return [{
            "chunk_id": f"{source_id}_chunk_0",
            "source_id": source_id,
            "bubble_id": bubble_id,
            "text": clean_text,
            "chunk_index": 0,
            **(extra_metadata or {}),
        }]

    # Sentence boundary split
    sentences = re.split(r"(?<=[.?!])\s+", clean_text)
    chunks = []
    current_chunk = []
    current_length = 0
    chunk_idx = 0

    for sentence in sentences:
        if current_length + len(sentence) > chunk_size and current_chunk:
            combined = " ".join(current_chunk)
            chunks.append({
                "chunk_id": f"{source_id}_chunk_{chunk_idx}",
                "source_id": source_id,
                "bubble_id": bubble_id,
                "text": combined,
                "chunk_index": chunk_idx,
                **(extra_metadata or {}),
            })
            chunk_idx += 1
            # Retain overlap sentences
            overlap_sentences = []
            overlap_len = 0
            for s in reversed(current_chunk):
                if overlap_len + len(s) <= chunk_overlap:
                    overlap_sentences.insert(0, s)
                    overlap_len += len(s)
                else:
                    break
            current_chunk = overlap_sentences
            current_length = sum(len(s) for s in current_chunk)

        current_chunk.append(sentence)
        current_length += len(sentence)

    if current_chunk:
        combined = " ".join(current_chunk)
        chunks.append({
            "chunk_id": f"{source_id}_chunk_{chunk_idx}",
            "source_id": source_id,
            "bubble_id": bubble_id,
            "text": combined,
            "chunk_index": chunk_idx,
            **(extra_metadata or {}),
        })

    return chunks
