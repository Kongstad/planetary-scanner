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


class LexicalBoostFakeEmbeddingModel:
    def encode(
        self, sentences: Sequence[str], *, normalize_embeddings: bool
    ) -> NDArray[np.float32]:
        assert normalize_embeddings
        return np.asarray(
            [[0.9, 0.0] if "earth" in sentence.lower() else [1.0, 0.0] for sentence in sentences],
            dtype=np.float32,
        )


def test_reference_retriever_boosts_exact_question_terms() -> None:
    documents = [
        RagDocument(document_id="earth-co2", content="Earth atmospheric CO2 concentration", metadata={}),
        RagDocument(document_id="generic", content="planet reference record", metadata={}),
    ]
    embedding_model = LexicalBoostFakeEmbeddingModel()
    index = build_reference_vector_index(documents, embedding_model, DEFAULT_EMBEDDING_MODEL)
    retriever = ReferenceRetriever(
        embedding_model=embedding_model,
        index=index,
        documents_by_id={document.document_id: document for document in documents},
    )

    results = retriever.retrieve("Earth CO2", limit=1)

    assert results[0].document.document_id == "earth-co2"


def test_reference_retriever_expands_broad_earth_geochemistry_questions() -> None:
    documents = [
        RagDocument(
            document_id=f"earth-{element}",
            content=f"Earth bulk {element} mass fraction",
            metadata={"scope": "bulk_earth_elemental_mass_fraction_model"},
        )
        for element in ("iron", "oxygen", "silicon", "magnesium", "sulfur")
    ]
    documents.append(
        RagDocument(
            document_id="earth-other-elements",
            content="Earth other elemental mass fraction",
            metadata={
                "scope": "bulk_earth_elemental_mass_fraction_remainder_after_fe_o_si_mg_s"
            },
        )
    )
    embedding_model = SimilarityFakeEmbeddingModel()
    index = build_reference_vector_index(documents, embedding_model, DEFAULT_EMBEDDING_MODEL)
    retriever = ReferenceRetriever(
        embedding_model=embedding_model,
        index=index,
        documents_by_id={document.document_id: document for document in documents},
    )

    results = retriever.retrieve("Tell me about Earth's geochemistry", limit=3)

    assert {result.document.document_id for result in results} == {
        document.document_id for document in documents
    }


def test_reference_retriever_returns_top_evidence_per_explicit_question_subject() -> None:
    documents = [
        RagDocument(
            document_id="earth-mean-radius",
            content="Earth mean radius is 6371 km",
            metadata={"field": "mean_radius"},
        ),
        RagDocument(
            document_id="earth-equatorial-diameter",
            content="Earth equatorial diameter is 12756 km",
            metadata={"field": "equatorial_diameter"},
        ),
        RagDocument(
            document_id="earth-population",
            content="Earth global human population is 8.2 B",
            metadata={"field": "global_human_population"},
        ),
        RagDocument(
            document_id="earth-forest",
            content="Earth global forest area is 4.06 billion hectares",
            metadata={"field": "global_forest_area"},
        ),
    ]
    embedding_model = SimilarityFakeEmbeddingModel()
    index = build_reference_vector_index(documents, embedding_model, DEFAULT_EMBEDDING_MODEL)
    retriever = ReferenceRetriever(
        embedding_model=embedding_model,
        index=index,
        documents_by_id={document.document_id: document for document in documents},
    )

    results = retriever.retrieve(
        "What is the size of Earth and how many people live here?", limit=3
    )

    assert len(results) == 2
    assert results[0].document.document_id in {
        "earth-mean-radius",
        "earth-equatorial-diameter",
    }
    assert results[1].document.document_id == "earth-population"