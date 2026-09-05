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
    assert "Do not use outside knowledge." in prompt


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
            return GeneratedAnswer(answer="insufficient_evidence", insufficient_evidence=True)

    answer = GroundedAnswerService(FakeRetriever(), PlaceholderAnswerGenerator()).answer(
        "What is Earth's mean radius?", limit=1
    )

    assert answer.insufficient_evidence
    assert answer.answer == "The retrieved reference records do not provide enough evidence to answer this question."