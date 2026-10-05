# PlanetaryScanner

[![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-local-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![CesiumJS](https://img.shields.io/badge/CesiumJS-1.145-6CADDF?logo=cesium&logoColor=white)](https://cesium.com/platform/cesiumjs/)

PlanetaryScanner is a local-first planetary science console for exploring Earth, Mars, and the Moon. It combines a CesiumJS viewer, source-backed reference facts, remote-sensing display layers, and a local grounded-answering workflow.

- **Earth:** interactive imagery, terrain, biosphere, and thermal display layers.
- **Mars:** a separate Mars ellipsoid and Viking global mosaic with source-backed panels for orbital, environmental, surface, geology, and interior reference data.
- **Moon / Luna:** a lunar ellipsoid with LROC imagery and LOLA relief, sourced lunar facts, and model-based bulk silicate composition bars.
- **Science Computer:** local Qwen and MiniLM components answer questions about all three bodies on CPU or GPU. Explicit body names override the selected tab. “Compare all three bodies by radius” retrieves evidence from Earth, Mars, and Luna. Questions without a body name use the selected tab. Lunar geochemistry retains its oxide-percent, mantle-and-crust model scope. Raw imagery is never supplied to the language model.

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

   To use a different Ollama port, set `OLLAMA_HOST=127.0.0.1:11435` when serving and pulling the model. Start the Reference API with `OLLAMA_BASE_URL=http://127.0.0.1:11435`. These variables must be set in the process environment; the API does not automatically load `.env`.

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
