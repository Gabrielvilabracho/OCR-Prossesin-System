-- Migration: 20260512_045_processing_status_enum
-- Track C — Schema: convert invoices.processing_status from text to typed enum
--
-- Production distinct values found before migration:
--   duplicado, failed, ok, requires_review
--
-- Enum includes all spec values PLUS legacy text values (duplicado, failed)
-- to ensure zero data loss during the USING cast.
-- Legacy values are kept in the enum for backwards compatibility with existing
-- application code (InvoiceInsert type). A future cleanup migration can
-- rename them once all call sites are updated.

CREATE TYPE facturas.invoice_processing_status AS ENUM (
  'processing',
  'ok',
  'requires_review',
  'duplicate',
  'fiscal_duplicate',
  'error',
  'duplicado',
  'failed'
);

-- Drop dependent views (reference processing_status — recreated below)
DROP VIEW IF EXISTS facturas.v_extraction_quality;
DROP VIEW IF EXISTS facturas.v_cash_flow;
DROP VIEW IF EXISTS facturas.v_aging_report;
DROP VIEW IF EXISTS facturas.v_supplier_quality;
DROP VIEW IF EXISTS facturas.v_supplier_totals;
DROP VIEW IF EXISTS facturas.v_vat_mismatches;

-- Drop text CHECK constraint (replaced by the enum type)
ALTER TABLE facturas.invoices DROP CONSTRAINT IF EXISTS prototype_invoices_processing_status_check;

-- Drop partial index with text WHERE clause
-- (uix_invoice_business_key uses processing_status <> 'duplicado'::text — must be recreated)
DROP INDEX IF EXISTS facturas.uix_invoice_business_key;

-- Drop the text DEFAULT before altering the column type
-- (PostgreSQL cannot auto-cast the default expression)
ALTER TABLE facturas.invoices
  ALTER COLUMN processing_status DROP DEFAULT;

-- Convert text column to enum type
ALTER TABLE facturas.invoices
  ALTER COLUMN processing_status
    TYPE facturas.invoice_processing_status
    USING processing_status::facturas.invoice_processing_status;

-- Restore the DEFAULT using the enum type
ALTER TABLE facturas.invoices
  ALTER COLUMN processing_status
    SET DEFAULT 'processing'::facturas.invoice_processing_status;

-- Recreate the partial unique index with enum comparison
CREATE UNIQUE INDEX uix_invoice_business_key
  ON facturas.invoices (issuer_nif, invoice_number, issue_date)
  WHERE (processing_status <> 'duplicado'::facturas.invoice_processing_status);

-- Recreate all dropped views using enum comparisons

CREATE VIEW facturas.v_extraction_quality AS
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS total,
  count(*) FILTER (WHERE processing_status = 'ok'::facturas.invoice_processing_status) AS ok_count,
  count(*) FILTER (WHERE processing_status = 'requires_review'::facturas.invoice_processing_status) AS review_count,
  count(*) FILTER (WHERE processing_status = 'failed'::facturas.invoice_processing_status) AS fail_count,
  count(*) FILTER (WHERE processing_status = 'duplicado'::facturas.invoice_processing_status) AS duplicate_count,
  round((count(*) FILTER (WHERE processing_status = 'ok'::facturas.invoice_processing_status))::numeric / NULLIF(count(*), 0)::numeric * 100, 2) AS ok_rate,
  round((count(*) FILTER (WHERE processing_status = 'requires_review'::facturas.invoice_processing_status))::numeric / NULLIF(count(*), 0)::numeric * 100, 2) AS review_rate,
  round((count(*) FILTER (WHERE processing_status = 'failed'::facturas.invoice_processing_status))::numeric / NULLIF(count(*), 0)::numeric * 100, 2) AS fail_rate
FROM facturas.invoices
GROUP BY date_trunc('day', created_at)
ORDER BY date_trunc('day', created_at) DESC;

CREATE VIEW facturas.v_cash_flow AS
SELECT
  (date_trunc('month', (issue_date)::timestamp with time zone))::date AS month,
  count(*) AS invoice_count,
  COALESCE(sum(total_with_vat), 0::numeric) AS total_outflow
