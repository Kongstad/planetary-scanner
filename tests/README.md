# Tests

Run `uv run pytest -q` from the repository root.

`unit/` covers reference validation, indexing, retrieval, answer grounding, evaluation, and imagery adapters. `integration/` checks the FastAPI endpoints. External services are mocked; the suite requires no running API, model server, or database.
