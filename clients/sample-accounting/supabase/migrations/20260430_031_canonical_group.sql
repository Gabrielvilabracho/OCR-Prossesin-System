-- Migration: 20260430_031_canonical_group
-- Change: noxx-entity-resolution
-- Sprint 3 — REQ-5: canonical_group column
--
-- Adds canonical_group as nullable text column to facturas.suppliers.
-- No business logic uses this column yet — Sprint 4 reserved.
-- Zero-downtime safe: ADD COLUMN IF NOT EXISTS with no backfill.

ALTER TABLE facturas.suppliers
  ADD COLUMN IF NOT EXISTS canonical_group text;
