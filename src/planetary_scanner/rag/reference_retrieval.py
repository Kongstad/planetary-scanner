"""Evidence retrieval over local, provenance-preserving reference records."""

import re
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.reference_index import (
    EmbeddingModel,
    ReferenceVectorIndex,
    retrieve_reference_document_scores,
)


class RetrievedReferenceRecord(BaseModel):
    """A cited reference record selected for a retrieval question."""

    document: RagDocument
    score: float


class ReferenceRecordRetriever(Protocol):
    """The retrieval interface used by grounded answer generation."""

    def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]: ...


def load_reference_records(record_path: Path) -> dict[str, RagDocument]:
    """Load authoritative reference records from JSON Lines by document ID."""

    documents = [
        RagDocument.model_validate_json(line)
        for line in record_path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    documents_by_id = {document.document_id: document for document in documents}
    if len(documents_by_id) != len(documents):
        raise ValueError("Reference records must have unique document IDs")
    return documents_by_id


class ReferenceRetriever:
    """Joins vector-ranked IDs to their full cited reference records."""

    def __init__(
        self,
        embedding_model: EmbeddingModel,
        index: ReferenceVectorIndex,
        documents_by_id: dict[str, RagDocument],
    ) -> None:
        self._embedding_model = embedding_model
        self._index = index
        self._documents_by_id = documents_by_id
        missing_document_ids = set(index.document_ids) - documents_by_id.keys()
        if missing_document_ids:
            missing_ids = ", ".join(sorted(missing_document_ids))
            raise ValueError(f"Vector index references unknown documents: {missing_ids}")

    def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
        """Retrieve cited records using semantic similarity and exact-term overlap."""

        if _is_bulk_geochemistry_question(question):
            composition = self._retrieve_bulk_composition(question)
            if composition:
                return composition

        semantic_scores = dict(
            retrieve_reference_document_scores(
                question, self._embedding_model, self._index, len(self._documents_by_id)
            )
        )
        explicit_intent_fields = _explicit_intent_fields(question)
        if len(explicit_intent_fields) > 1:
            return self._retrieve_explicit_intents(semantic_scores, explicit_intent_fields, limit)
        question_tokens = _tokenize(question)
        ranked_document_ids = sorted(
            semantic_scores,
            key=lambda document_id: _hybrid_score(
                semantic_scores[document_id],
                question_tokens,
                _tokenize(self._documents_by_id[document_id].content),
            ),
            reverse=True,
        )[:limit]
        return [
            RetrievedReferenceRecord(
                document=self._documents_by_id[document_id],
                score=semantic_scores[document_id],
            )
            for document_id in ranked_document_ids
        ]

    def _retrieve_explicit_intents(
        self,
        semantic_scores: dict[str, float],
        intent_fields: tuple[tuple[str, ...], ...],
        limit: int,
    ) -> list[RetrievedReferenceRecord]:
        """Select one highest-ranked record for every explicit subject in a compound question."""
        results: list[RetrievedReferenceRecord] = []
        for fields in intent_fields:
            candidates = [
                document
                for document in self._documents_by_id.values()
                if document.metadata.get("field") in fields
            ]
            if not candidates:
                continue
            document = max(candidates, key=lambda candidate: semantic_scores[candidate.document_id])
            results.append(
                RetrievedReferenceRecord(
                    document=document,
                    score=semantic_scores[document.document_id],
                )
            )
        return results[:limit]

    def retrieve_field(self, question: str, field: str) -> RetrievedReferenceRecord | None:
        """Return the highest-ranked record for one explicitly requested field."""

        semantic_scores = dict(
            retrieve_reference_document_scores(
                question, self._embedding_model, self._index, len(self._documents_by_id)
            )
        )
        candidates = [
            document
            for document in self._documents_by_id.values()
            if document.metadata.get("field") == field
        ]
        if not candidates:
            return None
        document = max(candidates, key=lambda candidate: semantic_scores[candidate.document_id])
        return RetrievedReferenceRecord(
            document=document,
            score=semantic_scores[document.document_id],
        )

    def _retrieve_bulk_composition(self, question: str) -> list[RetrievedReferenceRecord]:
        """Return all major-element records needed for a complete composition synthesis."""

        semantic_scores = dict(
            retrieve_reference_document_scores(
                question, self._embedding_model, self._index, len(self._documents_by_id)
            )
        )
        document_ids = sorted(
            (
                document_id
                for document_id, document in self._documents_by_id.items()
                if document.metadata.get("scope")
                == "bulk_earth_elemental_mass_fraction_model"
                or document.metadata.get("scope")
                == "bulk_earth_elemental_mass_fraction_remainder_after_fe_o_si_mg_s"
                or document.metadata.get("scope")
                == "whole_planet_bulk_composition_model_estimate"
                or document.metadata.get("scope")
                == "bulk_silicate_moon_warren_2005_model_oxide_mass_percent_core_excluded"
            ),
            key=lambda document_id: semantic_scores[document_id],
            reverse=True,
        )
        return [
            RetrievedReferenceRecord(
                document=self._documents_by_id[document_id],
                score=semantic_scores[document_id],
            )
            for document_id in document_ids
        ]


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[\w.-]+", text.lower()))


def _is_bulk_geochemistry_question(question: str) -> bool:
    """Identify broad composition questions that need the complete model group."""

    question_lower = question.lower()
    return not any(term in question_lower for term in (
        "atmospher", "exospher", "crust", "water", "ice", "regolith", "sample"
    )) and (
        "geochem" in question_lower
        or "composition" in question_lower
        or "made of" in question_lower
    )


def _explicit_intent_fields(question: str) -> tuple[tuple[str, ...], ...]:
    """Return field groups for explicitly named subjects in a compound planetary question."""
    question_lower = question.lower()
    intents: list[tuple[str, ...]] = []
    if any(term in question_lower for term in ("size", "radius", "diameter")):
        intents.append(("mean_radius", "equatorial_radius", "equatorial_diameter"))
    if "mass" in question_lower and not _is_bulk_geochemistry_question(question) and not any(
        term in question_lower for term in ("fraction", "percent", "oxide")
    ):
        intents.append(("mass",))
    if "gravit" in question_lower:
        intents.append(("equatorial_surface_gravity", "surface_gravity"))
    if "rotation" in question_lower or "day length" in question_lower:
        intents.append(("rotation_period",))
    if "escape" in question_lower:
        intents.append(("equatorial_escape_velocity", "escape_velocity"))
    if "earth" in question_lower and ("population" in question_lower or "people" in question_lower):
        intents.append(("global_human_population",))
    return tuple(intents)


class CrossBodyReferenceRetriever:
    """Retrieve balanced comparison evidence from the named reference sets."""

    def __init__(self, retrievers: dict[str, ReferenceRetriever]) -> None:
        self._retrievers = retrievers

    def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
        """Return balanced evidence from every explicitly named supported body."""

        body_ids = question_body_ids(question)
        if len(body_ids) < 2:
            raise ValueError("Cross-body retrieval requires at least two supported bodies")
        intent_fields = _explicit_intent_fields(question)
        if intent_fields:
            return [
                record
                for body_id in body_ids
                for fields in intent_fields
                if (
                    record := next(
                        (candidate for field in fields
                         if (candidate := self._retrievers[body_id].retrieve_field(question, field))
                         is not None),
                        None,
                    )
                )
                is not None
            ]
        records_per_body = max(3, limit // len(body_ids))
        return [
            record
            for body_id in body_ids
            for record in self._retrievers[body_id].retrieve(question, records_per_body)
        ]


def is_cross_body_question(question: str) -> bool:
    """Return whether the question explicitly names more than one supported body."""

    return len(question_body_ids(question)) > 1


def question_body_ids(question: str) -> tuple[str, ...]:
    """Resolve body names, lunar aliases, and requests about all three bodies."""
    question_lower = question.lower()
    question_lower = re.sub(r"\bearth['’]s\s+moon\b", "moon", question_lower)
    if re.search(r"\b(?:all\s+(?:three|3|bodies)|(?:three|3)\s+bodies)\b", question_lower):
        return ("earth", "mars", "luna")
    return tuple(
        body_id
        for body_id, pattern in (
            ("earth", r"\bearth\b"),
            ("mars", r"\bmars\b"),
            ("luna", r"\b(?:moon|luna|lunar)\b"),
        )
        if re.search(pattern, question_lower)
    )


def _hybrid_score(
    semantic_score: float, question_tokens: set[str], document_tokens: set[str]
) -> float:
    """Blend normalized cosine similarity with exact question-term coverage."""

    lexical_score = len(question_tokens.intersection(document_tokens)) / len(question_tokens)
    return 0.85 * ((semantic_score + 1) / 2) + 0.15 * lexical_score
