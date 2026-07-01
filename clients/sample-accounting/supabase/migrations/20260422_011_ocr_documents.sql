-- Migration: 20260422_011_ocr_documents
-- Description: OCR documents tracking table — idempotent by document_hash
-- Schema: facturas
-- Depends on: 20260422_010_organizations
--
-- Purpose: Persist every PDF seen by the pipeline as an immutable document record.
--          document_hash (SHA-256 hex) is UNIQUE — idempotent upsert via ON CONFLICT.
--          source_type CHECK constraint limits to known integrations.
--
-- Rollback:
--   drop index if exists facturas.idx_ocr_documents_document_hash;
--   drop index if exists facturas.idx_ocr_documents_organization_id;
--   drop index if exists facturas.idx_ocr_documents_client_id;
--   drop table if exists facturas.ocr_documents;

-- ============================================================
-- TABLE: facturas.ocr_documents
-- One row per unique PDF file (uniqueness enforced by document_hash)
-- ============================================================
create table if not exists facturas.ocr_documents (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        references facturas.organizations(id),
  client_id       uuid        references facturas.noxx_clients(id),
  source_type     text        not null check (source_type in ('drive')),
  source_ref      text        not null,
  folder_ref      text,
  file_name       text,
  file_size_bytes bigint,
  storage_path    text,
  document_hash   text        not null unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- INDEXES: performance for common query patterns
-- ============================================================
create index if not exists idx_ocr_documents_client_id
  on facturas.ocr_documents (client_id);

create index if not exists idx_ocr_documents_organization_id
  on facturas.ocr_documents (organization_id);

create index if not exists idx_ocr_documents_document_hash
  on facturas.ocr_documents (document_hash);

-- ============================================================
-- RLS scaffolding (enable when auth layer is ready)
-- ============================================================
-- alter table facturas.ocr_documents enable row level security;
