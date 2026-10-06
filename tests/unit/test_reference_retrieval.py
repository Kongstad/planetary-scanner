from collections.abc import Sequence

import numpy as np
import pytest
from numpy.typing import NDArray

from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.reference_index import (
    DEFAULT_EMBEDDING_MODEL,
    build_reference_vector_index,
)
from planetary_scanner.rag.reference_retrieval import (
    CrossBodyReferenceRetriever,
    ReferenceRetriever,
    is_cross_body_question,
    question_body_ids,
)


class SimilarityFakeEmbeddingModel:
    def encode(
        self, sentences: Sequence[str], *, normalize_embeddings: bool
    ) -> NDArray[np.float32]:
        assert normalize_embeddings
        return np.asarray(
            [
                [1.0, 0.0] if "radius" in sentence else [0.0, 1.0]
                for sentence in sentences
            ],
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
    index = build_reference_vector_index(
        documents, embedding_model, DEFAULT_EMBEDDING_MODEL
    )
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
            [
                [0.9, 0.0] if "earth" in sentence.lower() else [1.0, 0.0]
                for sentence in sentences
            ],
            dtype=np.float32,
        )


def test_reference_retriever_boosts_exact_question_terms() -> None:
    documents = [
        RagDocument(
            document_id="earth-co2",
            content="Earth atmospheric CO2 concentration",
            metadata={},
        ),
        RagDocument(
            document_id="generic", content="planet reference record", metadata={}
        ),
    ]
    embedding_model = LexicalBoostFakeEmbeddingModel()
    index = build_reference_vector_index(
        documents, embedding_model, DEFAULT_EMBEDDING_MODEL
    )
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
    index = build_reference_vector_index(
        documents, embedding_model, DEFAULT_EMBEDDING_MODEL
    )
    retriever = ReferenceRetriever(
        embedding_model=embedding_model,
        index=index,
        documents_by_id={document.document_id: document for document in documents},
    )

    results = retriever.retrieve("Tell me about Earth's geochemistry", limit=3)

    assert {result.document.document_id for result in results} == {
        document.document_id for document in documents
    }


def test_reference_retriever_returns_top_evidence_per_explicit_question_subject() -> (
    None
):
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
    index = build_reference_vector_index(
        documents, embedding_model, DEFAULT_EMBEDDING_MODEL
    )
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


def test_cross_body_retriever_returns_one_size_record_for_each_named_body() -> None:
    embedding_model = SimilarityFakeEmbeddingModel()
    earth_document = RagDocument(
        document_id="earth-mean-radius",
        content="Earth mean radius is 6371 km",
        metadata={"body_id": "earth", "field": "mean_radius"},
    )
    mars_document = RagDocument(
        document_id="mars-mean-radius",
        content="Mars mean radius is 3389.5 km",
        metadata={"body_id": "mars", "field": "mean_radius"},
    )

    def retriever_for(document: RagDocument) -> ReferenceRetriever:
        return ReferenceRetriever(
            embedding_model=embedding_model,
            index=build_reference_vector_index(
                [document], embedding_model, DEFAULT_EMBEDDING_MODEL
            ),
            documents_by_id={document.document_id: document},
        )

    retriever = CrossBodyReferenceRetriever(
        {"earth": retriever_for(earth_document), "mars": retriever_for(mars_document)}
    )

    results = retriever.retrieve("How does Mars's size compare to Earth?", limit=3)

    assert is_cross_body_question("How does Mars's size compare to Earth?")
    assert [result.document.metadata["body_id"] for result in results] == [
        "earth",
        "mars",
    ]
    assert {result.document.metadata["field"] for result in results} == {"mean_radius"}


def test_cross_body_retriever_uses_mean_radius_for_differently_ranked_size_records() -> (
    None
):
    embedding_model = SimilarityFakeEmbeddingModel()
    earth_radius = RagDocument(
        document_id="earth-mean-radius",
        content="Earth mean radius is 6371 km",
        metadata={"body_id": "earth", "field": "mean_radius"},
    )
    mars_radius = RagDocument(
        document_id="mars-mean-radius",
        content="Mars mean radius is 3389.5 km",
        metadata={"body_id": "mars", "field": "mean_radius"},
    )
    mars_unrelated = RagDocument(
        document_id="mars-crust-thickness",
        content="Mars crust thickness",
        metadata={"body_id": "mars", "field": "crust_thickness"},
    )

    def retriever_for(documents: list[RagDocument]) -> ReferenceRetriever:
        return ReferenceRetriever(
            embedding_model=embedding_model,
            index=build_reference_vector_index(
                documents, embedding_model, DEFAULT_EMBEDDING_MODEL
            ),
            documents_by_id={document.document_id: document for document in documents},
        )

    retriever = CrossBodyReferenceRetriever(
        {
            "earth": retriever_for([earth_radius]),
            "mars": retriever_for([mars_radius, mars_unrelated]),
        }
    )

    results = retriever.retrieve("How does Mars's size compare to Earth?", limit=3)

    assert [result.document.document_id for result in results] == [
        "earth-mean-radius",
        "mars-mean-radius",
    ]


