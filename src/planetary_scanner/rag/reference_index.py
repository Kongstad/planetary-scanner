"""Local vector indexing for provenance-preserving reference records."""

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from planetary_scanner.models.reference import RagDocument

DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


class EmbeddingModel(Protocol):
    """The minimal embedding-model interface needed for indexing."""

    def encode(
        self, sentences: Sequence[str], *, normalize_embeddings: bool
    ) -> NDArray[np.float32]: ...


@dataclass(frozen=True)
class ReferenceVectorIndex:
    """A local exact-search index derived from reference records."""

    document_ids: NDArray[np.str_]
    vectors: NDArray[np.float32]
    model_name: str


def build_reference_vector_index(
    documents: list[RagDocument], embedding_model: EmbeddingModel, model_name: str
) -> ReferenceVectorIndex:
    """Embed reference record text once and retain its stable record IDs."""

    if not documents:
        raise ValueError("Cannot build a vector index without reference records")
    vectors = np.asarray(
        embedding_model.encode(
            [document.content for document in documents], normalize_embeddings=True
        ),
        dtype=np.float32,
    )
    if vectors.ndim != 2 or vectors.shape[0] != len(documents):
        raise ValueError("Embedding model returned an unexpected vector shape")
    return ReferenceVectorIndex(
        document_ids=np.asarray([document.document_id for document in documents]),
        vectors=vectors,
        model_name=model_name,
    )


def write_reference_vector_index(index_path: Path, index: ReferenceVectorIndex) -> None:
    """Persist the derived vectors, record IDs, and embedding model identifier."""

    index_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        index_path,
        document_ids=index.document_ids,
        vectors=index.vectors,
        model_name=np.asarray(index.model_name),
    )


def load_reference_vector_index(index_path: Path) -> ReferenceVectorIndex:
    """Load a locally persisted reference vector index without pickle support."""

    with np.load(index_path, allow_pickle=False) as stored_index:
        return ReferenceVectorIndex(
            document_ids=stored_index["document_ids"],
            vectors=stored_index["vectors"],
            model_name=str(stored_index["model_name"].item()),
        )


def retrieve_reference_document_ids(
    question: str,
    embedding_model: EmbeddingModel,
    index: ReferenceVectorIndex,
    limit: int,
) -> list[str]:
    """Return the highest-similarity reference record IDs for a question."""

    return [
        document_id
        for document_id, _ in retrieve_reference_document_scores(
            question, embedding_model, index, limit
        )
    ]


def retrieve_reference_document_scores(
    question: str,
    embedding_model: EmbeddingModel,
    index: ReferenceVectorIndex,
    limit: int,
) -> list[tuple[str, float]]:
    """Return the highest-similarity reference record IDs and cosine scores."""

    if limit < 1:
        raise ValueError("Retrieval limit must be at least 1")
    question_vector = np.asarray(
        embedding_model.encode([question], normalize_embeddings=True), dtype=np.float32
    )
    if question_vector.shape != (1, index.vectors.shape[1]):
        raise ValueError("Embedding model returned an unexpected question vector shape")
    scores = index.vectors @ question_vector[0]
    result_count = min(limit, len(index.document_ids))
    ranked_indices = np.argsort(scores)[::-1][:result_count]
    return [
        (str(index.document_ids[ranked_index]), float(scores[ranked_index]))
        for ranked_index in ranked_indices
    ]
