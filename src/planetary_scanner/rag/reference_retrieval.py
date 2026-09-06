"""Evidence retrieval over local, provenance-preserving reference records."""

import re
from pathlib import Path

from pydantic import BaseModel

from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.reference_index import (
    EmbeddingModel,
    ReferenceVectorIndex,
    retrieve_reference_document_scores,
)


class RetrievedReferenceRecord(BaseModel):
    """A cited reference record selected for a retrieval question."""

    document: RagDocument
    score: float


def load_reference_records(record_path: Path) -> dict[str, RagDocument]:
    """Load authoritative reference records from JSON Lines by document ID."""

    documents = [
        RagDocument.model_validate_json(line)
        for line in record_path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    documents_by_id = {document.document_id: document for document in documents}
    if len(documents_by_id) != len(documents):
        raise ValueError("Reference records must have unique document IDs")
    return documents_by_id


class ReferenceRetriever:
    """Joins vector-ranked IDs to their full cited reference records."""

    def __init__(
        self,
        embedding_model: EmbeddingModel,
        index: ReferenceVectorIndex,
        documents_by_id: dict[str, RagDocument],
    ) -> None:
        self._embedding_model = embedding_model
        self._index = index
        self._documents_by_id = documents_by_id
        missing_document_ids = set(index.document_ids) - documents_by_id.keys()
        if missing_document_ids:
            missing_ids = ", ".join(sorted(missing_document_ids))
            raise ValueError(f"Vector index references unknown documents: {missing_ids}")

    def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
        """Retrieve cited records using semantic similarity and exact-term overlap."""

        semantic_scores = dict(
            retrieve_reference_document_scores(
                question, self._embedding_model, self._index, len(self._documents_by_id)
            )
        )
        question_tokens = _tokenize(question)
        ranked_document_ids = sorted(
            semantic_scores,
            key=lambda document_id: _hybrid_score(
                semantic_scores[document_id],
                question_tokens,
                _tokenize(self._documents_by_id[document_id].content),
            ),
            reverse=True,
        )[:limit]
        return [
            RetrievedReferenceRecord(
                document=self._documents_by_id[document_id],
                score=semantic_scores[document_id],
            )
            for document_id in ranked_document_ids
        ]


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[\w.-]+", text.lower()))


def _hybrid_score(
    semantic_score: float, question_tokens: set[str], document_tokens: set[str]
) -> float:
    """Blend normalized cosine similarity with exact question-term coverage."""

    lexical_score = len(question_tokens.intersection(document_tokens)) / len(question_tokens)
    return 0.85 * ((semantic_score + 1) / 2) + 0.15 * lexical_score