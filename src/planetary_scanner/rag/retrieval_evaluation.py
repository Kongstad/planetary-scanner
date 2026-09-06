"""Repeatable evaluation for reference-record retrieval."""

from collections.abc import Callable

from pydantic import BaseModel

from planetary_scanner.models.reference import RetrievalEvaluationSet

RetrieveDocumentIds = Callable[[str, int], list[str]]


class RetrievalEvaluationResult(BaseModel):
    """The outcome of one retrieval expectation at a chosen result limit."""

    case_id: str
    expected_document_ids: list[str]
    retrieved_document_ids: list[str]
    passed: bool


class RetrievalEvaluationReport(BaseModel):
    """Aggregate recall outcome for a versioned evaluation set."""

    limit: int
    total_cases: int
    passed_cases: int
    recall_at_limit: float
    results: list[RetrievalEvaluationResult]


def evaluate_retrieval(
    evaluation_set: RetrievalEvaluationSet,
    retrieve_document_ids: RetrieveDocumentIds,
    limit: int,
) -> RetrievalEvaluationReport:
    """Measure whether each expected record appears among the top retrieval results."""

    if limit < 1:
        raise ValueError("Evaluation limit must be at least 1")
    results = []
    for case in evaluation_set.cases:
        retrieved_document_ids = retrieve_document_ids(case.question, limit)
        results.append(
            RetrievalEvaluationResult(
            case_id=case.case_id,
            expected_document_ids=case.expected_document_ids,
            retrieved_document_ids=retrieved_document_ids,
            passed=bool(set(case.expected_document_ids).intersection(retrieved_document_ids)),
            )
        )
    passed_cases = sum(result.passed for result in results)
    return RetrievalEvaluationReport(
        limit=limit,
        total_cases=len(results),
        passed_cases=passed_cases,
        recall_at_limit=passed_cases / len(results) if results else 0.0,
        results=results,
    )