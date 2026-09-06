"""Repeatable evaluation for evidence-grounded reference answers."""

from collections.abc import Callable

from pydantic import BaseModel, Field

from planetary_scanner.rag.reference_answers import GroundedAnswer

AnswerQuestion = Callable[[str, int], GroundedAnswer]


class AnswerEvaluationCase(BaseModel):
    """Expected evidence status, citations, and answer terms for one question."""

    case_id: str
    question: str
    expected_insufficient_evidence: bool
    required_citation_ids: list[str] = Field(min_length=1)
    required_answer_terms: list[str] = Field(min_length=1)


class AnswerEvaluationSet(BaseModel):
    """Versioned answer-quality expectations for one celestial body."""

    schema_version: str
    body_id: str
    cases: list[AnswerEvaluationCase]


class AnswerEvaluationResult(BaseModel):
    """The outcome of one grounded-answer expectation."""

    case_id: str
    passed: bool
    citations_present: bool
    evidence_status_matches: bool
    answer_terms_present: bool


class AnswerEvaluationReport(BaseModel):
    """Aggregate result for a grounded-answer evaluation set."""

    limit: int
    total_cases: int
    passed_cases: int
    results: list[AnswerEvaluationResult]


def load_answer_evaluation_set(evaluation_path: str) -> AnswerEvaluationSet:
    """Load a versioned grounded-answer evaluation set."""

    with open(evaluation_path, encoding="utf-8") as evaluation_file:
        return AnswerEvaluationSet.model_validate_json(evaluation_file.read())


def evaluate_grounded_answers(
    evaluation_set: AnswerEvaluationSet, answer_question: AnswerQuestion, limit: int
) -> AnswerEvaluationReport:
    """Check answer evidence status, citations, and required terms."""

    if limit < 1:
        raise ValueError("Evaluation limit must be at least 1")
    results = []
    for case in evaluation_set.cases:
        answer = answer_question(case.question, limit)
        citation_ids = {citation.document.document_id for citation in answer.citations}
        citations_present = set(case.required_citation_ids).issubset(citation_ids)
        evidence_status_matches = answer.insufficient_evidence == case.expected_insufficient_evidence
        answer_lower = answer.answer.lower()
        answer_terms_present = all(term.lower() in answer_lower for term in case.required_answer_terms)
        results.append(
            AnswerEvaluationResult(
                case_id=case.case_id,
                passed=citations_present and evidence_status_matches and answer_terms_present,
                citations_present=citations_present,
                evidence_status_matches=evidence_status_matches,
                answer_terms_present=answer_terms_present,
            )
        )
    passed_cases = sum(result.passed for result in results)
    return AnswerEvaluationReport(
        limit=limit,
        total_cases=len(results),
        passed_cases=passed_cases,
        results=results,
    )