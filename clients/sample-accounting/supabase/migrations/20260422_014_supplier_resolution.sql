-- ============================================================
-- Migration 014 — Supplier Resolution Layer
-- Creates supplier_aliases, supplier_resolution_log tables
-- and extends suppliers with name columns for fuzzy matching
-- ============================================================

-- --------------------------------------------------------
-- 1. Extend facturas.suppliers with name columns
--    (must run before supplier_aliases which references suppliers)
-- --------------------------------------------------------
alter table facturas.suppliers
  add column if not exists legal_name      text,
  add column if not exists commercial_name text,
  add column if not exists normalized_name text;

-- --------------------------------------------------------
-- 2. supplier_aliases — known aliases for each supplier
-- --------------------------------------------------------
create table if not exists facturas.supplier_aliases (
  id           uuid        primary key default gen_random_uuid(),
  supplier_id  uuid        not null references facturas.suppliers(id) on delete cascade,
  alias_text   text        not null,
  alias_type   text        not null check (alias_type in ('nif', 'name_exact', 'name_fuzzy', 'manual')),
  confidence   numeric(5,4),
  created_at   timestamptz not null default now(),
  unique (supplier_id, alias_text, alias_type)
);

create index if not exists idx_supplier_aliases_supplier_id
  on facturas.supplier_aliases (supplier_id);

create index if not exists idx_supplier_aliases_alias_text
  on facturas.supplier_aliases (alias_text);

-- --------------------------------------------------------
-- 3. supplier_resolution_log — audit trail per resolution attempt
-- --------------------------------------------------------
create table if not exists facturas.supplier_resolution_log (
  id                   uuid        primary key default gen_random_uuid(),
  ocr_document_id      uuid        references facturas.ocr_documents(id),
  input_nif            text,
  input_name           text,
  resolved_supplier_id uuid        references facturas.suppliers(id),
  resolution_method    text        not null check (resolution_method in ('nif_exact','alias_exact','fuzzy','manual','unresolved')),
  confidence           numeric(5,4),
  created_by           text        not null check (created_by in ('auto','human')) default 'auto',
  created_at           timestamptz not null default now()
);

create index if not exists idx_supplier_resolution_log_ocr_document_id
  on facturas.supplier_resolution_log (ocr_document_id);

create index if not exists idx_supplier_resolution_log_resolved_supplier_id
  on facturas.supplier_resolution_log (resolved_supplier_id);
