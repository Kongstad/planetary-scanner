from collections.abc import Sequence

import pytest

from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.reference_answers import (
    GeneratedAnswer,
    GroundedAnswerService,
    build_grounded_answer_prompt,
)
from planetary_scanner.rag.reference_retrieval import RetrievedReferenceRecord


class FakeRetriever:
    def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
        assert question == "What is Earth's mean radius?"
        assert limit == 1
        return [
            RetrievedReferenceRecord(
                document=RagDocument(
                    document_id="reference-fact-earth-mean-radius",
                    content="Earth mean radius is 6371.0084 km.",
                    metadata={"source_id": "jpl"},
                ),
                score=0.9,
            )
        ]


class FakeAnswerGenerator:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    def generate(self, prompt: str) -> GeneratedAnswer:
        self.prompts.append(prompt)
        return GeneratedAnswer(
            answer="Earth's mean radius is 6371.0084 km.", insufficient_evidence=False
        )


def test_grounded_answer_prompt_includes_only_supplied_evidence() -> None:
    records: Sequence[RetrievedReferenceRecord] = FakeRetriever().retrieve(
        "What is Earth's mean radius?", limit=1
    )

    prompt = build_grounded_answer_prompt("What is Earth's mean radius?", records)

    assert "[reference-fact-earth-mean-radius]" in prompt
    assert "Earth mean radius is 6371.0084 km." in prompt
    assert "Planetary Scanner Science Computer" in prompt
    assert "concise mission-analysis voice" in prompt
    assert "Do not use outside knowledge." in prompt
    assert "answer in one concise, complete sentence" in prompt
    assert "synthesize the relevant evidence" in prompt
    assert '"LIFE ABUNDANT"' in prompt
    assert "0.321 as 32.1%" in prompt
    assert "Do not invent totals" in prompt
    assert "Never use a boolean as the answer value." in prompt
    assert "Luna means Earth's Moon" in prompt
    assert "exclude the metallic core" in prompt
    assert "do not multiply them by 100" in prompt


def test_grounded_answer_service_returns_application_controlled_citations() -> None:
    generator = FakeAnswerGenerator()
    service = GroundedAnswerService(FakeRetriever(), generator)

    answer = service.answer("What is Earth's mean radius?", limit=1)

    assert answer.answer == "Earth's mean radius is 6371.0084 km."
    assert not answer.insufficient_evidence
    assert [citation.document.document_id for citation in answer.citations] == [
        "reference-fact-earth-mean-radius"
    ]
    assert "[reference-fact-earth-mean-radius]" in generator.prompts[0]


def test_grounded_answer_service_replaces_insufficient_evidence_placeholder() -> None:
    class PlaceholderAnswerGenerator:
        def generate(self, prompt: str) -> GeneratedAnswer:
            return GeneratedAnswer(
                answer="Insufficient evidence", insufficient_evidence=True
            )

    answer = GroundedAnswerService(
        FakeRetriever(), PlaceholderAnswerGenerator()
    ).answer("What is Earth's mean radius?", limit=1)

    assert answer.insufficient_evidence
    assert answer.answer.startswith(
        "The retrieved reference records do not provide enough evidence"
    )


def test_lunar_composition_answer_preserves_all_values_and_model_scope() -> None:
    fields = {
        "silica": 46.8,
        "magnesia": 36,
        "iron_oxide": 9.24,
        "alumina": 3.87,
        "lime": 3.06,
        "titania": 0.18,
    }

    class CompositionRetriever:
        def retrieve(
            self, question: str, limit: int = 3
        ) -> list[RetrievedReferenceRecord]:
            return [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id=f"luna-{compound}",
                        content=f"Luna {compound} {value} wt%",
                        metadata={
                            "body_id": "luna",
                            "field": f"bulk_silicate_{compound}_fraction",
                            "value": value,
                            "unit": "wt%",
                            "scope": "bulk_silicate_moon_warren_2005_model_oxide_mass_percent_core_excluded",
                        },
                    ),
                    score=1.0,
                )
                for compound, value in fields.items()
            ]

    class IncompleteGenerator:
        def generate(self, prompt: str) -> GeneratedAnswer:
            return GeneratedAnswer(
                answer="The Moon contains 46.8% silica.", insufficient_evidence=False
            )

    result = GroundedAnswerService(
        CompositionRetriever(), IncompleteGenerator()
    ).answer("What is the Moon made of?")
    assert "model estimates" in result.answer
    assert "mantle-and-crust" in result.answer
    assert "excluding the metallic core" in result.answer
    assert all(f"{value:g} wt%" in result.answer for value in fields.values())
    assert len(result.citations) == 6
    assert not result.insufficient_evidence


