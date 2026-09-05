"""Contracts for curated planetary reference facts."""

from datetime import date
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, HttpUrl, StringConstraints, model_validator

NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ReferenceFact(BaseModel):
    """One source-backed, body-level factual value."""

    fact_id: NonEmptyString
    field: NonEmptyString
    kind: Literal["measurement", "statement"] = "measurement"
    value: int | float | NonEmptyString
    unit: NonEmptyString | None = None
    scope: NonEmptyString
    as_of: date
    source_id: NonEmptyString
    source_locator: NonEmptyString

    @model_validator(mode="after")
    def statement_and_measurement_units_are_consistent(self) -> "ReferenceFact":
        if self.kind == "measurement" and self.unit is None:
            raise ValueError("Measurements require a unit")
        if self.kind == "statement" and self.unit is not None:
            raise ValueError("Statements must not declare a unit")
        return self


class ReferenceDataset(BaseModel):
    """All curated facts for one celestial body."""

    schema_version: NonEmptyString
    body_id: NonEmptyString
    facts: list[ReferenceFact]

    @model_validator(mode="after")
    def fact_ids_match_body(self) -> "ReferenceDataset":
        expected_prefix = f"{self.body_id}-"
        invalid_ids = [fact.fact_id for fact in self.facts if not fact.fact_id.startswith(expected_prefix)]
        if invalid_ids:
            raise ValueError(
                f"Fact IDs must start with {expected_prefix!r}: {', '.join(invalid_ids)}"
            )
        return self


class ReferenceSource(BaseModel):
    """Metadata for an authoritative source in the fact registry."""

    source_id: NonEmptyString
    publisher: NonEmptyString
    title: NonEmptyString
    url: HttpUrl
    published_or_updated: date
    retrieved_on: date
    usage_note: NonEmptyString


class ReferenceSourceRegistry(BaseModel):
    """Source metadata available to reference datasets."""

    schema_version: NonEmptyString
    sources: list[ReferenceSource]


class RagDocument(BaseModel):
    """A retrieval-ready, provenance-preserving text document."""

    document_id: NonEmptyString
    content: NonEmptyString
    metadata: dict[str, str | int | float]


def reference_fact_to_rag_document(
    body_id: str, fact: ReferenceFact, source: ReferenceSource
) -> RagDocument:
    """Represent one validated HUD fact as text and structured retrieval metadata."""

    human_field = fact.field.replace("_", " ")
    content = (
        f"{body_id.title()} reference fact: {human_field} is {fact.value}"
        f"{' ' + fact.unit if fact.unit else ''}. "
        f"Scope: {fact.scope}. As of: {fact.as_of.isoformat()}. "
        f"Source: {source.publisher}, {source.title}. "
        f"Locator: {fact.source_locator}. URL: {source.url}."
    )
    return RagDocument(
        document_id=f"reference-fact-{fact.fact_id}",
        content=content,
        metadata={
            "fact_id": fact.fact_id,
            "body_id": body_id,
            "field": fact.field,
            "kind": fact.kind,
            "value": fact.value,
            "scope": fact.scope,
            "as_of": fact.as_of.isoformat(),
            "source_id": fact.source_id,
            "source_locator": fact.source_locator,
            "source_url": str(source.url),
        },
    )


def load_validated_reference_dataset(
    dataset_path: Path, source_registry_path: Path
) -> ReferenceDataset:
    """Load a fact dataset only when all cited sources are registered."""

    dataset = ReferenceDataset.model_validate_json(dataset_path.read_text(encoding="utf-8"))
    registry = ReferenceSourceRegistry.model_validate_json(
        source_registry_path.read_text(encoding="utf-8")
    )
    registered_source_ids = {source.source_id for source in registry.sources}
    unresolved_source_ids = {
        fact.source_id for fact in dataset.facts if fact.source_id not in registered_source_ids
    }
    if unresolved_source_ids:
        missing_sources = ", ".join(sorted(unresolved_source_ids))
        raise ValueError(f"Facts cite unregistered source IDs: {missing_sources}")
    return dataset