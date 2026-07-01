-- Migration 020: validation tracing
-- Adds error_categories to extraction_runs and review_required to invoices
-- Part of change: noxx-validation-tracing (REQ-06, REQ-07)
-- Additive-only migration — no data migration required
-- field_confidence column already exists (migration 009)

-- AC-07.2: Add error_categories jsonb to extraction_runs
ALTER TABLE facturas.extraction_runs
  ADD COLUMN IF NOT EXISTS error_categories jsonb DEFAULT '[]'::jsonb;

-- AC-07.3: Add review_required boolean to invoices
ALTER TABLE facturas.invoices
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false;