@pytest.mark.parametrize(
    "question",
    [
        "So whats the ratio between the 4 of them, and by 4 of them i mean the 4 different planetary bodies",
        "What is the ratio between Earth and Mars?",
    ],
)
def test_unspecified_ratio_asks_for_property_without_retrieval_or_generation(question):
    class UnusedDependency:
        def retrieve(self, *args):
            raise AssertionError("Ambiguous ratios must not retrieve arbitrary facts")

        def generate(self, *args):
            raise AssertionError("Ambiguous ratios must not call the model")

    dependency = UnusedDependency()
    result = GroundedAnswerService(dependency, dependency).answer(question)
    assert result.needs_clarification
    assert not result.insufficient_evidence
    assert result.citations == []
    assert "mass, radius" in result.answer


def test_insufficient_evidence_does_not_leak_unrelated_model_claims():
    class UnrelatedGenerator:
        def generate(self, prompt):
            return GeneratedAnswer(
                answer="Sol has 99.8% of solar-system mass and hydrogen 90.965%.",
                insufficient_evidence=True,
            )

    result = GroundedAnswerService(FakeRetriever(), UnrelatedGenerator()).answer(
        "What is Earth's mean radius?", limit=1
    )
    assert result.insufficient_evidence
    assert "99.8" not in result.answer
    assert "hydrogen" not in result.answer


@pytest.mark.parametrize("corrected", [True, False])
def test_unsupported_numbers_are_corrected_once_or_rejected(corrected):
    class CorrectingGenerator:
        calls = 0

        def generate(self, prompt):
            self.calls += 1
            if self.calls == 2:
                assert "only supported values" in prompt
                if corrected:
                    return GeneratedAnswer(
                        answer="Earth's mean radius is 6371 km.",
                        insufficient_evidence=False,
                    )
            return GeneratedAnswer(
                answer="Earth's mean radius is 6371 km and its core is 0.7% hydrogen.",
                insufficient_evidence=False,
            )

    generator = CorrectingGenerator()
    result = GroundedAnswerService(FakeRetriever(), generator).answer(
        "What is Earth's mean radius?", limit=1
    )
    assert generator.calls == 2
    assert result.insufficient_evidence is not corrected
    assert "0.7" not in result.answer
    if not corrected:
        assert "answer was rejected" in result.answer


@pytest.mark.parametrize("corrected", [True, False])
def test_minimum_exoplanet_mass_must_retain_its_qualifier(corrected):
    class Retriever:
        def retrieve(self, question, limit):
            return [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id="example-planet",
                        content="Minimum planet mass M sin i: 1.055 Earth masses.",
                        metadata={"field": "exoplanet_profile", "kind": "measurement"},
                    ),
                    score=0.8,
                )
            ]

    class Generator:
        calls = 0

        def generate(self, prompt):
            self.calls += 1
            assert "MINIMUM MASS" in prompt
            qualifier = "minimum " if corrected and self.calls == 2 else ""
            return GeneratedAnswer(
                answer=f"Its {qualifier}mass is 1.055 Earth masses.",
                insufficient_evidence=False,
            )

    generator = Generator()
    answer = GroundedAnswerService(Retriever(), generator).answer("What is its mass?")
    assert generator.calls == 2
    assert answer.insufficient_evidence is not corrected
    if corrected:
        assert "minimum mass" in answer.answer


