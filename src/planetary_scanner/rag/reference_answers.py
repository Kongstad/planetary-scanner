"""Grounded answer generation from retrieved reference records."""

import json
import math
import os
import re
from collections.abc import Sequence
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel

from planetary_scanner.rag.reference_retrieval import (
    ReferenceRecordRetriever,
    RetrievedReferenceRecord,
    question_body_ids,
    question_intent_fields,
)

DEFAULT_ANSWER_MODEL = "ministral-3:8b"
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip(
    "/"
)
OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_TAGS_URL = f"{OLLAMA_BASE_URL}/api/tags"


class AnswerGenerator(Protocol):
    """A local model capable of producing a structured grounded answer."""

    def generate(self, prompt: str) -> "GeneratedAnswer": ...


class GeneratedAnswer(BaseModel):
    """The limited fields the language model is allowed to provide."""

    answer: str
    insufficient_evidence: bool


class GroundedAnswer(BaseModel):
    """An answer paired with the application-controlled evidence citations."""

    answer: str
    insufficient_evidence: bool
    citations: list[RetrievedReferenceRecord]
    needs_clarification: bool = False


def comparison_clarification(question: str) -> GroundedAnswer | None:
    if re.search(
        r"\b(?:ratio|ratios|proportion|proportions)\b", question.lower()
    ) and not question_intent_fields(question):
        return GroundedAnswer(
            answer="Which property would you like to compare: mass, radius, diameter, volume, density, or surface gravity? Each gives a different ratio.",
            insufficient_evidence=False,
            needs_clarification=True,
            citations=[],
        )
    return None


def is_ollama_model_available(model_name: str = DEFAULT_ANSWER_MODEL) -> bool:
    """Return whether the configured local answer model is available from Ollama."""
    try:
        with urlopen(OLLAMA_TAGS_URL, timeout=5) as response:
            models = json.loads(response.read())["models"]
    except (HTTPError, URLError, TimeoutError, KeyError, json.JSONDecodeError):
        return False
    return any(model.get("name") == model_name for model in models)


def build_grounded_answer_prompt(
    question: str, records: Sequence[RetrievedReferenceRecord]
) -> str:
    """Build the complete evidence-bounded prompt for a local answer model."""

    evidence = "\n\n".join(
        f"[{record.document.document_id}]\n{record.document.content}"
        for record in records
    )
    quantitative_note = ""
    if records and all(
        record.document.metadata.get("kind") == "statement"
        and not _numbers(str(record.document.metadata.get("value", "")))
        for record in records
    ):
        quantitative_note = "These records contain no quantitative measurements. Do not include numbers, dates, or percentages in the answer."
    catalog_note = _catalog_scope_note(question, records)
    quantitative_note += " " + catalog_note
    return f"""Answer scientific questions in concise, plain language using only the evidence records
below. Do not use outside knowledge. Do not roleplay or invent observations.
Luna means Earth's Moon. Name each body when comparing records from different bodies.
Sol means the Sun. Solar photospheric composition is by number, not whole-star mass.
Percentages and ppm must retain their units. 10,000 ppm equals 1 percent.
Respect each record's scope: model estimates remain estimates. Lunar bulk silicate oxide
percentages describe mantle plus crust and exclude the metallic core. Do not treat oxide
mass percentages as elemental percentages or directly equate them to whole-planet composition.
When reporting lunar bulk silicate composition, explicitly describe it as a model estimate
for the mantle and crust, excluding the core. Include this scope in the answer itself.
Values already expressed in wt% or % are percentages. Do not multiply them by 100.
Retain qualifiers such as approximate, upper limit, nighttime, and variable when they affect
the measurement. An upper-limit estimate must not be described as a fixed exact value.
Catalog masses labeled M sin i are minimum masses, not true masses. Named-feature diameters
and coordinates describe that feature, not its host body. Sunspot numbers are dimensionless
activity indices for the stated annual or monthly period, not literal instantaneous spot counts.
Distinguish evidence for potentially habitable conditions from confirmed life.
For a direct factual value stated in an evidence record, answer in one concise, complete sentence
that names the measured property and reports its exact value and unit, then set
insufficient_evidence to false. For example: "Earth's bulk iron mass fraction is 32.1%."
For a broad question, synthesize the relevant evidence into one or two natural, scientifically
useful sentences. Focus on the requested property or explanation and omit unrelated facts.
Do not name publishers or publications unless asked. Do not mechanically list every retrieved fact. Translate categorical values into
ordinary prose, or omit them when they add no useful information. Never quote UI-style labels such
as "LIFE ABUNDANT". Present dimensionless fractions used for composition or abundance as percentages
(for example, 0.321 as 32.1%), retaining the source precision. Mention dates only when they are
needed to interpret a measurement. When summarizing components that form a complete group, account
for every provided component accurately. Do not invent totals or describe a listed remainder as
unaccounted-for mass.
If the evidence does not answer the question, set
insufficient_evidence to true and explain briefly. Do not report unrelated facts or a partial
numeric answer when the requested property is missing. Never use a boolean as the answer value.
For comparisons, cover every requested body and compare the same property and compatible units.
Report a numerical value only when the supplied evidence explicitly gives it. If a record
names an atmospheric gas without its percentage, name the gas without adding a percentage.
If the question asks for a ratio without specifying a property, ask which property to compare.
Return valid JSON only with two fields: "answer" (a human-readable string) and
"insufficient_evidence" (a boolean).

Question:
{question}

Evidence records:
{evidence}

{quantitative_note}
"""


