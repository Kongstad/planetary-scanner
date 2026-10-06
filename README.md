# PlanetaryScanner

A learning project in local language models, embeddings, and retrieval-augmented generation (RAG). A fictional planetary scanner provides the interface, with real scientific data for Earth, the Moon, Mars, and the Sun.

The science computer combines a local Qwen language model with MiniLM semantic retrieval and source-backed reference records. React, TypeScript, CesiumJS, and FastAPI connect the interface to the answer pipeline.

## Learning guide

[Local LLMs, embeddings, and RAG](docs/ai-pipeline.md) explains the project in detail: how the two models work, how evidence reaches an answer, how retrieval scores should be read, and how to test the system. It includes diagrams, worked examples, and experiments you can run locally.

![PlanetaryScanner Earth view](.github/preview.png)

## Viewers

| Body  | Imagery and layers                                                          |
| ----- | --------------------------------------------------------------------------- |
| Earth | Sentinel-2, terrain, GEBCO relief, vegetation, and surface temperature      |
| Luna  | LROC imagery and LOLA relief                                                |
| Mars  | Viking MDIM, THEMIS infrared, and MOLA relief                               |
| Sol   | AIA 171 Å synoptic globe, visible light, EUV observations, and magnetograms |

Drag a globe to rotate and scroll to zoom. Solar disk images support pan, zoom, and UTC date selection. Reference panels cover physical properties, composition, environment, and interior structure.

## Run locally

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 22.12+, and npm. Internet access is needed for map services and initial model downloads.

Install dependencies from the repository root:

```bash
uv sync
npm --prefix frontend ci
```

Start the API:

```bash
uv run uvicorn planetary_scanner.api.main:app --host 127.0.0.1 --port 8000
```

In another terminal, start the website:

```bash
npm --prefix frontend run dev -- --port 5174
```

Open [localhost:5174](http://localhost:5174). The frontend proxies API requests to port 8000. Process environment variables configure the API; see [.env.example](.env.example). Stop services with Ctrl+C.

### Local answers

Install [Ollama](https://ollama.com/) and start it if needed:

```bash
ollama serve
```

Download the answer model in another terminal:

```bash
ollama pull qwen2.5:3b
```

The science computer uses Qwen2.5:3b with MiniLM reference retrieval. CPU inference is supported. The first query downloads the embedding model if it is not cached. Set `OLLAMA_BASE_URL` on the API process to use an Ollama address other than `http://127.0.0.1:11434`.

## Architecture

```mermaid
flowchart TB
    Browser["React / CesiumJS"]

    subgraph Backend["Python application"]
        API["FastAPI and answer service"]
        Retrieval["MiniLM and retrieval rules"]
        API <-->|Question / evidence| Retrieval
    end

    Browser <-->|Questions, data, and results| API
    Browser -->|Download tiles and disk images| Imagery["Scientific imagery services"]
    API <-->|Scene / observation lookup| Imagery
    API <-->|Prompt / generated JSON| Ollama["Ollama / Qwen2.5:3b"]
    Facts["Reference facts: JSON"] --> API
    Records["Vectors: NumPy .npz<br/>Evidence: JSONL"] --> Retrieval
```

Python retrieves evidence, builds the prompt, validates the response structure, and returns the answer with its evidence. Failed answer requests return through the API. Imagery uses a separate path: the API discovers scenes and observations, while the browser loads tiles and disk images directly.

Retrieval-augmented generation selects reference records before asking the model to answer. Named bodies take priority over the active tab, and comparisons can retrieve evidence for all four bodies. The model receives reference text, not imagery. The viewer and reference panels remain available when Ollama is offline.

## Data

Facts retain their source, unit, date, and scope in [data/reference](data/reference). The [source registry](data/reference/sources.json) lists the underlying publications and services.

## GitHub Pages demo

A GitHub Pages demo is planned but not yet published. It will let visitors explore the planetary viewers and reference panels, with the LLM-powered science computer disabled. Answer generation requires an active model server and compute resources beyond the static website.

This is a small portfolio project demonstrating practical work with and understanding of local LLMs, text encoders, and RAG. The full answer pipeline can be run locally using the setup above; the [learning guide](docs/ai-pipeline.md) explains its implementation.

### Static build

```bash
npm --prefix frontend run build:demo
```

This produces `frontend/dist` with bundled facts, dated solar snapshots, and Cesium assets. It needs no API or language model. Earth scene scanning and live solar date selection require the local app. The default URL prefix is `/planetary-scanner/`; set `PAGES_BASE_PATH` for another path. The build does not publish anything.

## Development

```bash
uv run pytest -q
uv run ruff check src tests scripts
uv run ruff format --check src tests scripts
npm --prefix frontend run format:check
npm --prefix frontend run lint
npm --prefix frontend run build
```

Use `uv run ruff format src tests scripts` and `npm --prefix frontend run format` to format the source.

The frontend lives in `frontend/src`; API and retrieval modules are in `src/planetary_scanner`. Tests cover reference validation, retrieval, grounding, and imagery endpoints.

## License

A project license has not been assigned. Third-party assets retain their credits and licenses.
