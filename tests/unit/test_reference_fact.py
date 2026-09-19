import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from planetary_scanner.models.reference import (
    ReferenceFact,
    ReferenceSource,
    build_reference_rag_documents,
    load_validated_reference_dataset,
    load_validated_retrieval_evaluation_set,
    reference_fact_to_rag_document,
    write_reference_rag_documents,
)

VALID_FACT = {
    "fact_id": "earth-equatorial-diameter",
    "field": "equatorial_diameter",
    "value": 12756,
    "unit": "km",
    "scope": "equatorial",
    "as_of": "2025-12-05",
    "source_id": "nasa-earth-facts-2025",
    "source_locator": "Size and Distance",
}


def test_valid_reference_fact_parses() -> None:
    fact = ReferenceFact.model_validate(VALID_FACT)

    assert fact.as_of.isoformat() == "2025-12-05"
    assert fact.value == 12756


def test_source_backed_statement_has_no_unit() -> None:
    statement = ReferenceFact.model_validate(
        VALID_FACT
        | {
            "kind": "statement",
            "value": "MOST SOLAR MATERIAL DEFLECTED",
            "unit": None,
        }
    )

    assert statement.kind == "statement"
    assert statement.unit is None


def test_reference_fact_converts_to_provenance_preserving_rag_document() -> None:
    fact = ReferenceFact.model_validate(VALID_FACT)
    source = ReferenceSource.model_validate(
        {
            "source_id": "nasa-earth-facts-2025",
            "publisher": "NASA Science",
            "title": "Earth",
            "url": "https://science.nasa.gov/earth/facts/",
            "published_or_updated": "2025-12-05",
            "retrieved_on": "2026-09-04",
            "usage_note": "Public NASA reference page.",
        }
    )

    document = reference_fact_to_rag_document("earth", fact, source)

    assert document.document_id == "reference-fact-earth-equatorial-diameter"
    assert "equatorial diameter is 12756 km" in document.content
    assert "Locator: Size and Distance" in document.content
    assert document.metadata["source_id"] == "nasa-earth-facts-2025"
    assert document.metadata["scope"] == "equatorial"
    assert document.metadata["unit"] == "km"


@pytest.mark.parametrize("required_field", ["unit", "scope", "as_of", "source_id", "source_locator"])
def test_missing_required_provenance_field_is_rejected(required_field: str) -> None:
    invalid_fact = VALID_FACT.copy()
    invalid_fact.pop(required_field)

    with pytest.raises(ValidationError):
        ReferenceFact.model_validate(invalid_fact)


def test_earth_reference_dataset_has_registered_sources() -> None:
    project_root = Path(__file__).parents[2]

    dataset = load_validated_reference_dataset(
        project_root / "data" / "reference" / "earth.json",
        project_root / "data" / "reference" / "sources.json",
    )

    assert dataset.body_id == "earth"
    assert len(dataset.facts) == 74


def test_mars_reference_dataset_has_registered_sources() -> None:
    project_root = Path(__file__).parents[2]

    dataset = load_validated_reference_dataset(
        project_root / "data" / "reference" / "mars.json",
        project_root / "data" / "reference" / "sources.json",
    )

    assert dataset.body_id == "mars"
    assert len(dataset.facts) == 50


def test_solar_system_reference_dataset_has_registered_sources() -> None:
    project_root = Path(__file__).parents[2]

    dataset = load_validated_reference_dataset(
        project_root / "data" / "reference" / "solar-system.json",
        project_root / "data" / "reference" / "sources.json",
    )

    assert dataset.body_id == "solar-system"
    assert len(dataset.facts) == 2


def test_reference_documents_preserve_fact_provenance() -> None:
    project_root = Path(__file__).parents[2]

    documents = build_reference_rag_documents(
        project_root / "data" / "reference" / "earth.json",
        project_root / "data" / "reference" / "sources.json",
    )
    mean_radius = next(document for document in documents if document.metadata["field"] == "mean_radius")

    assert len(documents) == 74
    assert mean_radius.metadata["source_id"] == "jpl-planetary-physical-parameters-2019"
    assert "Locator: Earth row, Mean Radius" in mean_radius.content


