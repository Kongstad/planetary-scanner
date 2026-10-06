"""Evaluate all saved retrieval questions with the configured text encoder."""

import json

from planetary_scanner.api.main import PROJECT_ROOT, get_reference_retriever
from planetary_scanner.models.corpus import COLLECTIONS, build_collection_documents
from planetary_scanner.models.reference import load_validated_retrieval_evaluation_set
from planetary_scanner.rag.retrieval_evaluation import evaluate_retrieval


def main() -> None:
    failures = 0
    for collection in COLLECTIONS:
        documents = build_collection_documents(
            PROJECT_ROOT / "data/reference", collection
        )
        cases = load_validated_retrieval_evaluation_set(
            PROJECT_ROOT / f"data/evaluation/{collection}-reference-retrieval.json",
            documents,
        )
        retriever = get_reference_retriever(collection)
        report = evaluate_retrieval(
            cases,
            lambda question, limit, retriever=retriever: [
                record.document.document_id
                for record in retriever.retrieve(question, limit)
            ],
            3,
        )
        failures += report.total_cases - report.passed_cases
        print(
            json.dumps({"collection": collection, **report.model_dump(mode="json")}),
            flush=True,
        )
    if failures:
        raise SystemExit(f"{failures} retrieval cases failed")


if __name__ == "__main__":
    main()
