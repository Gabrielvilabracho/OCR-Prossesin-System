-- Migration: 20260413_002_fix_invoice_business_key
-- Description: Adjust uix_invoice_business_key — remove total_with_vat from deduplication index
-- Reason: OCR/LLM decimal errors (e.g. 1000.00 vs 1000.01) would cause the same invoice
--         to pass as a new one. total_with_vat is used for VALIDATION, not identification.
--         Business key is: issuer_nif + invoice_number + issue_date (sufficient by PT fiscal law)

drop index if exists facturas.uix_invoice_business_key;

create unique index uix_invoice_business_key
  on facturas.prototype_invoices (issuer_nif, invoice_number, issue_date)
  where processing_status != 'duplicado';
