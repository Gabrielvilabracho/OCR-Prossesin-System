-- Migration: 20260422_013_invoices_rls_and_fk
-- Description: Add ocr_document_id FK to invoices + enable RLS + service_role SELECT policy
-- Schema: facturas
-- Depends on: 20260422_011_ocr_documents
--
-- Purpose: Link every invoice to the ocr_document record that produced it.
--          ocr_document_id is nullable — existing invoices and dryRun path keep null.
--          RLS enabled with a service_role bypass so the pipeline (service key) can SELECT.
--
-- Rollback:
--   drop policy if exists "service_role_select" on facturas.invoices;
--   alter table facturas.invoices disable row level security;
--   drop index if exists facturas.idx_invoices_ocr_document_id;
--   alter table facturas.invoices drop column if exists ocr_document_id;

-- ============================================================
-- ALTER: facturas.invoices — add ocr_document_id FK (nullable)
-- ============================================================
alter table facturas.invoices
  add column if not exists ocr_document_id uuid references facturas.ocr_documents(id);

create index if not exists idx_invoices_ocr_document_id
  on facturas.invoices (ocr_document_id);

-- ============================================================
-- RLS: enable + service_role bypass policy
-- ============================================================
alter table facturas.invoices enable row level security;

create policy "service_role_select"
  on facturas.invoices
  for select
  to service_role
  using (true);
