-- Migration: add unit column to facturas.invoice_items
-- Change: noxx-item-unit-extraction
-- Applied: 2026-05-07

ALTER TABLE facturas.invoice_items ADD COLUMN IF NOT EXISTS unit text;
