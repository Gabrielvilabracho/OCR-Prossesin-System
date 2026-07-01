-- Migration 048: Materialized views for analytics (30-day rolling windows)
-- mv_extraction_quality_30d, mv_supplier_quality_30d, mv_field_confidence_30d
-- + refresh_materialized_view(view_name text) RPC helper for Trigger.dev task.
--
-- NOTE: CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Those statements are applied separately via execute_sql (see apply notes).

-- -------------------------------------------------------------------------
-- 1. Extraction quality — last 30 days, grouped by client + day
-- -------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS facturas.mv_extraction_quality_30d AS
SELECT
  client_id,
  DATE_TRUNC('day', created_at)                                                    AS day,
  COUNT(*)                                                                          AS total,
  COUNT(*) FILTER (WHERE processing_status = 'ok'::facturas.invoice_processing_status)             AS ok_count,
  COUNT(*) FILTER (WHERE processing_status = 'requires_review'::facturas.invoice_processing_status) AS review_count,
  COUNT(*) FILTER (WHERE processing_status = 'error'::facturas.invoice_processing_status)           AS error_count,
  ROUND(
    COUNT(*) FILTER (WHERE processing_status = 'ok'::facturas.invoice_processing_status)::numeric
    / NULLIF(COUNT(*), 0) * 100,
    2
  )                                                                                 AS ok_rate_pct
FROM facturas.invoices
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY client_id, DATE_TRUNC('day', created_at)
WITH DATA;

-- -------------------------------------------------------------------------
-- 2. Supplier quality — last 30 days, grouped by client + supplier
-- -------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS facturas.mv_supplier_quality_30d AS
SELECT
  i.client_id,
  i.supplier_id,
  COALESCE(s.commercial_name, s.legal_name, s.nif) AS supplier_name,
  COUNT(*)                                           AS total,
  COUNT(*) FILTER (WHERE i.processing_status = 'ok'::facturas.invoice_processing_status) AS ok_count,
  ROUND(AVG(i.processing_time_ms)::numeric, 0)       AS avg_processing_ms
FROM facturas.invoices i
LEFT JOIN facturas.suppliers s ON s.id = i.supplier_id
WHERE i.created_at >= NOW() - INTERVAL '30 days'
  AND i.supplier_id IS NOT NULL
GROUP BY i.client_id, i.supplier_id, s.commercial_name, s.legal_name, s.nif
WITH DATA;

-- -------------------------------------------------------------------------
-- 3. Field confidence — last 30 days, expanded from jsonb
-- -------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS facturas.mv_field_confidence_30d AS
SELECT
  i.client_id,
  fc.field_key,
  COUNT(*)                                                           AS sample_size,
  ROUND(AVG(cv.confidence_value)::numeric, 4)                        AS avg_confidence,
  ROUND(
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY cv.confidence_value)::numeric,
    4
  )                                                                  AS median_confidence
FROM facturas.invoices i,
  LATERAL jsonb_each_text(i.field_confidence) AS fc(field_key, confidence_str),
  LATERAL (SELECT fc.confidence_str::numeric AS confidence_value) AS cv
WHERE i.created_at >= NOW() - INTERVAL '30 days'
  AND i.field_confidence IS NOT NULL
GROUP BY i.client_id, fc.field_key
WITH DATA;

-- -------------------------------------------------------------------------
-- 4. RPC helper — refresh_materialized_view(view_name text)
-- Called by noxx-refresh-analytics-views Trigger.dev task.
-- SECURITY DEFINER + SET search_path to prevent schema injection.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION facturas.refresh_materialized_view(view_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = facturas
AS $$
DECLARE
  allowed_views text[] := ARRAY[
    'mv_extraction_quality_30d',
    'mv_supplier_quality_30d',
    'mv_field_confidence_30d'
  ];
BEGIN
  IF view_name != ALL(allowed_views) THEN
    RAISE EXCEPTION 'refresh_materialized_view: view % is not in the allowed list', view_name;
  END IF;

  EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY facturas.%I', view_name);
END;
$$;
