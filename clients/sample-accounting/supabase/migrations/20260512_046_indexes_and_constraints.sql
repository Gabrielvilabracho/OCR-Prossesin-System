-- Migration: 20260512_046_indexes_and_constraints
-- Track C — Schema: add partial index on duplicate_of + GIN index on field_confidence
--
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- These statements are executed outside transaction context.

-- Partial index on duplicate_of
-- Most invoices are NOT duplicates, so a partial index is much smaller and faster
-- than a full index. Only indexes rows where duplicate_of IS NOT NULL.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_duplicate_of
  ON facturas.invoices(duplicate_of)
  WHERE duplicate_of IS NOT NULL;

-- GIN index on field_confidence JSONB column
-- Enables fast queries like field_confidence @> '{"issuer_nif": 0.9}'
-- Also speeds up jsonb_each_text() lateral joins used in analytics views.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_field_confidence_gin
  ON facturas.invoices USING GIN(field_confidence);
