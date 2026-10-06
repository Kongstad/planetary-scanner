"""Rebuild retrieval records and vectors from the validated reference datasets."""

import argparse
import json
from pathlib import Path

from sentence_transformers import SentenceTransformer

from planetary_scanner.models.corpus import COLLECTIONS, build_collection_documents
from planetary_scanner.models.reference import write_reference_rag_documents
from planetary_scanner.rag.reference_index import (
    DEFAULT_EMBEDDING_MODEL,
    build_reference_vector_index,
    write_reference_vector_index,
)

ROOT = Path(__file__).resolve().parents[1]


def rebuild(body_ids: list[str], model_name: str) -> None:
    model = SentenceTransformer(model_name)
    reference = ROOT / "data/reference"
    for body_id in body_ids:
        documents = build_collection_documents(reference, body_id)
        index = build_reference_vector_index(documents, model, model_name)
        write_reference_rag_documents(
            reference / f"{body_id}-reference-records.jsonl", documents
        )
        write_reference_vector_index(
            reference / f"{body_id}-reference-vectors.npz", index
        )
        print(f"Rebuilt {body_id}: {len(documents)} records", flush=True)
    manifest_path = reference / "corpus/manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        manifest["indexed_record_counts"] = {
            collection: sum(
                bool(line.strip())
                for line in (reference / f"{collection}-reference-records.jsonl")
                .read_text()
                .splitlines()
            )
            for collection in COLLECTIONS
        }
        manifest["total_indexed_records"] = sum(
            manifest["indexed_record_counts"].values()
        )
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--body", action="append", choices=COLLECTIONS)
    parser.add_argument("--model", default=DEFAULT_EMBEDDING_MODEL)
    args = parser.parse_args()
    rebuild(args.body or list(COLLECTIONS), args.model)
