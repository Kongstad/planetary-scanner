CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS reference_records (
    record_id TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL,
    body_id TEXT NOT NULL,
    field TEXT NOT NULL,
    record_kind TEXT NOT NULL,
    value JSONB NOT NULL,
    unit TEXT,
    scope TEXT NOT NULL,
    as_of DATE NOT NULL,
    source_id TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    source_url TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding_model TEXT,
    embedding vector(384),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (jsonb_typeof(value) IN ('number', 'string')),
    CHECK ((embedding IS NULL) = (embedding_model IS NULL))
);

CREATE INDEX IF NOT EXISTS reference_records_body_field_idx
    ON reference_records (body_id, field);

CREATE INDEX IF NOT EXISTS reference_records_body_scope_idx
    ON reference_records (body_id, scope);

CREATE INDEX IF NOT EXISTS reference_records_source_idx
    ON reference_records (source_id);

CREATE INDEX IF NOT EXISTS reference_records_metadata_idx
    ON reference_records USING GIN (metadata);

CREATE INDEX IF NOT EXISTS reference_records_embedding_cosine_idx
    ON reference_records USING hnsw (embedding vector_cosine_ops);