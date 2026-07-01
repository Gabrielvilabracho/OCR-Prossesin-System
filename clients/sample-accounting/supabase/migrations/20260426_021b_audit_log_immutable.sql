-- Migration 021b: Make audit_log immutable at the table-privilege level
-- service_role bypasses RLS, so RLS INSERT-only policy alone is insufficient.
-- Revoking UPDATE and DELETE at the table level makes audit_log append-only
-- even for service_role.
-- INSERT is kept: the trigger pipeline writes audit records via trigger.
-- SELECT is kept: for auditing and reporting queries.

REVOKE UPDATE, DELETE ON facturas.audit_log FROM service_role;
