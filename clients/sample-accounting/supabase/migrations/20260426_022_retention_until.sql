-- Migration 022: retention_until generated column
-- GDPR / DL 28/2019: data retention = issue_date + 10 years
-- Generated column is immutable — no direct writes allowed
-- Note: actual column is issue_date (not invoice_date per spec)
-- Note: type is DATE (TIMESTAMPTZ cast is not immutable in PostgreSQL)

ALTER TABLE facturas.invoices
  ADD COLUMN IF NOT EXISTS retention_until DATE
  GENERATED ALWAYS AS (
    CASE WHEN issue_date IS NOT NULL
    THEN issue_date + INTERVAL '10 years'
    ELSE NULL END
  ) STORED;