def test_yearly_mean_sunspot_number_is_valid_without_literal_index_word():
    class Retriever:
        def retrieve(self, question, limit):
            return [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id="sunspots-2024",
                        content="For 2024, the yearly mean total International Sunspot Number is 154.7.",
                        metadata={
                            "field": "sunspot_observation",
                            "kind": "measurement",
                        },
                    ),
                    score=0.8,
                )
            ]

    class Generator:
        def generate(self, prompt):
            return GeneratedAnswer(
                answer="The yearly mean total International Sunspot Number for 2024 was 154.7.",
                insufficient_evidence=False,
            )

    answer = GroundedAnswerService(Retriever(), Generator()).answer(
        "What was the sunspot number in 2024?"
    )
    assert not answer.insufficient_evidence


@pytest.mark.parametrize(
    ("value", "unit", "answer"),
    [
        (0.321, "1", "Iron accounts for 32.1%."),
        (330, "ppm", "Carbon accounts for 0.033%."),
        (8.2e9, "count", "There are 8.2 billion people."),
    ],
)
def test_numeric_grounding_accepts_supported_display_conversions(value, unit, answer):
    class ValueRetriever:
        def retrieve(self, question, limit):
            return [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id="value",
                        content=f"Reference value: {value} {unit}.",
                        metadata={"value": value, "unit": unit},
                    ),
                    score=1,
                )
            ]

    class ValueGenerator:
        calls = 0

        def generate(self, prompt):
            self.calls += 1
            return GeneratedAnswer(answer=answer, insufficient_evidence=False)

    generator = ValueGenerator()
    result = GroundedAnswerService(ValueRetriever(), generator).answer(
        "Explain this value"
    )
    assert not result.insufficient_evidence
    assert result.answer == answer
    assert generator.calls == 1


def test_mass_ratio_uses_matching_evidence_and_explicit_baseline():
    class MassRetriever:
        def retrieve(self, question, limit):
            return [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id=f"{body}-mass",
                        content=f"{body} mass",
                        metadata={
                            "body_id": body,
                            "field": "mass",
                            "value": value,
                            "unit": "kg",
                            "scope": "total_mass",
                        },
                    ),
                    score=0.8,
                )
                for body, value in (
                    ("earth", 100),
                    ("mars", 10),
                    ("luna", 1),
                    ("sol", 100000),
                )
            ]

    class UnusedGenerator:
        def generate(self, prompt):
            raise AssertionError("The model must not invent arithmetic")

    result = GroundedAnswerService(MassRetriever(), UnusedGenerator()).answer(
        "What is the mass ratio between all 4 bodies?"
    )
    assert not result.insufficient_evidence
    assert "Earth set to 1" in result.answer
    assert "Earth 1, Mars 0.1, Moon 0.01, Sol 1,000" in result.answer
    assert len(result.citations) == 4


@pytest.mark.parametrize(
    "mars_value,mars_unit",
    [(None, None), (10, "g"), (0, "kg"), (float("nan"), "kg")],
)
def test_ratio_rejects_missing_or_incompatible_body_evidence(mars_value, mars_unit):
    class IncompleteRetriever:
        def retrieve(self, question, limit):
            records = [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id="earth-mass",
                        content="Earth mass",
                        metadata={
                            "body_id": "earth",
                            "field": "mass",
                            "value": 100,
                            "unit": "kg",
                        },
                    ),
                    score=0.8,
                )
            ]
            if mars_value is not None:
                records.append(
                    RetrievedReferenceRecord(
                        document=RagDocument(
                            document_id="mars-mass",
                            content="Mars mass",
                            metadata={
                                "body_id": "mars",
                                "field": "mass",
                                "value": mars_value,
                                "unit": mars_unit,
                            },
                        ),
                        score=0.8,
                    )
                )
            return records

    result = GroundedAnswerService(IncompleteRetriever(), FakeAnswerGenerator()).answer(
        "What is Earth and Mars's mass ratio?"
    )
    assert result.insufficient_evidence
    assert "every requested body" in result.answer
