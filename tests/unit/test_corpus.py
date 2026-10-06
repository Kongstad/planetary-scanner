import csv
import json
from datetime import date

import numpy as np
import pytest

from planetary_scanner.models.corpus import build_collection_documents
from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.corpus_routing import EntityLookup, shared_collection
from planetary_scanner.rag.reference_index import ReferenceVectorIndex
from planetary_scanner.rag.reference_retrieval import ReferenceRetriever
from planetary_scanner.reference_import import (
    earthquake_records,
    exoplanet_records,
    number,
)


def test_earthquake_with_missing_depth_preserves_event_and_unknown_value(tmp_path):
    path = tmp_path / "earthquakes.json"
    path.write_text(
        json.dumps(
            {
                "features": [
                    {
                        "id": "example-event",
                        "geometry": {"coordinates": [10, 20, None]},
                        "properties": {
                            "time": 946684800000,
                            "place": "Example region",
                            "mag": 8,
                            "magType": "mw",
                            "url": "https://earthquake.usgs.gov/example",
                        },
                    }
                ]
            }
        )
    )
    records = earthquake_records(path, date(2026, 10, 6))
    assert len(records) == 1
    assert "hypocenter depth unavailable" in records[0].text
    assert "None" not in records[0].text
    assert records[0].source_locator == "https://earthquake.usgs.gov/example"


def test_exoplanet_bound_and_minimum_mass_are_not_exact_mass(tmp_path):
    path = tmp_path / "exoplanets.csv"
    row = {
        "pl_name": "Example b",
        "hostname": "Example",
        "sy_dist": "2",
        "discoverymethod": "Radial Velocity",
        "pl_orbper": "",
        "pl_orbsmax": "",
        "pl_rade": "",
        "st_teff": "",
        "pl_bmasse": "1.5",
        "pl_bmassprov": "Msini",
        "pl_bmasselim": "1",
        "pl_refname": "",
    }
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)
    record = exoplanet_records(path, date(2026, 10, 6))[0]
    assert "Minimum planet mass M sin i: upper limit 1.5 Earth masses" in record.text
    assert "Planet radius" not in record.text


@pytest.mark.parametrize("value", ["nan", "inf", "-inf"])
def test_non_finite_catalog_numbers_are_rejected(value):
    with pytest.raises(ValueError, match="Non-finite"):
        number(value)


def test_all_collections_have_unique_ids_registered_sources_and_matching_vectors():
    from planetary_scanner.api.main import PROJECT_ROOT, REFERENCE_VECTOR_INDEX_PATHS
    from planetary_scanner.models.corpus import COLLECTIONS
    from planetary_scanner.rag.reference_index import load_reference_vector_index

    all_ids = set()
    for collection in COLLECTIONS:
        documents = build_collection_documents(
            PROJECT_ROOT / "data/reference", collection
        )
        ids = {document.document_id for document in documents}
        assert not all_ids.intersection(ids)
        all_ids.update(ids)
        index = load_reference_vector_index(REFERENCE_VECTOR_INDEX_PATHS[collection])
        assert set(index.document_ids) == ids
        assert index.vectors.shape == (len(documents), 384)
        assert np.isfinite(index.vectors).all()
        assert np.allclose(np.linalg.norm(index.vectors, axis=1), 1, atol=1e-5)
    assert len(all_ids) >= 5000


def test_unregistered_corpus_sources_are_rejected(tmp_path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (tmp_path / "sources.json").write_text('{"schema_version":"1.0","sources":[]}')
    (corpus / "bad.jsonl").write_text(
        json.dumps(
            {
                "record_id": "bad",
                "collection": "earth",
                "topic": "test",
                "text": "Example",
                "kind": "statement",
                "scope": "test",
                "as_of": "2026-10-06",
                "source_id": "missing",
                "source_locator": "missing",
            }
        )
        + "\n"
    )
    with pytest.raises(ValueError, match="Unregistered source"):
        build_collection_documents(tmp_path, "earth")


def test_feature_lookup_preserves_accents_word_boundaries_and_nested_names():
    documents = [
        RagDocument(document_id=name, content=name, metadata={"entity_name": name})
        for name in ("Schrödinger", "Gale", "Montes Alpes", "Alpes")
    ]
    lookup = EntityLookup(documents)
    assert [doc.document_id for doc in lookup.match("Where is schrodinger?")] == [
        "Schrödinger"
    ]
    assert not lookup.match("nightingale")
    assert [doc.document_id for doc in lookup.match("Gale crater")] == ["Gale"]
    assert not lookup.match("Galileo")
    assert [doc.document_id for doc in lookup.match("Montes Alpes")] == ["Montes Alpes"]


def test_named_feature_overrides_whole_body_diameter():
    class Encoder:
        def encode(self, sentences, *, normalize_embeddings):
            return np.array([[1, 0]], dtype=np.float32)

    documents = [
        RagDocument(
            document_id="moon-diameter",
            content="Moon diameter",
            metadata={"field": "mean_diameter"},
        ),
        RagDocument(
            document_id="tycho",
            content="Tycho crater diameter",
            metadata={"entity_name": "Tycho", "field": "surface_feature"},
        ),
    ]
    index = ReferenceVectorIndex(
        np.array([doc.document_id for doc in documents]),
        np.array([[1, 0], [0.8, 0.6]], dtype=np.float32),
        "test",
    )
    retriever = ReferenceRetriever(
        Encoder(), index, {doc.document_id: doc for doc in documents}
    )
    result = retriever.retrieve("What is Tycho's diameter?")
    assert [record.document.document_id for record in result] == ["tycho"]
    assert result[0].score == pytest.approx(0.8)


@pytest.mark.parametrize(
    "question,collection",
    [
        ("What is a super-Earth?", "milky-way"),
        ("Where in the Milky Way is the Sun?", "milky-way"),
        ("What is an exoplanet?", "milky-way"),
        ("Does Europa have an ocean?", "solar-system"),
        ("What is Phobos's mass?", "mars"),
        ("What was the 2024 sunspot number?", "sol"),
        ("What happened in the 1960 Chile earthquake?", "earth"),
        ("What is Earth's mass?", None),
    ],
)
def test_shared_topics_keep_scientific_subject_scope(question, collection):
    assert shared_collection(question) == collection


def test_total_records_updates_when_indexed_records_change(tmp_path, monkeypatch):
    from planetary_scanner.api import main

    path = tmp_path / "records.jsonl"
    first = RagDocument(document_id="first", content="First record", metadata={})
    second = RagDocument(document_id="second", content="Second record", metadata={})
    path.write_text(first.model_dump_json() + "\n")
    monkeypatch.setattr(main, "REFERENCE_RECORD_PATHS", {"earth": path})
    assert main.total_reference_records() == 1
    path.write_text(first.model_dump_json() + "\n" + second.model_dump_json() + "\n")
    assert main.total_reference_records() == 2
