from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.reference_index import (
    DEFAULT_EMBEDDING_MODEL,
    build_reference_vector_index,
)
from planetary_scanner.rag.reference_retrieval import ReferenceRetriever


class SimilarityFakeEmbeddingModel:
    def encode(
        self, sentences: Sequence[str], *, normalize_embeddings: bool
    ) -> NDArray[np.float32]:
        assert normalize_embeddings
        return np.asarray(
            [[1.0, 0.0] if "radius" in sentence else [0.0, 1.0] for sentence in sentences],
            dtype=np.float32,
        )


def test_reference_retriever_returns_full_cited_record() -> None:
    documents = [
        RagDocument(
            document_id="earth-radius",
            content="Earth radius",
            metadata={"source_url": "https://example.test/radius"},
        ),
        RagDocument(document_id="earth-mass", content="Earth mass", metadata={}),
    ]
    embedding_model = SimilarityFakeEmbeddingModel()
    index = build_reference_vector_index(documents, embedding_model, DEFAULT_EMBEDDING_MODEL)
    retriever = ReferenceRetriever(
        embedding_model=embedding_model,
        index=index,
        documents_by_id={document.document_id: document for document in documents},
    )

    results = retriever.retrieve("What is Earth's radius?", limit=1)

    assert results[0].document.document_id == "earth-radius"
    assert results[0].document.metadata["source_url"] == "https://example.test/radius"
    assert results[0].score == 1.0