# PlanetaryScanner

[![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-local-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![CesiumJS](https://img.shields.io/badge/CesiumJS-1.145-6CADDF?logo=cesium&logoColor=white)](https://cesium.com/platform/cesiumjs/)

PlanetaryScanner is a local-first planetary science console for exploring Earth and Mars. It combines a CesiumJS viewer, source-backed reference facts, remote-sensing display layers, and a local grounded-answering workflow.

- **Earth:** interactive imagery, terrain, biosphere, and thermal display layers.
- **Mars:** a separate Mars ellipsoid and Viking global mosaic with source-backed panels for orbital, environmental, surface, geology, and interior reference data.
- **Science Computer:** local Qwen and MiniLM components for grounded answers from curated reference records. Raw imagery is never supplied to the language model.

Factual records retain their value, unit, scope, date, source locator, and source URL. Fictional Dilithium scenarios are intentionally isolated from reference data and grounded answers.

## Run locally

**Requirements:** Python 3.12+, [uv](https://docs.astral.sh/uv/), and Node.js. [Ollama](https://ollama.com/) is optional unless you want grounded Science Computer answers.

1. Install project dependencies:

   ```powershell
   uv sync
   Set-Location frontend
   npm ci
   Set-Location ..
   ```

2. Start the local Reference API:

   ```powershell
   uv run uvicorn planetary_scanner.api.main:app --host 127.0.0.1 --port 8000
   ```

3. In a second terminal, start the frontend:

   ```powershell
   Set-Location frontend
   npm run dev
   ```

   Open `http://127.0.0.1:5173`.

4. Optional: enable grounded answers by installing and running the local model:

   ```powershell
   ollama pull qwen2.5:3b
   ollama serve
   ```

   If Ollama is unavailable, the viewer and reference panels still work; the Science Computer reports its unavailable state.

## Checks

```powershell
uv run pytest tests\unit\test_reference_fact.py tests\integration\test_reference_api.py
uv run ruff check src tests

Set-Location frontend
npm run lint
npm run build
```

## License

License selection is pending while the repository remains private.
