from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.answer_evaluation import (
    AnswerEvaluationSet,
    evaluate_grounded_answers,
)
from planetary_scanner.rag.reference_answers import GroundedAnswer
from planetary_scanner.rag.reference_retrieval import RetrievedReferenceRecord


def test_evaluate_grounded_answers_checks_citations_status_and_terms() -> None:
    evaluation_set = AnswerEvaluationSet.model_validate(
        {
            "schema_version": "1.0",
            "body_id": "earth",
            "cases": [
                {
                    "case_id": "radius",
                    "question": "What is Earth's mean radius?",
                    "expected_insufficient_evidence": False,
                    "required_citation_ids": ["earth-radius"],
                    "required_answer_terms": ["6371", "km"],
                }
            ],
        }
    )
    citation = RetrievedReferenceRecord(
        document=RagDocument(document_id="earth-radius", content="Earth radius", metadata={}),
        score=0.9,
    )

    report = evaluate_grounded_answers(
        evaluation_set,
        lambda question, limit: GroundedAnswer(
            answer="Earth's mean radius is 6371 km.",
            insufficient_evidence=False,
            citations=[citation],
        ),
        limit=3,
    )

    assert report.passed_cases == 1
    assert report.results[0].passed


def test_evaluate_grounded_answers_reports_wrong_citation() -> None:
    evaluation_set = AnswerEvaluationSet.model_validate(
        {
            "schema_version": "1.0",
            "body_id": "earth",
            "cases": [
                {
                    "case_id": "radius",
                    "question": "What is Earth's mean radius?",
                    "expected_insufficient_evidence": False,
                    "required_citation_ids": ["earth-radius"],
                    "required_answer_terms": ["6371", "km"],
                }
            ],
        }
    )

    report = evaluate_grounded_answers(
        evaluation_set,
        lambda question, limit: GroundedAnswer(
            answer="Earth's mean radius is 6371 km.",
            insufficient_evidence=False,
            citations=[],
        ),
        limit=1,
    )

    assert report.passed_cases == 0
    assert not report.results[0].citations_present