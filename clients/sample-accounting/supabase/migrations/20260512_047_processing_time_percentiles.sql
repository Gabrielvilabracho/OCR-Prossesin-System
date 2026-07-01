-- Migration 047: v_processing_time_percentiles
-- Creates a view for P50/P75/P90/P95/P99 processing time per client.
-- processing_time_ms column exists as bigint (confirmed).
-- Required by NFR-001 of noxx-python-service-migration (baseline latency tracking).

CREATE OR REPLACE VIEW facturas.v_processing_time_percentiles AS
SELECT
  client_id,
  COUNT(*)                                                                    AS total_invoices,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY processing_time_ms)           AS p50_ms,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY processing_time_ms)           AS p75_ms,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY processing_time_ms)           AS p90_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms)           AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY processing_time_ms)           AS p99_ms,
  MAX(processing_time_ms)                                                     AS max_ms,
  MIN(processing_time_ms)                                                     AS min_ms,
  AVG(processing_time_ms)                                                     AS avg_ms
FROM facturas.invoices
WHERE processing_time_ms IS NOT NULL
GROUP BY client_id;
