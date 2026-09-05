import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from planetary_scanner.models.reference import (
    ReferenceFact,
    ReferenceSource,
    load_validated_reference_dataset,
    reference_fact_to_rag_document,
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