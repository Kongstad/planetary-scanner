# Frontend

React and TypeScript console with CesiumJS globes and a solar disk viewer.

Run `npm run dev -- --port 5174` from this directory. The reference API defaults to port 8000. `npm run build` creates the production bundle. `npm run build:demo` bundles reference facts and solar snapshots for static hosting.

The science computer displays the answer model reported by the API, currently Ministral 3 8B through Ollama, alongside the MiniLM encoder and total reference record count. Static demo builds display the record count with answer generation disabled.

Use `npm run format`, `npm run format:check`, and `npm run lint` for source checks. See the [project README](../README.md) for setup, data sources, and architecture.
