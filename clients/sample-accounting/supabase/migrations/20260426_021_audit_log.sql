-- Migration 021: audit_log table
-- INSERT-only, immutable audit trail per GDPR compliance
-- No UPDATE/DELETE policies — by design

CREATE TABLE IF NOT EXISTS facturas.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  row_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT
);

ALTER TABLE facturas.audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT-only for service_role. No UPDATE, no DELETE policies.
CREATE POLICY audit_log_insert ON facturas.audit_log
  FOR INSERT TO service_role WITH CHECK (true);
