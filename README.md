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