"""Evidence retrieval over local, provenance-preserving reference records."""

import re
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.corpus_routing import EntityLookup
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

    def retrieve(
        self, question: str, limit: int = 3
    ) -> list[RetrievedReferenceRecord]: ...


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
        body_level_intents: bool = True,
    ) -> None:
        self._embedding_model = embedding_model
        self._index = index
        self._documents_by_id = documents_by_id
        self._entities = EntityLookup(documents_by_id.values())
        self._body_level_intents = body_level_intents
        missing_document_ids = set(index.document_ids) - documents_by_id.keys()
        if missing_document_ids:
            missing_ids = ", ".join(sorted(missing_document_ids))
            raise ValueError(
                f"Vector index references unknown documents: {missing_ids}"
            )

    def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
        """Retrieve cited records using semantic similarity and exact-term overlap."""

        if limit < 1:
            raise ValueError("Retrieval limit must be positive")
        semantic_scores = dict(
            retrieve_reference_document_scores(
                question, self._embedding_model, self._index, len(self._documents_by_id)
            )
        )
        entities = self._entities.match(question)
        if entities:
            return [
                RetrievedReferenceRecord(
                    document=document, score=semantic_scores[document.document_id]
                )
                for document in entities[:limit]
            ]

        if re.search(r"\bsunspot", question.lower()):
            period = re.search(r"\b((?:17|18|19|20)\d{2})(?:-(\d{2}))?\b", question)
            if period:
                suffix = period.group(0)
                document = self._documents_by_id.get(
                    f"observation-sol-sunspots-{suffix}"
                )
                if document is not None:
                    return [
                        RetrievedReferenceRecord(
                            document=document,
                            score=semantic_scores[document.document_id],
                        )
                    ]
                return []

        if _is_bulk_geochemistry_question(question):
            composition = self._retrieve_bulk_composition(question)
            if composition:
                return composition

        explicit_intent_fields = question_intent_fields(question)
        moon_names = re.findall(r"\b(?:phobos|deimos)\b", question.lower())
        if moon_names:
            candidates = {
                document_id: score
                for document_id, score in semantic_scores.items()
                if any(
                    name in self._documents_by_id[document_id].content.lower()
                    for name in moon_names
                )
            }
            if candidates:
                matched_fields = {
                    name + "_" + field.removeprefix("mean_")
                    for name in moon_names
                    for fields in explicit_intent_fields
                    for field in fields
                }
                if matched_fields:
                    candidates = {
                        document_id: score
                        for document_id, score in candidates.items()
                        if self._documents_by_id[document_id].metadata.get("field")
                        in matched_fields
                    }
                return self._rank_records(question, candidates, limit)
        if "earthquake" in question.lower():
            year = re.search(r"\b(?:19|20)\d{2}\b", question)
            if year:
                candidates = {
                    document_id: score
                    for document_id, score in semantic_scores.items()
                    if f"occurred on {year.group(0)}-"
                    in self._documents_by_id[document_id].content
                }
                return self._rank_records(question, candidates, limit)
        feature_question = re.search(
            r"\b(?:craters?|mons|montes|mare|maria|vallis|chasma|surface features?)\b",
            question.lower(),
        )
        if explicit_intent_fields and self._body_level_intents and not feature_question:
            return self._retrieve_explicit_intents(
                semantic_scores, explicit_intent_fields, limit
            )
        if not self._body_level_intents:
            definition_fields = {
                "asteroid": "asteroid_definition",
                "comet": "comet_nucleus",
                "meteor": "meteor_definition",
                "meteoroid": "meteoroid_definition",
                "meteorite": "meteorite_definition",
            }
            requested = [
                field
                for term, field in definition_fields.items()
                if re.search(rf"\b{term}s?\b", question.lower())
            ]
            if len(requested) > 1:
                candidates = {
                    document_id: score
                    for document_id, score in semantic_scores.items()
                    if self._documents_by_id[document_id].metadata.get("field")
                    in requested
                }
                return self._rank_records(
                    question, candidates, max(limit, len(requested))
                )
        return self._rank_records(question, semantic_scores, limit)

    def _rank_records(
        self, question: str, semantic_scores: dict[str, float], limit: int
    ) -> list[RetrievedReferenceRecord]:
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
        if ranked_document_ids:
            best_score = max(
                semantic_scores[document_id] for document_id in ranked_document_ids
            )
            ranked_document_ids = [
                document_id
                for document_id in ranked_document_ids
                if semantic_scores[document_id] >= best_score - 0.2
            ]
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
        """Select one highest-ranked record for each explicitly requested property."""
        results: list[RetrievedReferenceRecord] = []
        for fields in intent_fields:
            candidates = [
                document
                for document in self._documents_by_id.values()
                if document.metadata.get("field") in fields
            ]
            if not candidates:
                continue
            document = max(
                candidates, key=lambda candidate: semantic_scores[candidate.document_id]
            )
            results.append(
                RetrievedReferenceRecord(
                    document=document,
                    score=semantic_scores[document.document_id],
                )
            )
        return results[:limit]

    def retrieve_field(
        self, question: str, field: str
    ) -> RetrievedReferenceRecord | None:
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
        document = max(
            candidates, key=lambda candidate: semantic_scores[candidate.document_id]
        )
        return RetrievedReferenceRecord(
            document=document,
            score=semantic_scores[document.document_id],
        )

    def _retrieve_bulk_composition(
        self, question: str
    ) -> list[RetrievedReferenceRecord]:
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
                or document.metadata.get("scope")
                == "solar_photosphere_elemental_number_abundance"
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
    return not any(
        term in question_lower
        for term in (
            "atmospher",
            "exospher",
            "crust",
            "water",
            "ice",
            "regolith",
            "sample",
        )
    ) and (
        "geochem" in question_lower
        or "composition" in question_lower
        or "made of" in question_lower
    )


