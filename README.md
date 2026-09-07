# PlanetaryScanner

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)

Local-first planetary science console and cited RAG learning project. PlanetaryScanner is developing structured, source-cited planetary facts, an interactive spatial viewer, and a grounded Science Computer.

## Status

Prototype. The current React client is a static Earth reference console. The viewer uses a temporary Earth image while CesiumJS integration, the local API, and retrieval pipeline are developed.

## Scientific Integrity

Factual panel values will be stored as versioned reference facts with a value, unit, scope, date, and source locator. Spatial measurements will remain separate scan records. The Dilithium scenario and Prime Directive content are explicitly fictional and excluded from factual retrieval.

## Local Grounded RAG

The Science Computer uses retrieval-augmented generation (RAG) to answer from local,
source-backed reference records. The language model is not asked to supply citations or
choose scientific evidence; those remain application-controlled.

```mermaid
flowchart LR
  Facts["Curated reference facts\nearth.json + sources.json"] --> Records["Cited reference records\nearth-reference-records.jsonl"]
  Records --> Index["Embedding model\nall-MiniLM-L6-v2"]
  Index --> Vectors["Local vector index\nearth-reference-vectors.npz"]
  Question["User question"] --> QueryEmbedding["Embed question"]
  QueryEmbedding --> Retrieval["Hybrid retrieval\nsemantic similarity + exact terms"]
  Vectors --> Retrieval
  Records --> Retrieval
  Retrieval --> Evidence["Top cited records"]
  Evidence --> Ollama["Local LLM\nqwen2.5:3b"]
  Question --> Ollama
  Ollama --> Answer["Grounded answer"]
  Evidence --> Citations["Application-controlled citations"]
  Answer --> Response["Answer + cited evidence"]
  Citations --> Response
```

The system works in these steps:

1. Curated facts are validated against the source registry, then rendered into readable
	JSON Lines records. Each record retains its value, unit, scope, date, source locator,
	and URL.
2. The embedding model converts each record into a 384-number vector once. The derived
	vectors and their record IDs are saved locally in the `.npz` index.
3. A user question is embedded by the same model. Exact cosine search ranks semantically
	relevant records, with a small exact-token boost for scientific terms such as `CO2`
	and `J2000`.
4. The top records become the only evidence supplied to Ollama. The local LLM writes a
	short JSON answer or states that the evidence is insufficient.
5. The application attaches the original retrieved records as citations, so citations
	cannot be invented by the LLM.

Two versioned evaluation sets protect the pipeline:

- Retrieval evaluation checks whether the intended record occurs in the top $k$ results.
  The current Earth baseline is `Recall@3: 5/5`.
- Grounded-answer evaluation checks required citations, sufficient/insufficient-evidence
  status, and essential answer terms such as values and units. The current baseline is
  `3/3` local-model cases.

The local endpoints are `GET /retrieval/reference` for evidence inspection and
`GET /answers/reference` for grounded answers with citations.

## Reference Database

The local file-backed corpus remains the active retrieval baseline. PostgreSQL with
pgvector is provided as the scalable reference-record store for automated ingestion and
metadata-aware vector retrieval. Start it with:

```powershell
Copy-Item .env.example .env
docker compose up -d reference-db
docker compose ps
```

The idempotent schema at `database/init/001_reference_records.sql` creates the
provenance-preserving `reference_records` table, relational metadata indexes, and a
384-dimensional cosine-similarity vector index. The first importer will migrate the
validated Earth records and compare PostgreSQL retrieval against the existing JSONL/NPZ
evaluation baseline before the API switches storage backends.

## Local Development

The frontend is currently the runnable component:

```powershell
cd frontend
npm install
npm run dev
```

Run quality checks with:

```powershell
npm run build
npm run lint
```

## Roadmap

1. Versioned Earth reference facts with provenance.
2. FastAPI contract for facts, citations, and viewer directives.
3. CesiumJS Earth viewer.
4. Local RAG pipeline with optional personal API-provider support.
5. Docker Compose and reproducible evaluation.

## License

License selection is pending while the repository remains private.