@pytest.mark.parametrize(
    "question, expected",
    [
        ("What is the Moon's radius?", ("luna",)),
        ("Luna surface gravity", ("luna",)),
        ("What is Earth's Moon made of?", ("luna",)),
        ("Explain lunar ice", ("luna",)),
        ("Compare Earth and the Moon", ("earth", "luna")),
        ("Compare Earth with Earth's Moon", ("earth", "luna")),
        ("Compare Mars and Luna", ("mars", "luna")),
        ("Compare all three bodies", ("earth", "mars", "luna")),
        ("Compare all 3", ("earth", "mars", "luna")),
        ("How many moons does Mars have?", ("mars",)),
        ("What is the radius?", ()),
        ("What is the Sun's radius?", ("sol",)),
        ("Sol temperature", ("sol",)),
        ("Compare all four bodies", ("earth", "mars", "luna", "sol")),
        ("Compare all 4", ("earth", "mars", "luna", "sol")),
        ("Compare all bodies", ("earth", "mars", "luna", "sol")),
        ("Compare Earth and the Sun", ("earth", "sol")),
        ("How does Earth's solar wind interaction work?", ("earth",)),
    ],
)
def test_question_body_routing_handles_lunar_aliases(
    question: str, expected: tuple[str, ...]
) -> None:
    assert question_body_ids(question) == expected


@pytest.mark.parametrize(
    "body_ids, count_word",
    [
        (("earth", "mars", "luna"), "three"),
        (("earth", "mars", "luna", "sol"), "four"),
    ],
)
def test_multi_body_comparison_preserves_each_body_and_gravity_field_alias(
    body_ids, count_word
) -> None:
    embedding_model = SimilarityFakeEmbeddingModel()
    retrievers = {}
    for body_id in body_ids:
        gravity_field = (
            "surface_gravity" if body_id == "luna" else "equatorial_surface_gravity"
        )
        documents = [
            RagDocument(
                document_id=f"{body_id}-{field}",
                content=f"{body_id} {field}",
                metadata={"body_id": body_id, "field": field},
            )
            for field in ("mean_radius", gravity_field, "mass")
        ]
        retrievers[body_id] = ReferenceRetriever(
            embedding_model,
            build_reference_vector_index(
                documents, embedding_model, DEFAULT_EMBEDDING_MODEL
            ),
            {document.document_id: document for document in documents},
        )
    results = CrossBodyReferenceRetriever(retrievers).retrieve(
        f"Compare the size and gravity of all {count_word} bodies", limit=1
    )
    assert len(results) == 2 * len(body_ids)
    for body_id in retrievers:
        fields = {
            record.document.metadata["field"]
            for record in results
            if record.document.metadata["body_id"] == body_id
        }
        assert fields == {
            "mean_radius",
            "surface_gravity" if body_id == "luna" else "equatorial_surface_gravity",
        }


def test_lunar_bulk_composition_retrieves_complete_model_without_surface_facts() -> (
    None
):
    embedding_model = SimilarityFakeEmbeddingModel()
    scope = "bulk_silicate_moon_warren_2005_model_oxide_mass_percent_core_excluded"
    documents = [
        RagDocument(
            document_id=f"luna-{oxide}",
            content=f"Luna bulk silicate {oxide}",
            metadata={"body_id": "luna", "scope": scope},
        )
        for oxide in ("silica", "magnesia", "iron-oxide", "alumina", "lime", "titania")
    ]
    documents.append(
        RagDocument(
            document_id="luna-crust",
            content="Luna surface crust",
            metadata={"scope": "crust"},
        )
    )
    retriever = ReferenceRetriever(
        embedding_model,
        build_reference_vector_index(
            documents, embedding_model, DEFAULT_EMBEDDING_MODEL
        ),
        {document.document_id: document for document in documents},
    )
    results = retriever.retrieve("What is the Moon made of?", limit=3)
    assert len(results) == 6
    assert all(record.document.metadata["scope"] == scope for record in results)
