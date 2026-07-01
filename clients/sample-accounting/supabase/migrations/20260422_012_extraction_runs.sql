-- Migration: 20260422_012_extraction_runs
-- Description: Extraction runs — one row per OCR/LLM attempt per document
-- Schema: facturas
-- Depends on: 20260422_011_ocr_documents
--
-- Purpose: Track every extraction attempt (OCR + LLM) separately so we can:
--          - Audit extraction quality over time (confidence, version drift)
--          - Replay failed extractions without re-downloading the PDF
--          - Multiple rows per ocr_document_id are valid (retries, reruns)
--
-- Rollback:
--   drop index if exists facturas.idx_extraction_runs_ocr_document_id;
--   drop table if exists facturas.extraction_runs;

-- ============================================================
-- TABLE: facturas.extraction_runs
-- One row per extraction attempt linked to an ocr_document
-- ============================================================
create table if not exists facturas.extraction_runs (
  id                  uuid           primary key default gen_random_uuid(),
  ocr_document_id     uuid           not null references facturas.ocr_documents(id),
  raw_ocr_text        text,
  structured_json     jsonb,
  confidence          numeric(5,4),
  extractor_version   text,
  prompt_hash         text,
  processing_time_ms  bigint,
  created_at          timestamptz    not null default now()
);

-- ============================================================
-- INDEX: fast lookup by document
-- ============================================================
create index if not exists idx_extraction_runs_ocr_document_id
  on facturas.extraction_runs (ocr_document_id);

-- ============================================================
-- RLS scaffolding (enable when auth layer is ready)
-- ============================================================
-- alter table facturas.extraction_runs enable row level security;
