"""Read-only HTTP endpoints for curated reference data."""

from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, cast

from fastapi import FastAPI, HTTPException, Query, Response
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
from planetary_scanner.api.solar_imagery import (
    SolarImageryUnavailableError,
    SolarLayer,
    SolarObservation,
    find_solar_observation,
)
from planetary_scanner.models.corpus import COLLECTIONS
from planetary_scanner.models.reference import (
    ReferenceDataset,
    load_validated_reference_dataset,
)
from planetary_scanner.rag.corpus_routing import EntityLookup, shared_collection
from planetary_scanner.rag.reference_answers import (
    GroundedAnswer,
    GroundedAnswerService,
    OllamaAnswerGenerator,
    comparison_clarification,
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
    question_intent_fields,
)

app = FastAPI(title="PlanetaryScanner")

PROJECT_ROOT = Path(__file__).parents[3]
SOURCE_REGISTRY_PATH = PROJECT_ROOT / "data" / "reference" / "sources.json"
REFERENCE_DATASET_PATHS = {
    "sol": PROJECT_ROOT / "data" / "reference" / "sol.json",
    "luna": PROJECT_ROOT / "data" / "reference" / "luna.json",
    "earth": PROJECT_ROOT / "data" / "reference" / "earth.json",
    "mars": PROJECT_ROOT / "data" / "reference" / "mars.json",
    "solar-system": PROJECT_ROOT / "data" / "reference" / "solar-system.json",
}
AnswerableBodyId = Literal["earth", "mars", "luna", "sol"]
ANSWERABLE_BODY_IDS = frozenset({"earth", "mars", "luna", "sol"})
REFERENCE_RECORD_PATHS = {
    body_id: PROJECT_ROOT / "data" / "reference" / f"{body_id}-reference-records.jsonl"
    for body_id in COLLECTIONS
}
REFERENCE_VECTOR_INDEX_PATHS = {
    body_id: PROJECT_ROOT / "data" / "reference" / f"{body_id}-reference-vectors.npz"
    for body_id in COLLECTIONS
}


class ScienceComputerStatus(BaseModel):
    """Availability of the local Ollama dependency for grounded answers."""

    online: bool
    model: str
    reference_records: int


@app.get("/reference/bodies/{body_id}", response_model=ReferenceDataset)
def get_reference_dataset(body_id: str) -> ReferenceDataset:
    """Return the validated factual reference dataset tagged for one supported body."""

    dataset_path = REFERENCE_DATASET_PATHS.get(body_id)
    if dataset_path is None:
        raise HTTPException(
            status_code=404, detail=f"Reference body not found: {body_id}"
        )
    return load_validated_reference_dataset(dataset_path, SOURCE_REGISTRY_PATH)


@lru_cache
def get_embedding_model(model_name: str) -> EmbeddingModel:
    """Load each embedding model once per API process."""

    from sentence_transformers import SentenceTransformer

    return cast(EmbeddingModel, SentenceTransformer(model_name))


@lru_cache
def get_reference_retriever(body_id: str) -> ReferenceRetriever:
    """Load local retrieval resources for one answerable body once per API process."""

    index = load_reference_vector_index(REFERENCE_VECTOR_INDEX_PATHS[body_id])
    return ReferenceRetriever(
        embedding_model=get_embedding_model(index.model_name),
        index=index,
        documents_by_id=load_reference_records(REFERENCE_RECORD_PATHS[body_id]),
        body_level_intents=body_id in ANSWERABLE_BODY_IDS,
    )


@lru_cache
def get_catalog_lookup() -> EntityLookup:
    return EntityLookup(
        document
        for path in REFERENCE_RECORD_PATHS.values()
        for document in load_reference_records(path).values()
    )


def total_reference_records() -> int:
    snapshot = tuple(
        (str(path), path.stat().st_mtime_ns, path.stat().st_size)
        for path in REFERENCE_RECORD_PATHS.values()
    )
    return _count_reference_snapshot(snapshot)


@lru_cache(maxsize=1)
def _count_reference_snapshot(snapshot: tuple[tuple[str, int, int], ...]) -> int:
    return sum(len(load_reference_records(Path(path))) for path, _, _ in snapshot)


