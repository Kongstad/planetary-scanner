import pytest

from planetary_scanner.models.reference import RetrievalEvaluationSet
from planetary_scanner.rag.retrieval_evaluation import evaluate_retrieval


def test_evaluate_retrieval_reports_recall_at_limit() -> None:
    evaluation_set = RetrievalEvaluationSet.model_validate(
        {
            "schema_version": "1.0",
            "body_id": "earth",
            "cases": [
                {
                    "case_id": "radius",
                    "question": "What is Earth's radius?",
                    "expected_document_ids": ["earth-radius"],
                },
                {
                    "case_id": "mass",
                    "question": "What is Earth's mass?",
                    "expected_document_ids": ["earth-mass"],
                },
            ],
        }
    )

    report = evaluate_retrieval(
        evaluation_set,
        lambda question, limit: (
            ["earth-radius"] if "radius" in question else ["earth-density"]
        ),
        limit=3,
    )

    assert report.passed_cases == 1
    assert report.total_cases == 2
    assert report.recall_at_limit == 0.5
    assert [result.passed for result in report.results] == [True, False]


def test_evaluate_retrieval_rejects_invalid_limit() -> None:
    evaluation_set = RetrievalEvaluationSet.model_validate(
        {"schema_version": "1.0", "body_id": "earth", "cases": []}
    )

    with pytest.raises(ValueError, match="Evaluation limit must be at least 1"):
        evaluate_retrieval(evaluation_set, lambda question, limit: [], limit=0)
