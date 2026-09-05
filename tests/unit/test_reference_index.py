from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pytest
from numpy.typing import NDArray

from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.reference_index import (
    DEFAULT_EMBEDDING_MODEL,
    build_reference_vector_index,
    load_reference_vector_index,
    retrieve_reference_document_ids,
    write_reference_vector_index,
)


class FakeEmbeddingModel:
    def encode(
        self, sentences: Sequence[str], *, normalize_embeddings: bool
    ) -> NDArray[np.float32]:
        assert normalize_embeddings
        return np.asarray([[index, index + 0.5] for index, _ in enumerate(sentences)], dtype=np.float32)


def test_reference_vector_index_preserves_document_ids_and_vectors(tmp_path: Path) -> None:
    documents = [
        RagDocument(document_id="earth-radius", content="Earth radius", metadata={}),
        RagDocument(document_id="earth-mass", content="Earth mass", metadata={}),
    ]
    index = build_reference_vector_index(documents, FakeEmbeddingModel(), DEFAULT_EMBEDDING_MODEL)
    index_path = tmp_path / "earth-reference-vectors.npz"

    write_reference_vector_index(index_path, index)
    loaded_index = load_reference_vector_index(index_path)

    assert loaded_index.document_ids.tolist() == ["earth-radius", "earth-mass"]
    assert loaded_index.vectors.tolist() == [[0.0, 0.5], [1.0, 1.5]]
    assert loaded_index.model_name == DEFAULT_EMBEDDING_MODEL


def test_reference_vector_index_rejects_empty_documents() -> None:
    with pytest.raises(ValueError, match="Cannot build a vector index"):
        build_reference_vector_index([], FakeEmbeddingModel(), DEFAULT_EMBEDDING_MODEL)


class SimilarityFakeEmbeddingModel:
    def encode(
        self, sentences: Sequence[str], *, normalize_embeddings: bool
    ) -> NDArray[np.float32]:
        assert normalize_embeddings
        return np.asarray(
            [[1.0, 0.0] if "radius" in sentence else [0.0, 1.0] for sentence in sentences],
            dtype=np.float32,
        )


def test_reference_vector_index_returns_highest_similarity_record_id() -> None:
    documents = [
        RagDocument(document_id="earth-radius", content="Earth radius", metadata={}),
        RagDocument(document_id="earth-mass", content="Earth mass", metadata={}),
    ]
    embedding_model = SimilarityFakeEmbeddingModel()
    index = build_reference_vector_index(documents, embedding_model, DEFAULT_EMBEDDING_MODEL)

    results = retrieve_reference_document_ids("What is Earth's radius?", embedding_model, index, limit=1)

    assert results == ["earth-radius"]