def reference_collection(question: str, selected: str) -> str | None:
    shared = shared_collection(question)
    if shared is not None:
        return shared
    named = question_body_ids(question)
    matches = get_catalog_lookup().match(question)
    if matches:
        candidates = {str(document.metadata["body_id"]) for document in matches}
        preferred = named[0] if named else selected
        if preferred in candidates:
            return preferred
        if len(candidates) == 1:
            return candidates.pop()
    if is_cross_body_question(question):
        return None
    return named[0] if named else selected


@app.get("/retrieval/reference", response_model=list[RetrievedReferenceRecord])
def retrieve_reference_records(
    question: str,
    body_id: AnswerableBodyId = "earth",
    limit: Annotated[int, Query(ge=1, le=12)] = 3,
) -> list[RetrievedReferenceRecord]:
    """Return evidence for the named bodies, defaulting to the selected body."""

    target_body = reference_collection(question, body_id)
    if target_body is None:
        return get_cross_body_reference_retriever().retrieve(question, limit)
    return get_reference_retriever(target_body).retrieve(question, limit)


@lru_cache
def get_cross_body_reference_retriever() -> CrossBodyReferenceRetriever:
    """Build the four-body retriever from isolated per-body indexes."""

    return CrossBodyReferenceRetriever(
        {
            body_id: get_reference_retriever(cast(AnswerableBodyId, body_id))
            for body_id in ANSWERABLE_BODY_IDS
        }
    )


@lru_cache
def get_grounded_answer_service(body_id: str) -> GroundedAnswerService:
    """Create the local answer layer for one body over its cached retriever."""

    return GroundedAnswerService(
        get_reference_retriever(body_id), OllamaAnswerGenerator()
    )


@lru_cache
def get_cross_body_grounded_answer_service() -> GroundedAnswerService:
    """Create the answer layer for evidence-backed multi-body comparisons."""

    return GroundedAnswerService(
        get_cross_body_reference_retriever(), OllamaAnswerGenerator()
    )


@app.get("/answers/reference", response_model=GroundedAnswer)
def answer_reference_question(
    question: str,
    body_id: AnswerableBodyId = "earth",
    limit: Annotated[int, Query(ge=1, le=12)] = 3,
    previous_question: str | None = None,
) -> GroundedAnswer:
    """Answer about Earth, Mars, Luna, and Sol from selected or explicitly named bodies."""

    if (
        previous_question
        and comparison_clarification(previous_question)
        and not question_body_ids(question)
        and len(question_intent_fields(question)) == 1
        and len(question.split()) <= 6
    ):
        bodies = question_body_ids(previous_question)
        if bodies:
            question = f"What is the {question.strip().rstrip('?')} ratio between {' and '.join(bodies)}?"
    clarification = comparison_clarification(question)
    if clarification is not None:
        return clarification
    target_body = reference_collection(question, body_id)
    if target_body is None:
        return get_cross_body_grounded_answer_service().answer(question, limit)
    return get_grounded_answer_service(target_body).answer(question, limit)


@app.get("/health/science-computer", response_model=ScienceComputerStatus)
def get_science_computer_status(response: Response) -> ScienceComputerStatus:
    """Report whether the configured local Ollama answer model is ready."""
    response.headers["Cache-Control"] = "no-store"
    return ScienceComputerStatus(
        online=is_ollama_model_available(),
        model="qwen2.5:3b",
        reference_records=total_reference_records(),
    )


@app.get("/imagery/sol/observation", response_model=SolarObservation)
def get_solar_observation(
    layer: SolarLayer = "euv", date: datetime | None = None
) -> SolarObservation:
    """Return the actual archive timestamp nearest the selected date, defaulting to now."""
    requested_date = date or datetime.now(UTC)
    if requested_date.tzinfo is None:
        requested_date = requested_date.replace(tzinfo=UTC)
    utc_minute = requested_date.astimezone(UTC).replace(second=0, microsecond=0)
    try:
        return find_solar_observation(layer, utc_minute.strftime("%Y-%m-%dT%H:%M:%SZ"))
    except SolarImageryUnavailableError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


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
        raise HTTPException(
            status_code=422, detail="Viewer extent must have positive area"
        )
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
        raise HTTPException(
            status_code=422, detail="Viewer extent must have positive area"
        )
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
        raise HTTPException(
            status_code=422, detail="Viewer extent must have positive area"
        )
    try:
        return list(
            find_modis_thermal_scenes(
                round(west, 1), round(south, 1), round(east, 1), round(north, 1), limit
            )
        )
    except SentinelImageryUnavailableError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
