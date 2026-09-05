"""Read-only HTTP endpoints for curated reference data."""

from pathlib import Path

from fastapi import FastAPI, HTTPException

from planetary_scanner.models.reference import (
    ReferenceDataset,
    load_validated_reference_dataset,
)

app = FastAPI(title="PlanetaryScanner")

PROJECT_ROOT = Path(__file__).parents[3]
SOURCE_REGISTRY_PATH = PROJECT_ROOT / "data" / "reference" / "sources.json"
REFERENCE_DATASET_PATHS = {
    "earth": PROJECT_ROOT / "data" / "reference" / "earth.json",
}


@app.get("/reference/bodies/{body_id}", response_model=ReferenceDataset)
def get_reference_dataset(body_id: str) -> ReferenceDataset:
    """Return the validated factual reference dataset for a supported body."""

    dataset_path = REFERENCE_DATASET_PATHS.get(body_id)
    if dataset_path is None:
        raise HTTPException(status_code=404, detail=f"Reference body not found: {body_id}")
    return load_validated_reference_dataset(dataset_path, SOURCE_REGISTRY_PATH)