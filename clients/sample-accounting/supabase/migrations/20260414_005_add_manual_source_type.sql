-- Migration: 20260414_005_add_manual_source_type
-- Description: Add 'manual' to source_type allowed values in facturas.prototype_invoices
-- Schema: facturas
-- Table: facturas.prototype_invoices
-- Depends on: 20260413_001_noxx_prototype
--
-- Rollout order: apply this migration BEFORE deploying Trigger.dev code that uses
-- source_type='manual'. The old constraint will reject 'manual' inserts.
-- Rollback: run the inverse ALTER below to revert to ('gmail', 'drive') only.
--
-- Rollback:
--   alter table facturas.prototype_invoices
--     drop constraint if exists prototype_invoices_source_type_check;
--   alter table facturas.prototype_invoices
--     add constraint prototype_invoices_source_type_check
--     check (source_type in ('gmail', 'drive'));

-- Step 1: drop the existing inline check constraint (created in migration 001 as unnamed;
-- PostgreSQL assigns the name <table>_<column>_check by default)
alter table facturas.prototype_invoices
  drop constraint if exists prototype_invoices_source_type_check;

-- Step 2: recreate the constraint accepting the three allowed values
alter table facturas.prototype_invoices
  add constraint prototype_invoices_source_type_check
  check (source_type in ('gmail', 'drive', 'manual'));
