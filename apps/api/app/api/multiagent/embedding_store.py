from __future__ import annotations

from collections import Counter
from typing import Any


class EmbeddingStore:
    def rank_chunks(self, question: str, chunks: list[dict[str, Any]], retrieval_terms: list[str]) -> list[dict[str, Any]]:
        question_tokens = self._tokenize(question)
        ranked = []

        for chunk in chunks:
            combined = " ".join(
                [
                    chunk.get("title", ""),
                    chunk.get("summary", ""),
                    chunk.get("excerpt", ""),
                    " ".join(chunk.get("keywords", [])),
                ]
            )
            chunk_tokens = self._tokenize(combined)
            overlap = sum((question_tokens & chunk_tokens).values())
            retrieval_hits = sum(1 for term in retrieval_terms if term.lower() in combined.lower())
            keyword_hits = sum(1 for keyword in chunk.get("keywords", []) if keyword.lower() in question.lower())
            score = overlap * 3 + retrieval_hits * 2 + keyword_hits
            ranked.append((score, chunk))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [chunk for score, chunk in ranked if score > 0] or chunks[:2]

    def _tokenize(self, value: str) -> Counter[str]:
        tokens = [token.strip(".,:;!?()[]\"'").lower() for token in value.split()]
        return Counter(token for token in tokens if token)
