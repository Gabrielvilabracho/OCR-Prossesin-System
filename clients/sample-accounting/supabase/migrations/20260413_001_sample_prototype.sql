-- Migration: 20260413_001_noxx_prototype
-- Description: Initial schema for Noxx accounting prototype
-- Schema: facturas
-- Tables: facturas.prototype_invoices, facturas.prototype_invoice_reviews

-- ============================================================
-- SCHEMA
-- ============================================================
create schema if not exists facturas;

-- ============================================================
-- TABLE: facturas.prototype_invoices
-- ============================================================
create table if not exists facturas.prototype_invoices (
  id                  uuid          primary key default gen_random_uuid(),
  source_type         text          not null check (source_type in ('gmail', 'drive')),
  source_ref          text          not null,
  file_name           text          not null,
  document_hash       text          not null unique,
  processing_status   text          not null default 'processing'
                        check (processing_status in ('processing', 'ok', 'duplicado', 'requires_review', 'failed')),
  invoice_number      text,
  issuer_nif          text,
  receiver_nif        text,
  issuer_name         text,
  issue_date          date,
  total_with_vat      numeric(12,2),
  total_without_vat   numeric(12,2),
  vat_total           numeric(12,2),
  vat_breakdown       jsonb,
  llm_confidence      numeric(5,2),
  duplicate_of        uuid          references facturas.prototype_invoices(id),
  review_reason       text,
  raw_extraction      jsonb,
  efactura_mock_result jsonb,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

-- Index: document_hash is already unique (handled by constraint)
-- Index: partial unique on issuer_nif + invoice_number + issue_date + total_with_vat
--        where processing_status != 'duplicado' (deduplicate business key)
-- Clave de negocio fiscal: NIF emisor + número de factura + fecha de emisión
-- total_with_vat excluido intencionalmente: un error de OCR en decimales (1000.00 vs 1000.01)
-- haría pasar un duplicado como factura nueva. El total se usa para VALIDAR, no para identificar.
create unique index if not exists uix_invoice_business_key
  on facturas.prototype_invoices (issuer_nif, invoice_number, issue_date)
  where processing_status != 'duplicado';

-- ============================================================
-- TABLE: facturas.prototype_invoice_reviews
-- ============================================================
create table if not exists facturas.prototype_invoice_reviews (
  id           uuid        primary key default gen_random_uuid(),
  invoice_id   uuid        not null references facturas.prototype_invoices(id),
  decision     text        not null check (decision in ('approved', 'rejected', 'edited')),
  reason       text,
  reviewed_by  text        not null,
  reviewed_at  timestamptz not null default now()
);

-- ============================================================
-- TRIGGER: auto-update updated_at on facturas.prototype_invoices
-- ============================================================
create or replace function facturas.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_prototype_invoices_updated_at
  before update on facturas.prototype_invoices
  for each row
  execute function facturas.set_updated_at();
