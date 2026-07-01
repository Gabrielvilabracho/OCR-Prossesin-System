-- Migration: 20260511_042_analytics_rpcs
-- Description: Add decided_at to invoice_approvals + RPCs for /aiquality and /ops/sla pages
-- Schema: facturas
-- Depends on: 041_invoice_export_tracking
--
-- Rollback:
--   ALTER TABLE facturas.invoice_approvals DROP COLUMN IF EXISTS decided_at;
--   DROP FUNCTION IF EXISTS facturas.get_ai_quality_kpis(int);
--   DROP FUNCTION IF EXISTS facturas.get_ai_confidence_trend(int);
--   DROP FUNCTION IF EXISTS facturas.get_ai_field_confidence(int);
--   DROP FUNCTION IF EXISTS facturas.get_ops_sla_data(int);

-- ============================================================
-- COLUMN: invoice_approvals.decided_at
-- Needed for approval time calculations in /ops/sla
-- ============================================================
ALTER TABLE facturas.invoice_approvals
  ADD COLUMN IF NOT EXISTS decided_at timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- RPC: get_ai_quality_kpis(p_days int)
-- Returns the 4 KPI cards for /aiquality page
-- ============================================================
CREATE OR REPLACE FUNCTION facturas.get_ai_quality_kpis(p_days int DEFAULT 30)
RETURNS TABLE (
  avg_confidence        numeric,
  auto_approvable_pct   numeric,
  requires_review_pct   numeric,
  correction_rate_pct   numeric,
  total_invoices        bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = facturas
AS $$
  SELECT
    ROUND(AVG(llm_confidence)::numeric, 4)                                          AS avg_confidence,
    ROUND((COUNT(*) FILTER (WHERE llm_confidence >= 0.90)::numeric
           / NULLIF(COUNT(*), 0) * 100), 2)                                         AS auto_approvable_pct,
    ROUND((COUNT(*) FILTER (WHERE review_required = true)::numeric
           / NULLIF(COUNT(*), 0) * 100), 2)                                         AS requires_review_pct,
    ROUND((COUNT(*) FILTER (WHERE approval_status = 'edited')::numeric
           / NULLIF(COUNT(*) FILTER (WHERE approval_status IN ('approved','edited','rejected')), 0) * 100), 2)
                                                                                    AS correction_rate_pct,
    COUNT(*)                                                                        AS total_invoices
  FROM facturas.invoices
  WHERE created_at >= now() - (p_days || ' days')::interval
    AND auth.uid() IS NOT NULL;
$$;

-- ============================================================
-- RPC: get_ai_confidence_trend(p_days int)
-- Returns daily avg confidence for the area chart in /aiquality
-- ============================================================
CREATE OR REPLACE FUNCTION facturas.get_ai_confidence_trend(p_days int DEFAULT 30)
RETURNS TABLE (
  day              date,
  avg_confidence   numeric,
  invoice_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = facturas
AS $$
  SELECT
    date_trunc('day', created_at)::date   AS day,
    ROUND(AVG(llm_confidence)::numeric, 4) AS avg_confidence,
    COUNT(*)                               AS invoice_count
  FROM facturas.invoices
  WHERE created_at >= now() - (p_days || ' days')::interval
    AND llm_confidence IS NOT NULL
    AND auth.uid() IS NOT NULL
  GROUP BY date_trunc('day', created_at)
  ORDER BY day ASC;
$$;

-- ============================================================
-- RPC: get_ai_field_confidence(p_days int)
-- Returns per-field avg confidence grouped by client for heatmap
-- Each row: field_name, client_name, avg_confidence
-- field_confidence is jsonb: { "issuer_name": 0.95, "issue_date": 0.88, ... }
-- ============================================================
CREATE OR REPLACE FUNCTION facturas.get_ai_field_confidence(p_days int DEFAULT 30)
RETURNS TABLE (
  client_name      text,
  field_name       text,
  avg_confidence   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = facturas
AS $$
  SELECT
    c.legal_name                                    AS client_name,
    kv.key                                          AS field_name,
    ROUND(AVG((kv.value)::numeric)::numeric, 4)     AS avg_confidence
  FROM facturas.invoices i
  JOIN facturas.noxx_clients c ON c.id = i.client_id
  CROSS JOIN LATERAL jsonb_each_text(i.field_confidence) AS kv(key, value)
  WHERE i.created_at >= now() - (p_days || ' days')::interval
    AND i.field_confidence IS NOT NULL
    AND auth.uid() IS NOT NULL
  GROUP BY c.name, kv.key
  ORDER BY c.name, kv.key;
$$;

-- ============================================================
-- RPC: get_ops_sla_data(p_days int)
-- Returns all data needed for /ops/sla page in one call:
--   kpis, funnel, throughput_by_day, performance_by_approver, critical_backlog
-- Returns single jsonb to avoid multiple round-trips
-- ============================================================
CREATE OR REPLACE FUNCTION facturas.get_ops_sla_data(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = facturas
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT jsonb_build_object(

    -- 4 KPI cards
    'kpis', (
      SELECT jsonb_build_object(
        'avg_approval_hours',
          ROUND(AVG(
            EXTRACT(EPOCH FROM (a.decided_at - i.created_at)) / 3600
          )::numeric, 1),
        'daily_throughput',
          ROUND(COUNT(*)::numeric / NULLIF(p_days, 0), 1),
        'sla_24h_pct',
          ROUND(
            COUNT(*) FILTER (
              WHERE EXTRACT(EPOCH FROM (a.decided_at - i.created_at)) / 3600 <= 24
            )::numeric / NULLIF(COUNT(*), 0) * 100
          , 1),
        'critical_backlog',
          (SELECT COUNT(*) FROM facturas.review_queue
           WHERE status = 'pending' AND priority = 1),
        'total_processed', COUNT(*)
      )
      FROM facturas.invoices i
      LEFT JOIN facturas.invoice_approvals a ON a.invoice_id = i.id
      WHERE i.created_at >= now() - (p_days || ' days')::interval
    ),

    -- Pipeline funnel: count by stage
    'funnel', (
      SELECT jsonb_build_object(
        'uploaded',    COUNT(*),
        'extracted',   COUNT(*) FILTER (WHERE llm_confidence IS NOT NULL),
        'review',      COUNT(*) FILTER (WHERE review_required = true),
        'approved',    COUNT(*) FILTER (WHERE approval_status = 'approved'),
        'edited',      COUNT(*) FILTER (WHERE approval_status = 'edited'),
        'rejected',    COUNT(*) FILTER (WHERE approval_status = 'rejected'),
        'pending',     COUNT(*) FILTER (WHERE approval_status = 'pending')
      )
      FROM facturas.invoices
      WHERE created_at >= now() - (p_days || ' days')::interval
    ),

    -- Daily throughput for bar chart
    'throughput_by_day', (
      SELECT jsonb_agg(
        jsonb_build_object('day', day, 'count', cnt)
        ORDER BY day
      )
      FROM (
        SELECT
          date_trunc('day', created_at)::date AS day,
          COUNT(*) AS cnt
        FROM facturas.invoices
        WHERE created_at >= now() - (p_days || ' days')::interval
        GROUP BY date_trunc('day', created_at)
      ) t
    ),

    -- Performance by approver
    'approvers', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'staff_id',     s.id,
          'name',         s.name,
          'count',        COUNT(a.id),
          'avg_hours',    ROUND(AVG(
                            EXTRACT(EPOCH FROM (a.decided_at - i.created_at)) / 3600
                          )::numeric, 1)
        )
        ORDER BY COUNT(a.id) DESC
      )
      FROM facturas.invoice_approvals a
      JOIN facturas.invoices i ON i.id = a.invoice_id
      JOIN facturas.noxx_staff s ON s.id = a.decided_by
      WHERE a.decided_at >= now() - (p_days || ' days')::interval
      GROUP BY s.id, s.name
    ),

    -- Critical backlog items (priority 1, pending)
    'critical_backlog_items', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'invoice_id',   rq.invoice_id,
          'reason_code',  rq.reason_code,
          'created_at',   rq.created_at,
          'hours_waiting', ROUND(
            EXTRACT(EPOCH FROM (now() - rq.created_at)) / 3600
          ::numeric, 1)
        )
        ORDER BY rq.created_at ASC
      )
      FROM facturas.review_queue rq
      WHERE rq.status = 'pending'
        AND rq.priority = 1
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- GRANTS: allow authenticated users to call all RPCs
-- ============================================================
GRANT EXECUTE ON FUNCTION facturas.get_ai_quality_kpis(int)      TO authenticated;
GRANT EXECUTE ON FUNCTION facturas.get_ai_confidence_trend(int)   TO authenticated;
GRANT EXECUTE ON FUNCTION facturas.get_ai_field_confidence(int)   TO authenticated;
GRANT EXECUTE ON FUNCTION facturas.get_ops_sla_data(int)          TO authenticated;
