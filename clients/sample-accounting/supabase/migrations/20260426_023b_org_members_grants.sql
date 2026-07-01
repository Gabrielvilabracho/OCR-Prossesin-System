-- Migration 023b: Grant schema and table access to authenticated role for org_members
-- Without USAGE on schema facturas, authenticated users get
-- "permission denied for schema facturas" before RLS even runs.
-- The RLS policy org_members_select_own controls row-level visibility.

GRANT USAGE ON SCHEMA facturas TO authenticated;
GRANT SELECT ON facturas.org_members TO authenticated;