class OllamaAnswerGenerator:
    """Synchronous adapter for Ollama's local generate API."""

    def __init__(self, model_name: str = DEFAULT_ANSWER_MODEL) -> None:
        self._model_name = model_name

    def generate(self, prompt: str) -> GeneratedAnswer:
        instructions, separator, question_and_evidence = prompt.partition(
            "\n\nQuestion:\n"
        )
        request = Request(
            OLLAMA_GENERATE_URL,
            data=json.dumps(
                {
                    "model": self._model_name,
                    "system": instructions if separator else "",
                    "prompt": "Question:\n" + question_and_evidence
                    if separator
                    else prompt,
                    "format": GeneratedAnswer.model_json_schema(),
                    "stream": False,
                    "options": {"temperature": 0},
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=120) as response:
            payload = json.loads(response.read())
        return GeneratedAnswer.model_validate_json(payload["response"])


class GroundedAnswerService:
    """Retrieve evidence, calculate ratios, and check generated answers."""

    def __init__(
        self,
        retriever: ReferenceRecordRetriever,
        generator: AnswerGenerator,
    ) -> None:
        self._retriever = retriever
        self._generator = generator

    def answer(self, question: str, limit: int = 3) -> GroundedAnswer:
        """Answer a question and return the exact evidence given to the model."""

        clarification = comparison_clarification(question)
        if clarification is not None:
            return clarification
        citations = self._retriever.retrieve(question, limit)
        ratio = _comparison_ratio(question, citations)
        if ratio is not None:
            return ratio
        if not citations:
            return GroundedAnswer(
                answer="The reference collection does not contain evidence for this question.",
                insufficient_evidence=True,
                citations=[],
            )
        generated = self._generator.generate(
            build_grounded_answer_prompt(question, citations)
        )
        scope_note = _catalog_scope_note(question, citations)
        missing_scope = scope_note and not _retains_catalog_scope(
            generated.answer, citations
        )
        if not generated.insufficient_evidence and (
            _has_unsupported_numbers(generated.answer, citations) or missing_scope
        ):
            generated = self._generator.generate(
                build_grounded_answer_prompt(question, citations)
                + "\nAnswer again using only supported values and retaining the required measurement qualifiers. Omit additional quantities.\n"
                + scope_note
            )
            if not generated.insufficient_evidence and (
                _has_unsupported_numbers(generated.answer, citations)
                or (
                    scope_note
                    and not _retains_catalog_scope(generated.answer, citations)
                )
            ):
                return GroundedAnswer(
                    answer="The local model changed a measurement or omitted its required qualifier, so its answer was rejected. Try rephrasing or narrowing the question.",
                    insufficient_evidence=True,
                    citations=citations,
                )
        answer = generated.answer
        lunar_summary = _complete_lunar_composition_summary(citations)
        if lunar_summary is not None and not generated.insufficient_evidence:
            answer = lunar_summary
        if generated.insufficient_evidence:
            answer = "The retrieved reference records do not provide enough evidence to answer this question. Try naming a specific property, or asking about a narrower topic."
        return GroundedAnswer(
            answer=answer,
            insufficient_evidence=generated.insufficient_evidence,
            citations=citations,
        )


def _catalog_scope_note(
    question: str, records: Sequence[RetrievedReferenceRecord]
) -> str:
    if re.search(r"\bmass\b", question.lower()) and any(
        "Minimum planet mass M sin i" in record.document.content for record in records
    ):
        return "The supplied planet mass is a MINIMUM MASS (M sin i). Explicitly say minimum mass in your answer. Do not report it as the true mass."
    if records and all(
        record.document.metadata.get("field") == "sunspot_observation"
        for record in records
    ):
        period = (
            "monthly" if "monthly mean" in records[0].document.content else "yearly"
        )
        return f"Report this as the {period} MEAN sunspot-number INDEX for the requested period. Include mean and index in the answer."
    return ""


def _retains_catalog_scope(
    answer: str, records: Sequence[RetrievedReferenceRecord]
) -> bool:
    if any(
        "Minimum planet mass M sin i" in record.document.content for record in records
    ):
        return "minimum" in answer.lower() or bool(
            re.search(r"m\s*sin\s*i", answer.lower())
        )
    return "mean" in answer.lower() and any(
        term in answer.lower() for term in ("sunspot", "index")
    )


def _numbers(text: str) -> list[float]:
    pattern = r"(?<![\w.])(-?(?:\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(?:\s+(million|billion|trillion))?"
    multipliers = {"": 1, "million": 1e6, "billion": 1e9, "trillion": 1e12}
    return [
        float(value.replace(",", "")) * multipliers[scale]
        for value, scale in re.findall(pattern, text.lower())
    ]


def _has_unsupported_numbers(
    answer: str, records: Sequence[RetrievedReferenceRecord]
) -> bool:
    supported = [
        value for record in records for value in _numbers(record.document.content)
    ]
    for record in records:
        metadata = record.document.metadata
        value = metadata.get("value")
        if isinstance(value, (int, float)):
            if metadata.get("unit") == "1":
                supported.append(value * 100)
            elif metadata.get("unit") == "ppm":
                supported.append(value / 10000)
    return any(
        not any(
            math.isclose(value, reference, rel_tol=0.005, abs_tol=1e-9)
            for reference in supported
        )
        for value in _numbers(answer)
    )


def _comparison_ratio(
    question: str, records: Sequence[RetrievedReferenceRecord]
) -> GroundedAnswer | None:
    if not re.search(r"\b(?:ratio|ratios|proportion|proportions)\b", question.lower()):
        return None
    body_ids = question_body_ids(question)
    intents = question_intent_fields(question)
    if len(body_ids) < 2 or len(intents) != 1:
        return None
    selected = {}
    for body_id in body_ids:
        for field in intents[0]:
            record = next(
                (
                    record
                    for record in records
                    if record.document.metadata.get("body_id") == body_id
                    and record.document.metadata.get("field") == field
                ),
                None,
            )
            if record is not None:
                selected[body_id] = record
                break
    values = [record.document.metadata.get("value") for record in selected.values()]
    units = {record.document.metadata.get("unit") for record in selected.values()}
    fields = {record.document.metadata.get("field") for record in selected.values()}
    compatible_fields = (
        len(fields) == 1
        or fields <= {"equatorial_surface_gravity", "surface_gravity"}
        or fields <= {"equatorial_escape_velocity", "escape_velocity"}
    )
    if (
        len(selected) != len(body_ids)
        or len(units) != 1
        or None in units
        or not compatible_fields
        or any(
            type(value) not in (int, float) or not math.isfinite(value) or value <= 0
            for value in values
        )
    ):
        return GroundedAnswer(
            answer="The reference collection does not provide a comparable value with matching units for every requested body.",
            insufficient_evidence=True,
            citations=list(selected.values()),
        )
    baseline = "earth" if "earth" in selected else body_ids[0]
    baseline_value = selected[baseline].document.metadata["value"]
    names = {"earth": "Earth", "mars": "Mars", "luna": "Moon", "sol": "Sol"}
    label = intents[0][0].replace("equatorial_", "").replace("_", " ")
    ratios = []
    for body_id in body_ids:
        value = selected[body_id].document.metadata["value"] / baseline_value
        formatted = f"{value:,.0f}" if value >= 1000 else f"{value:.5g}"
        ratios.append(f"{names[body_id]} {formatted}")
    return GroundedAnswer(
        answer=f"For {label}, with {names[baseline]} set to 1, the approximate ratios are: {', '.join(ratios)}. These ratios use the cited reference values.",
        insufficient_evidence=False,
        citations=list(selected.values()),
    )


def _complete_lunar_composition_summary(
    records: Sequence[RetrievedReferenceRecord],
) -> str | None:
    """Render the complete curated oxide group without losing a value or its scope."""
    labels = {
        "bulk_silicate_silica_fraction": "silica (SiO₂)",
        "bulk_silicate_magnesia_fraction": "magnesia (MgO)",
        "bulk_silicate_iron_oxide_fraction": "iron oxide (FeO)",
        "bulk_silicate_alumina_fraction": "alumina (Al₂O₃)",
        "bulk_silicate_lime_fraction": "lime (CaO)",
        "bulk_silicate_titania_fraction": "titania (TiO₂)",
    }
    scope = "bulk_silicate_moon_warren_2005_model_oxide_mass_percent_core_excluded"
    if len(records) != len(labels) or any(
        record.document.metadata.get("body_id") != "luna"
        or record.document.metadata.get("scope") != scope
        or record.document.metadata.get("unit") != "wt%"
        or not isinstance(record.document.metadata.get("value"), (int, float))
        for record in records
    ):
        return None
    facts = {
        record.document.metadata.get("field"): record.document.metadata
        for record in records
    }
    if facts.keys() != labels.keys():
        return None
    components = [
        f"{label} {facts[field]['value']:g} wt%" for field, label in labels.items()
    ]
    return (
        "The Warren (2005) model estimates the Moon's mantle-and-crust composition, "
        "excluding the metallic core, as "
        + ", ".join(components[:-1])
        + ", and "
        + components[-1]
        + "."
    )
