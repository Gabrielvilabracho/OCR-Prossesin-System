-- Migration 015: tax_code_patterns + invoice_taxes
-- Phase 3 — Intelligence Layer

-- ============================================================
-- tax_code_patterns — configurable normalization lookup table
-- ============================================================
create table if not exists facturas.tax_code_patterns (
  id              uuid  primary key default gen_random_uuid(),
  pattern_text    text  not null,
  normalized_code text  not null check (normalized_code in ('IVA','VAT','TVA','MwSt')),
  country_code    text  not null default 'PT',
  created_at      timestamptz not null default now()
);

-- ============================================================
-- invoice_taxes — structured tax rows replacing vat_breakdown JSONB
-- FK to invoices so taxes are queryable per invoice
-- ============================================================
create table if not exists facturas.invoice_taxes (
  id           uuid         primary key default gen_random_uuid(),
  invoice_id   uuid         not null references facturas.invoices(id) on delete cascade,
  tax_code     text         not null check (tax_code in ('IVA','VAT','TVA','MwSt')),
  rate         numeric(5,2) not null,
  taxable_base numeric(12,2) not null,
  tax_amount   numeric(12,2) not null,
  is_valid     boolean      not null default true,
  created_at   timestamptz  not null default now()
);

create index if not exists idx_invoice_taxes_invoice_id on facturas.invoice_taxes (invoice_id);
