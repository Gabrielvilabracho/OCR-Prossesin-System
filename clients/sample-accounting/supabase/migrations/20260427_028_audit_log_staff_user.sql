-- Migration 028: Add staff_user_id to audit_log + audit triggers on noxx_clients/noxx_staff
-- Links audit log entries to the portal staff user who triggered the change.
-- Triggers capture all INSERT/UPDATE/DELETE on the two portal tables.
--
-- Depends on: 20260427_027_noxx_clients_redesign

-- Add staff_user_id column to audit_log
ALTER TABLE facturas.audit_log
  ADD COLUMN IF NOT EXISTS staff_user_id uuid;

-- Index for filtering audit logs by staff user
CREATE INDEX IF NOT EXISTS idx_audit_log_staff_user_id
  ON facturas.audit_log (staff_user_id);

-- Audit trigger function: captures operation + row changes with staff_user_id from auth.uid()
CREATE OR REPLACE FUNCTION facturas.audit_noxx_portal_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = facturas
AS $$
BEGIN
  INSERT INTO facturas.audit_log (
    table_name,
    operation,
    row_id,
    old_data,
    new_data,
    user_id,
    staff_user_id,
    created_at
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid(),
    auth.uid(),
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Audit trigger on noxx_clients
DROP TRIGGER IF EXISTS trg_audit_noxx_clients ON facturas.noxx_clients;
CREATE TRIGGER trg_audit_noxx_clients
  AFTER INSERT OR UPDATE OR DELETE ON facturas.noxx_clients
  FOR EACH ROW EXECUTE FUNCTION facturas.audit_noxx_portal_changes();

-- Audit trigger on noxx_staff
DROP TRIGGER IF EXISTS trg_audit_noxx_staff ON facturas.noxx_staff;
CREATE TRIGGER trg_audit_noxx_staff
  AFTER INSERT OR UPDATE OR DELETE ON facturas.noxx_staff
  FOR EACH ROW EXECUTE FUNCTION facturas.audit_noxx_portal_changes();