def test_reference_rag_documents_are_written_as_deterministic_jsonl(tmp_path: Path) -> None:
    project_root = Path(__file__).parents[2]
    documents = build_reference_rag_documents(
        project_root / "data" / "reference" / "earth.json",
        project_root / "data" / "reference" / "sources.json",
    )
    first_output_path = tmp_path / "earth-reference-records.jsonl"
    second_output_path = tmp_path / "repeat" / "earth-reference-records.jsonl"

    write_reference_rag_documents(first_output_path, documents)
    write_reference_rag_documents(second_output_path, documents)

    first_record = json.loads(first_output_path.read_text(encoding="utf-8").splitlines()[0])
    assert first_output_path.read_bytes() == second_output_path.read_bytes()
    assert len(first_output_path.read_text(encoding="utf-8").splitlines()) == 74
    assert first_record["document_id"] == "reference-fact-earth-mean-radius"
    assert first_record["metadata"]["source_url"] == "https://ssd.jpl.nasa.gov/planets/phys_par.html"


def test_mars_reference_rag_documents_are_written_as_deterministic_jsonl(tmp_path: Path) -> None:
    project_root = Path(__file__).parents[2]
    documents = build_reference_rag_documents(
        project_root / "data" / "reference" / "mars.json",
        project_root / "data" / "reference" / "sources.json",
    )
    first_output_path = tmp_path / "mars-reference-records.jsonl"
    second_output_path = tmp_path / "repeat" / "mars-reference-records.jsonl"

    write_reference_rag_documents(first_output_path, documents)
    write_reference_rag_documents(second_output_path, documents)

    first_record = json.loads(first_output_path.read_text(encoding="utf-8").splitlines()[0])
    assert first_output_path.read_bytes() == second_output_path.read_bytes()
    assert len(first_output_path.read_text(encoding="utf-8").splitlines()) == 50
    assert first_record["document_id"] == "reference-fact-mars-mean-radius"
    assert first_record["metadata"]["body_id"] == "mars"
    assert first_record["metadata"]["source_url"] == "https://ssd.jpl.nasa.gov/planets/phys_par.html"


def test_retrieval_evaluation_set_references_known_documents() -> None:
    project_root = Path(__file__).parents[2]
    documents = build_reference_rag_documents(
        project_root / "data" / "reference" / "earth.json",
        project_root / "data" / "reference" / "sources.json",
    )

    evaluation_set = load_validated_retrieval_evaluation_set(
        project_root / "data" / "evaluation" / "earth-reference-retrieval.json",
        documents,
    )

    assert evaluation_set.body_id == "earth"
    assert [case.case_id for case in evaluation_set.cases] == [
        "earth-mean-radius",
        "earth-mass",
        "earth-axis-tilt",
        "earth-atmospheric-carbon-dioxide",
        "earth-global-heat-flow",
    ]


def test_mars_retrieval_evaluation_set_references_known_documents() -> None:
    project_root = Path(__file__).parents[2]
    documents = build_reference_rag_documents(
        project_root / "data" / "reference" / "mars.json",
        project_root / "data" / "reference" / "sources.json",
    )

    evaluation_set = load_validated_retrieval_evaluation_set(
        project_root / "data" / "evaluation" / "mars-reference-retrieval.json",
        documents,
    )

    assert evaluation_set.body_id == "mars"
    assert [case.case_id for case in evaluation_set.cases] == [
        "mars-mean-radius",
        "mars-mass",
        "mars-axial-tilt",
        "mars-semi-major-axis",
        "mars-relay-orbiters",
        "mars-highest-throughput-relay",
        "mars-atmosphere",
        "mars-global-magnetic-field",
        "mars-solar-wind",
        "mars-aurora",
        "mars-surface-pressure",
        "mars-mola-relief",
        "mars-core-state",
        "mars-current-life",
    ]


def test_retrieval_evaluation_set_rejects_unknown_document_ids(tmp_path: Path) -> None:
    evaluation_path = tmp_path / "evaluation.json"
    evaluation_path.write_text(
        json.dumps(
            {
                "schema_version": "1.0",
                "body_id": "earth",
                "cases": [
                    {
                        "case_id": "invalid-document",
                        "question": "Does this record exist?",
                        "expected_document_ids": ["reference-fact-earth-unknown"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Evaluation cases reference unknown document IDs"):
        load_validated_retrieval_evaluation_set(evaluation_path, [])


def test_dataset_with_unregistered_source_is_rejected(tmp_path: Path) -> None:
    invalid_fact = VALID_FACT | {"source_id": "unknown-source"}
    dataset_path = tmp_path / "earth.json"
    source_registry_path = tmp_path / "sources.json"
    dataset_path.write_text(
        json.dumps({"schema_version": "1.0", "body_id": "earth", "facts": [invalid_fact]}),
        encoding="utf-8",
    )
    source_registry_path.write_text(
        json.dumps({"schema_version": "1.0", "sources": []}), encoding="utf-8"
    )

    with pytest.raises(ValueError, match="Facts cite unregistered source IDs: unknown-source"):
        load_validated_reference_dataset(dataset_path, source_registry_path)