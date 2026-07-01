-- Migration: drop obsolete get_staff_active from public schema
-- Date: 2026-05-09
-- Reason: get_staff_active (public) was never used by backend code or RLS policies.
--         get_staff_role (facturas schema) is the active function.
--         Removed to fix TypeScript type conflicts in frontend when generating
--         types with --schema public,facturas.

DROP FUNCTION IF EXISTS public.get_staff_active(uuid);