def question_intent_fields(question: str) -> tuple[tuple[str, ...], ...]:
    """Return evidence fields for explicitly requested planetary properties."""
    question_lower = question.lower()
    intents: list[tuple[str, ...]] = []
    if "diameter" in question_lower:
        intents.append(("mean_diameter", "equatorial_diameter"))
    elif "core" not in question_lower and any(
        term in question_lower for term in ("size", "radius", "bigger", "larger")
    ):
        intents.append(("mean_radius", "equatorial_radius", "equatorial_diameter"))
    if (
        re.search(r"\b(?:mass|weight|weigh|heavier|heaviest)\b", question_lower)
        and not _is_bulk_geochemistry_question(question)
        and not any(
            term in question_lower
            for term in (
                "fraction",
                "percent",
                "oxide",
                "conversion",
                "loss",
                "atmosphere",
                "hydrosphere",
                "exosphere",
                "core",
                "crust",
                "mantle",
            )
        )
    ):
        intents.append(("mass",))
    if re.search(r"\b(?:gravity|gravities)\b", question_lower):
        intents.append(("equatorial_surface_gravity", "surface_gravity"))
    if "dens" in question_lower:
        if "exospher" in question_lower or "particle" in question_lower:
            intents.append(("surface_particle_density",))
        elif "atmospher" in question_lower or "air" in question_lower:
            intents.append(("surface_air_density", "surface_atmospheric_density"))
        elif "core" in question_lower:
            intents.append(("core_density",))
        else:
            intents.append(("mean_density",))
    if "volume" in question_lower:
        intents.append(("volume",))
    if "surface area" in question_lower:
        intents.append(("surface_area",))
    if "circumference" in question_lower:
        intents.append(("mean_circumference",))
    if "rotation" in question_lower or "day length" in question_lower:
        intents.append(("rotation_period",))
    if "escape" in question_lower:
        intents.append(("equatorial_escape_velocity", "escape_velocity"))
    if "earth" in question_lower and (
        "population" in question_lower or "people" in question_lower
    ):
        intents.append(("global_human_population",))
    if (
        re.search(r"\b(?:sun|sol)\b", question_lower)
        and ("energy" in question_lower or "power" in question_lower)
        and re.search(
            r"\b(?:produce[sd]?|generate[sd]?|source|powered|powers?)\b", question_lower
        )
    ):
        intents.append(("energy_source",))
    return tuple(intents)


class CrossBodyReferenceRetriever:
    """Retrieve balanced comparison evidence from the named reference sets."""

    def __init__(self, retrievers: dict[str, ReferenceRetriever]) -> None:
        self._retrievers = retrievers

    def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
        """Return balanced evidence from every explicitly named supported body."""

        body_ids = question_body_ids(question)
        if len(body_ids) < 2:
            raise ValueError(
                "Cross-body retrieval requires at least two supported bodies"
            )
        intent_fields = question_intent_fields(question)
        if intent_fields:
            records = []
            for body_id in body_ids:
                for fields in intent_fields:
                    for field in fields:
                        record = self._retrievers[body_id].retrieve_field(
                            question, field
                        )
                        if record is not None:
                            records.append(record)
                            break
            return records
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
    """Resolve body names and explicit requests about three or four bodies."""
    question_lower = question.lower()
    question_lower = re.sub(r"\bearth['’]s\s+moon\b", "moon", question_lower)
    if re.search(
        r"\b(?:all\s+(?:four|4|bodies)|(?:four|4)\s+(?:(?:different|planetary|celestial)\s+)*bodies|(?:four|4)\s+of\s+them)\b",
        question_lower,
    ):
        return ("earth", "mars", "luna", "sol")
    if re.search(
        r"\b(?:all\s+(?:three|3)|(?:three|3)\s+(?:(?:different|planetary|celestial)\s+)*bodies|(?:three|3)\s+of\s+them)\b",
        question_lower,
    ):
        return ("earth", "mars", "luna")
    return tuple(
        body_id
        for body_id, pattern in (
            ("earth", r"\bearth\b"),
            ("mars", r"\bmars\b"),
            ("luna", r"\b(?:moon|luna|lunar)\b"),
            ("sol", r"\b(?:sun|sol)\b"),
        )
        if re.search(pattern, question_lower)
    )


def _hybrid_score(
    semantic_score: float, question_tokens: set[str], document_tokens: set[str]
) -> float:
    """Blend normalized cosine similarity with exact question-term coverage."""

    lexical_score = len(question_tokens.intersection(document_tokens)) / len(
        question_tokens
    )
    return 0.85 * ((semantic_score + 1) / 2) + 0.15 * lexical_score
