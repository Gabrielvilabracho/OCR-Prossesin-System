-- Migration 024: audit trigger on invoices
-- Automatically inserts into audit_log on INSERT/UPDATE of invoices
-- SECURITY DEFINER: runs with function owner privileges

CREATE OR REPLACE FUNCTION facturas.audit_invoice_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO facturas.audit_log(table_name, operation, row_id, old_data, new_data, changed_by)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::JSONB END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::JSONB END,
    current_setting('request.jwt.claims', true)::JSONB->>'sub'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_invoices ON facturas.invoices;
CREATE TRIGGER trg_audit_invoices
  AFTER INSERT OR UPDATE ON facturas.invoices
  FOR EACH ROW EXECUTE FUNCTION facturas.audit_invoice_changes();
