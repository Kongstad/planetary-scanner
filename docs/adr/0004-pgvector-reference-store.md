# ADR 0004: PostgreSQL with pgvector for reference records

## Status

Accepted

## Context

PlanetaryScanner currently stores its small Earth reference corpus as JSON Lines with a
derived NumPy vector index. This is transparent and reproducible for a learning-scale
dataset, but it does not provide durable ingest, metadata filtering, transactional
updates, or efficient retrieval when the corpus grows to thousands of records.

The production-scale record store must preserve scientific provenance, units, scopes,
dates, source locators, record versions, and embeddings. It must run locally without
paid services and support a gradual migration from the existing JSONL/NPZ baseline.

## Decision

Use PostgreSQL with the pgvector extension as PlanetaryScanner's durable reference-record
store. Run it locally through Docker Compose using the `pgvector/pgvector:pg16` image.

The initial `reference_records` table stores readable retrieval content, canonical
structured values, provenance fields, a flexible metadata object, and an optional
384-dimensional MiniLM embedding. PostgreSQL indexes support body and metadata filters;
pgvector supports cosine vector similarity. An HNSW index is provisioned for the embedding
column once records are loaded.

The current JSONL and NPZ files remain the retrieval baseline until an importer and
PostgreSQL retriever are added and shown to return equivalent evaluation results.

## Consequences

- Ingestion can upsert many validated records while preserving source lineage.
- Query routing can apply relational filters before vector search.
- Embeddings remain tied to their model name and dimension.
- PostgreSQL data lives in a Docker named volume and is local-only by default.
- Schema changes require versioned SQL migrations or an adopted migration tool.
- Docker must be available for the database-backed workflow; the current file-backed demo
  continues to work without it.

## Alternatives Considered

### Separate vector database plus PostgreSQL

Rejected initially. A separate vector service adds operational complexity without a clear
need at this corpus size. pgvector keeps transactional provenance and vector retrieval in
one local service.

### Continue with JSONL and NumPy

Retained only as the migration baseline. It is simple, but does not support scalable ingest,
concurrent writers, SQL filtering, or durable queryable metadata.

### SQLite vector extension

Rejected for the initial service architecture. SQLite is excellent for a single-process
local artifact but PostgreSQL better matches the intended Dockerized service boundary and
future multi-process API and worker workflow.