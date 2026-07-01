-- Migration: 20260416_006_noxx_b1_fields
-- Description: B1 — extended header fields + math validation result
-- Schema: facturas
-- Table: facturas.prototype_invoices
-- Depends on: 20260414_004_noxx_invoice_items
--
-- All columns are nullable for backward-compat with existing records.
-- Deploy BEFORE Trigger.dev code that writes these fields.
--
-- Rollback:
--   alter table facturas.prototype_invoices
--     drop column if exists receiver_name,
--     drop column if exists due_date,
--     drop column if exists currency,
--     drop column if exists document_type,
--     drop column if exists origin_country,
--     drop column if exists atcud,
--     drop column if exists math_validation_result;

alter table facturas.prototype_invoices
  add column if not exists receiver_name         text,
  add column if not exists due_date              date,
  add column if not exists currency              text,
  add column if not exists document_type         text,
  add column if not exists origin_country        text,
  add column if not exists atcud                 text,
  add column if not exists math_validation_result jsonb;

-- Index for querying facturas with math validation errors
create index if not exists idx_invoices_math_valid
  on facturas.prototype_invoices ((math_validation_result->>'valid'))
  where math_validation_result is not null;
