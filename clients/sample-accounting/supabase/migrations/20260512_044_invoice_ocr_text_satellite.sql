-- Migration: 20260512_044_invoice_ocr_text_satellite
-- Track C — Schema: move raw_ocr_text out of invoices into satellite table
--
-- Rationale: raw_ocr_text can be several KB per invoice (full OCR output).
-- Keeping it in the main invoices table bloats the row size for all queries
-- that don't need OCR data. The satellite table isolates it with service_role
-- access only — no portal queries ever need raw_ocr_text directly.
--
-- Steps:
--   1. Create invoice_ocr_text table with PK FK to invoices
--   2. Migrate existing raw_ocr_text data
--   3. Enable RLS — service_role only
--   4. Drop raw_ocr_text column from invoices

-- Step 1: Create satellite table
CREATE TABLE facturas.invoice_ocr_text (
  invoice_id   UUID        PRIMARY KEY REFERENCES facturas.invoices(id) ON DELETE CASCADE,
  raw_ocr_text TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 2: Migrate existing data (non-NULL rows only)
INSERT INTO facturas.invoice_ocr_text (invoice_id, raw_ocr_text)
SELECT id, raw_ocr_text
FROM facturas.invoices
WHERE raw_ocr_text IS NOT NULL;

-- Step 3: Enable RLS
ALTER TABLE facturas.invoice_ocr_text ENABLE ROW LEVEL SECURITY;

-- service_role only — portal never reads raw OCR text directly
CREATE POLICY "service_role_only" ON facturas.invoice_ocr_text
  USING (auth.role() = 'service_role');

-- Step 4: Drop column from invoices
ALTER TABLE facturas.invoices DROP COLUMN raw_ocr_text;
