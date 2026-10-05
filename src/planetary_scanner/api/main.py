"""Read-only HTTP endpoints for curated reference data."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, cast

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from planetary_scanner.api.sentinel_imagery import (
    MAX_SCENES,
    CopernicusDemScene,
    ModisThermalScene,
    Sentinel2Scene,
    SentinelImageryUnavailableError,
    find_copernicus_dem_scenes,
    find_modis_thermal_scenes,
    find_sentinel_2_scenes,
)
from planetary_scanner.models.reference import (
    ReferenceDataset,
    load_validated_reference_dataset,
)
from planetary_scanner.rag.reference_answers import (
    GroundedAnswer,
    GroundedAnswerService,
    OllamaAnswerGenerator,
    is_ollama_model_available,
)
from planetary_scanner.rag.reference_index import (
    EmbeddingModel,
    load_reference_vector_index,
)
from planetary_scanner.rag.reference_retrieval import (
    CrossBodyReferenceRetriever,
    ReferenceRetriever,
    RetrievedReferenceRecord,
    is_cross_body_question,
    load_reference_records,
    question_body_ids,
)

app = FastAPI(title="PlanetaryScanner")

PROJECT_ROOT = Path(__file__).parents[3]
SOURCE_REGISTRY_PATH = PROJECT_ROOT / "data" / "reference" / "sources.json"
REFERENCE_DATASET_PATHS = {
    "luna": PROJECT_ROOT / "data" / "reference" / "luna.json",
    "earth": PROJECT_ROOT / "data" / "reference" / "earth.json",
    "mars": PROJECT_ROOT / "data" / "reference" / "mars.json",
    "solar-system": PROJECT_ROOT / "data" / "reference" / "solar-system.json",
}
AnswerableBodyId = Literal["earth", "mars", "luna"]
ANSWERABLE_BODY_IDS = frozenset({"earth", "mars", "luna"})
REFERENCE_RECORD_PATHS = {
    body_id: PROJECT_ROOT / "data" / "reference" / f"{body_id}-reference-records.jsonl"
    for body_id in ANSWERABLE_BODY_IDS
}
REFERENCE_VECTOR_INDEX_PATHS = {
    body_id: PROJECT_ROOT / "data" / "reference" / f"{body_id}-reference-vectors.npz"
    for body_id in ANSWERABLE_BODY_IDS
}


class ScienceComputerStatus(BaseModel):
    """Availability of the local Ollama dependency for grounded answers."""

    online: bool
    model: str


@app.get("/reference/bodies/{body_id}", response_model=ReferenceDataset)
def get_reference_dataset(body_id: str) -> ReferenceDataset:
    """Return the validated factual reference dataset tagged for one supported body."""

    dataset_path = REFERENCE_DATASET_PATHS.get(body_id)
    if dataset_path is None:
        raise HTTPException(status_code=404, detail=f"Reference body not found: {body_id}")
    return load_validated_reference_dataset(dataset_path, SOURCE_REGISTRY_PATH)


@lru_cache
def get_embedding_model(model_name: str) -> EmbeddingModel:
    """Load each local embedding model once, even when searching both bodies."""

    from sentence_transformers import SentenceTransformer

    return cast(EmbeddingModel, SentenceTransformer(model_name))


@lru_cache
def get_reference_retriever(body_id: AnswerableBodyId) -> ReferenceRetriever:
    """Load local retrieval resources for one answerable body once per API process."""

    index = load_reference_vector_index(REFERENCE_VECTOR_INDEX_PATHS[body_id])
    return ReferenceRetriever(
        embedding_model=get_embedding_model(index.model_name),
        index=index,
        documents_by_id=load_reference_records(REFERENCE_RECORD_PATHS[body_id]),
    )


@app.get("/retrieval/reference", response_model=list[RetrievedReferenceRecord])
def retrieve_reference_records(
    question: str,
    body_id: AnswerableBodyId = "earth",
    limit: int = 3,
) -> list[RetrievedReferenceRecord]:
    """Return evidence for the named bodies, defaulting to the selected body."""

    if is_cross_body_question(question):
        return get_cross_body_reference_retriever().retrieve(question, limit)
    named_bodies = question_body_ids(question)
    target_body = cast(AnswerableBodyId, named_bodies[0]) if named_bodies else body_id
    return get_reference_retriever(target_body).retrieve(question, limit)


@lru_cache
def get_cross_body_reference_retriever() -> CrossBodyReferenceRetriever:
    """Build the Earth/Mars/Moon retriever from isolated per-body indexes."""

    return CrossBodyReferenceRetriever(
        {body_id: get_reference_retriever(cast(AnswerableBodyId, body_id)) for body_id in ANSWERABLE_BODY_IDS}
    )


@lru_cache
def get_grounded_answer_service(body_id: AnswerableBodyId) -> GroundedAnswerService:
    """Create the local answer layer for one body over its cached retriever."""

    return GroundedAnswerService(get_reference_retriever(body_id), OllamaAnswerGenerator())


@lru_cache
def get_cross_body_grounded_answer_service() -> GroundedAnswerService:
    """Create the answer layer for evidence-backed multi-body comparisons."""

    return GroundedAnswerService(get_cross_body_reference_retriever(), OllamaAnswerGenerator())


@app.get("/answers/reference", response_model=GroundedAnswer)
def answer_reference_question(
    question: str,
    body_id: AnswerableBodyId = "earth",
    limit: int = 3,
) -> GroundedAnswer:
    """Answer about Earth, Mars, and Luna from selected or explicitly named bodies."""

    if is_cross_body_question(question):
        return get_cross_body_grounded_answer_service().answer(question, limit)
    named_bodies = question_body_ids(question)
    target_body = cast(AnswerableBodyId, named_bodies[0]) if named_bodies else body_id
    return get_grounded_answer_service(target_body).answer(question, limit)


@app.get("/health/science-computer", response_model=ScienceComputerStatus)
def get_science_computer_status() -> ScienceComputerStatus:
    """Report whether the configured local Ollama answer model is ready."""
    return ScienceComputerStatus(
        online=is_ollama_model_available(),
        model="qwen2.5:3b",
    )


@app.get("/imagery/sentinel-2/scenes", response_model=list[Sentinel2Scene])
def get_sentinel_2_scenes(
    west: Annotated[float, Query(ge=-180, le=180)],
    south: Annotated[float, Query(ge=-90, le=90)],
    east: Annotated[float, Query(ge=-180, le=180)],
    north: Annotated[float, Query(ge=-90, le=90)],
    maximum_cloud_cover: Annotated[float, Query(ge=0, le=100)] = 20,
    limit: Annotated[int, Query(ge=1, le=MAX_SCENES)] = MAX_SCENES,
    mode: Literal["imagery", "biosphere"] = "imagery",
) -> list[Sentinel2Scene]:
    """Return latest usable display scenes for one non-wrapping viewer extent."""
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="Viewer extent must have positive area")
    try:
        return list(
            find_sentinel_2_scenes(
                round(west, 1),
                round(south, 1),
                round(east, 1),
                round(north, 1),
                maximum_cloud_cover,
                limit,
                mode,
            )
        )
    except SentinelImageryUnavailableError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/imagery/copernicus-dem/scenes", response_model=list[CopernicusDemScene])
def get_copernicus_dem_scenes(
    west: Annotated[float, Query(ge=-180, le=180)],
    south: Annotated[float, Query(ge=-90, le=90)],
    east: Annotated[float, Query(ge=-180, le=180)],
    north: Annotated[float, Query(ge=-90, le=90)],
    limit: Annotated[int, Query(ge=1, le=MAX_SCENES)] = MAX_SCENES,
) -> list[CopernicusDemScene]:
    """Return display-only Copernicus DEM tiles for one non-wrapping viewer extent."""
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="Viewer extent must have positive area")
    try:
        return list(
            find_copernicus_dem_scenes(
                round(west, 1), round(south, 1), round(east, 1), round(north, 1), limit
            )
        )
    except SentinelImageryUnavailableError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/imagery/modis-lst/scenes", response_model=list[ModisThermalScene])
def get_modis_thermal_scenes(
    west: Annotated[float, Query(ge=-180, le=180)],
    south: Annotated[float, Query(ge=-90, le=90)],
    east: Annotated[float, Query(ge=-180, le=180)],
    north: Annotated[float, Query(ge=-90, le=90)],
    limit: Annotated[int, Query(ge=1, le=MAX_SCENES)] = MAX_SCENES,
) -> list[ModisThermalScene]:
    """Return display-only 8-day daytime MODIS LST tiles for the viewer extent."""
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="Viewer extent must have positive area")
    try:
        return list(
            find_modis_thermal_scenes(
                round(west, 1), round(south, 1), round(east, 1), round(north, 1), limit
            )
        )
    except SentinelImageryUnavailableError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
