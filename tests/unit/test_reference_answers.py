from collections.abc import Sequence

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
        return GeneratedAnswer(answer="Earth's mean radius is 6371.0084 km.", insufficient_evidence=False)


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
            return GeneratedAnswer(answer="Insufficient evidence", insufficient_evidence=True)

    answer = GroundedAnswerService(FakeRetriever(), PlaceholderAnswerGenerator()).answer(
        "What is Earth's mean radius?", limit=1
    )

    assert answer.insufficient_evidence
    assert answer.answer == "The retrieved reference records do not provide enough evidence to answer this question."


def test_lunar_composition_answer_preserves_all_values_and_model_scope() -> None:
    fields = {
        "silica": 46.8, "magnesia": 36, "iron_oxide": 9.24,
        "alumina": 3.87, "lime": 3.06, "titania": 0.18,
    }

    class CompositionRetriever:
        def retrieve(self, question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
            return [RetrievedReferenceRecord(document=RagDocument(
                document_id=f"luna-{compound}", content=f"Luna {compound} {value} wt%",
                metadata={"body_id": "luna", "field": f"bulk_silicate_{compound}_fraction",
                          "value": value, "unit": "wt%",
                          "scope": "bulk_silicate_moon_warren_2005_model_oxide_mass_percent_core_excluded"},
            ), score=1.0) for compound, value in fields.items()]

    class IncompleteGenerator:
        def generate(self, prompt: str) -> GeneratedAnswer:
            return GeneratedAnswer(answer="The Moon contains 46.8% silica.", insufficient_evidence=False)

    result = GroundedAnswerService(CompositionRetriever(), IncompleteGenerator()).answer("What is the Moon made of?")
    assert "model estimates" in result.answer
    assert "mantle-and-crust" in result.answer
    assert "excluding the metallic core" in result.answer
    assert all(f"{value:g} wt%" in result.answer for value in fields.values())
    assert len(result.citations) == 6
    assert not result.insufficient_evidence
