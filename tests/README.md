# Tests

Run `uv run pytest -q` from the repository root.

`unit/` covers reference validation, catalog imports, indexing, retrieval, answer grounding, evaluation, and imagery adapters. `integration/` checks the FastAPI endpoints. External services are mocked. The suite requires no running API, model server, or database.

Run `uv run python scripts/evaluate_reference_retrieval.py` to test the 52 saved retrieval cases across all six collections with the real MiniLM encoder. This separate check requires model files, but does not call Ollama. It measures whether at least one expected record appears for each question, not the accuracy of a generated answer.