FROM facturas.invoices i
WHERE processing_status = 'ok'::facturas.invoice_processing_status
GROUP BY (date_trunc('month', (issue_date)::timestamp with time zone))::date
ORDER BY (date_trunc('month', (issue_date)::timestamp with time zone))::date DESC;

CREATE VIEW facturas.v_aging_report AS
SELECT
  CASE
    WHEN (now()::date - due_date) <= 30 THEN 'current'
    WHEN (now()::date - due_date) <= 60 THEN 'overdue-30'
    WHEN (now()::date - due_date) <= 90 THEN 'overdue-60'
    ELSE 'overdue-90'
  END AS bucket,
  count(*) AS invoice_count,
  COALESCE(sum(amount_due), 0::numeric) AS total_amount_due
FROM facturas.invoices i
WHERE (payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text]))
  AND processing_status = 'ok'::facturas.invoice_processing_status
  AND due_date IS NOT NULL
GROUP BY 1
ORDER BY 1;

CREATE VIEW facturas.v_supplier_quality AS
SELECT
  s.nif AS supplier_nif,
  COALESCE(s.commercial_name, s.legal_name, s.nif) AS supplier_name,
  sc.name AS category,
  count(*) AS total_invoices,
  count(*) FILTER (WHERE i.processing_status = 'ok'::facturas.invoice_processing_status) AS ok_count,
  count(*) FILTER (WHERE i.processing_status = 'requires_review'::facturas.invoice_processing_status) AS review_count,
  count(*) FILTER (WHERE i.processing_status = 'failed'::facturas.invoice_processing_status) AS fail_count,
  round(
    (count(*) FILTER (WHERE i.processing_status = ANY (ARRAY['requires_review'::facturas.invoice_processing_status, 'failed'::facturas.invoice_processing_status])))::numeric
    / NULLIF(count(*), 0)::numeric * 100, 2
  ) AS error_rate_pct
FROM facturas.suppliers s
LEFT JOIN facturas.supplier_categories sc ON sc.id = s.category_id
LEFT JOIN facturas.invoices i ON i.supplier_id = s.id
GROUP BY s.nif, s.commercial_name, s.legal_name, sc.name
HAVING count(*) > 0
ORDER BY error_rate_pct DESC NULLS LAST;

CREATE VIEW facturas.v_supplier_totals AS
SELECT
  s.id AS supplier_id,
  s.nif,
  COALESCE(s.commercial_name, s.legal_name, s.nif) AS supplier_name,
  sc.name AS category,
  sc.slug AS category_slug,
  s.subcategory,
  s.country,
  count(DISTINCT i.id) AS invoice_count,
  COALESCE(sum(i.total_without_vat), 0::numeric) AS total_net,
  COALESCE(sum(i.vat_total), 0::numeric) AS total_vat,
  COALESCE(sum(i.total_with_vat), 0::numeric) AS total_gross,
  min(i.issue_date) AS first_invoice_date,
  max(i.issue_date) AS last_invoice_date
FROM facturas.suppliers s
LEFT JOIN facturas.supplier_categories sc ON sc.id = s.category_id
LEFT JOIN facturas.invoices i ON i.supplier_id = s.id
  AND i.processing_status = 'ok'::facturas.invoice_processing_status
GROUP BY s.id, s.nif, s.commercial_name, s.legal_name, sc.name, sc.slug, s.subcategory, s.country;

CREATE VIEW facturas.v_vat_mismatches AS
SELECT
  i.id,
  i.invoice_number,
  s.nif AS supplier_nif,
  COALESCE(s.commercial_name, s.legal_name, s.nif) AS supplier_name,
  i.vat_total,
  i.processing_status,
  i.created_at,
  mv.error AS mismatch_detail
FROM facturas.invoices i
LEFT JOIN facturas.suppliers s ON s.id = i.supplier_id
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE((i.math_validation_result -> 'errors'), '[]'::jsonb)) mv(error)
WHERE mv.error LIKE 'R5%' OR mv.error LIKE 'R6%'
ORDER BY i.created_at DESC;
