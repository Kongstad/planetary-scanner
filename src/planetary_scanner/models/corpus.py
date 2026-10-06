"""Validated research records kept separate from the viewer's summary facts."""

from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

from planetary_scanner.models.reference import (
    NonEmptyString,
    RagDocument,
    ReferenceSourceRegistry,
    build_reference_rag_documents,
)

COLLECTIONS = ("earth", "mars", "luna", "sol", "solar-system", "milky-way")
CollectionId = Literal["earth", "mars", "luna", "sol", "solar-system", "milky-way"]


class KnowledgeRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_id: NonEmptyString
    collection: CollectionId
    topic: NonEmptyString
    text: NonEmptyString
    kind: Literal["measurement", "statement"]
    scope: NonEmptyString
    as_of: date
    source_id: NonEmptyString
    source_locator: NonEmptyString
    entity_name: NonEmptyString | None = None


def build_collection_documents(reference: Path, collection: str) -> list[RagDocument]:
    if collection not in COLLECTIONS:
        raise ValueError(f"Unknown collection: {collection}")
    registry_path = reference / "sources.json"
    sources = {
        source.source_id: source
        for source in ReferenceSourceRegistry.model_validate_json(
            registry_path.read_text(encoding="utf-8")
        ).sources
    }
    dataset_path = reference / f"{collection}.json"
    documents = (
        build_reference_rag_documents(dataset_path, registry_path)
        if dataset_path.exists()
        else []
    )
    for path in sorted((reference / "corpus").glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            record = KnowledgeRecord.model_validate_json(line)
            if record.source_id not in sources:
                raise ValueError(f"Unregistered source: {record.source_id}")
            if record.collection != collection:
                continue
            source = sources[record.source_id]
            documents.append(
                RagDocument(
                    document_id=record.record_id,
                    content=(
                        f"{record.text} Scope: {record.scope}. "
                        f"As of: {record.as_of}. Source: {source.publisher}, "
                        f"{source.title}. Locator: {record.source_locator}."
                    ),
                    metadata={
                        "body_id": collection,
                        "field": record.topic,
                        "kind": record.kind,
                        "value": record.text,
                        "scope": record.scope,
                        "as_of": record.as_of.isoformat(),
                        "source_id": record.source_id,
                        "source_locator": record.source_locator,
                        "source_url": str(source.url),
                        **(
                            {"entity_name": record.entity_name}
                            if record.entity_name
                            else {}
                        ),
                    },
                )
            )
    if len({document.document_id for document in documents}) != len(documents):
        raise ValueError(f"Duplicate document IDs in {collection}")
    return documents
