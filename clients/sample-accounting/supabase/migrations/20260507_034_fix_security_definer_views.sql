-- Migration: 20260507_034_fix_security_definer_views
-- Fix: Security Definer Views → Security Invoker
-- Las vistas sin security_invoker explícito heredan SECURITY DEFINER
-- del owner, bypasseando RLS completamente.
-- ALTER VIEW ... SET (security_invoker = true) disponible desde PG15.
-- Applied: 2026-05-07

ALTER VIEW facturas.v_missing_fields      SET (security_invoker = true);
ALTER VIEW facturas.v_supplier_totals     SET (security_invoker = true);
ALTER VIEW facturas.v_math_validation     SET (security_invoker = true);
ALTER VIEW facturas.v_extraction_quality  SET (security_invoker = true);
ALTER VIEW facturas.v_aging_report        SET (security_invoker = true);
ALTER VIEW facturas.v_cash_flow           SET (security_invoker = true);
ALTER VIEW facturas.v_items_by_category   SET (security_invoker = true);
ALTER VIEW facturas.v_supplier_quality    SET (security_invoker = true);
ALTER VIEW facturas.v_vat_mismatches      SET (security_invoker = true);
