-- Migration 024b: Fix SECURITY DEFINER function — add SET search_path
-- SECURITY DEFINER functions without a fixed search_path can be exploited
-- via search_path hijacking (Supabase security advisor finding).
-- Adding SET search_path = facturas, public pins the search path and
-- eliminates the attack vector.

CREATE OR REPLACE FUNCTION facturas.audit_invoice_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = facturas, public
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
