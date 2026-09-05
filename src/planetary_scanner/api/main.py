"""Read-only HTTP endpoints for curated reference data."""

from functools import lru_cache
from pathlib import Path
from typing import cast

from fastapi import FastAPI, HTTPException
from sentence_transformers import SentenceTransformer

from planetary_scanner.models.reference import (
    ReferenceDataset,
    load_validated_reference_dataset,
)
from planetary_scanner.rag.reference_answers import (
    GroundedAnswer,
    GroundedAnswerService,
    OllamaAnswerGenerator,
)
from planetary_scanner.rag.reference_index import (
    EmbeddingModel,
    load_reference_vector_index,
)
from planetary_scanner.rag.reference_retrieval import (
    ReferenceRetriever,
    RetrievedReferenceRecord,
    load_reference_records,
)

app = FastAPI(title="PlanetaryScanner")

PROJECT_ROOT = Path(__file__).parents[3]
SOURCE_REGISTRY_PATH = PROJECT_ROOT / "data" / "reference" / "sources.json"
REFERENCE_DATASET_PATHS = {
    "earth": PROJECT_ROOT / "data" / "reference" / "earth.json",
}
REFERENCE_RECORD_PATH = PROJECT_ROOT / "data" / "reference" / "earth-reference-records.jsonl"
REFERENCE_VECTOR_INDEX_PATH = PROJECT_ROOT / "data" / "reference" / "earth-reference-vectors.npz"


@app.get("/reference/bodies/{body_id}", response_model=ReferenceDataset)
def get_reference_dataset(body_id: str) -> ReferenceDataset:
    """Return the validated factual reference dataset for a supported body."""

    dataset_path = REFERENCE_DATASET_PATHS.get(body_id)
    if dataset_path is None:
        raise HTTPException(status_code=404, detail=f"Reference body not found: {body_id}")
    return load_validated_reference_dataset(dataset_path, SOURCE_REGISTRY_PATH)


@lru_cache
def get_reference_retriever() -> ReferenceRetriever:
    """Load local retrieval resources once per API process."""

    index = load_reference_vector_index(REFERENCE_VECTOR_INDEX_PATH)
    return ReferenceRetriever(
        embedding_model=cast(EmbeddingModel, SentenceTransformer(index.model_name)),
        index=index,
        documents_by_id=load_reference_records(REFERENCE_RECORD_PATH),
    )


@app.get("/retrieval/reference", response_model=list[RetrievedReferenceRecord])
def retrieve_reference_records(question: str, limit: int = 3) -> list[RetrievedReferenceRecord]:
    """Return cited reference records relevant to a natural-language question."""

    return get_reference_retriever().retrieve(question, limit)


@lru_cache
def get_grounded_answer_service() -> GroundedAnswerService:
    """Create the local answer layer over the cached reference retriever."""

    return GroundedAnswerService(get_reference_retriever(), OllamaAnswerGenerator())


@app.get("/answers/reference", response_model=GroundedAnswer)
def answer_reference_question(question: str, limit: int = 3) -> GroundedAnswer:
    """Answer only from retrieved reference evidence and return that evidence."""

    return get_grounded_answer_service().answer(question, limit)