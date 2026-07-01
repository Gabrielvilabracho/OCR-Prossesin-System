-- Migration: 20260512_043_fix_security_definer_search_path
-- Track A — Security: Fix SECURITY DEFINER functions with missing SET search_path
--
-- Audit identified 1 function in schema 'facturas' with SECURITY DEFINER
-- but proconfig IS NULL (vulnerable to schema injection attacks):
--   - get_staff_role(user_id uuid) → facturas.staff_role
--
-- All other SECURITY DEFINER functions already had search_path set:
--   - audit_invoice_changes: search_path=facturas, public  ✅
--   - get_ai_quality_kpis:   search_path=facturas          ✅
--   - get_ai_confidence_trend: search_path=facturas        ✅
--   - get_ai_field_confidence: search_path=facturas        ✅
--   - get_ops_sla_data:       search_path=facturas         ✅

ALTER FUNCTION facturas.get_staff_role(user_id uuid) SET search_path = facturas, public;
