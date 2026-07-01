-- Migration 025: math consistency check constraint on invoices
-- Pre-check: 0 violations found before applying
-- actual column names: total_with_vat, total_without_vat, vat_total
-- (spec used subtotal/vat — actual schema differs)
-- Note: ADD CONSTRAINT does not support IF NOT EXISTS in PostgreSQL

ALTER TABLE facturas.invoices
  ADD CONSTRAINT chk_math_consistency
  CHECK (
    total_with_vat IS NULL OR total_without_vat IS NULL OR vat_total IS NULL
    OR ABS(total_with_vat - (total_without_vat + vat_total)) <= 0.02
  ) NOT VALID;

-- 0 violations found — constraint validated immediately
ALTER TABLE facturas.invoices VALIDATE CONSTRAINT chk_math_consistency;
