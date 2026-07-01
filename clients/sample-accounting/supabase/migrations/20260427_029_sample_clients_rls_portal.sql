-- Migration 029: RLS policies for noxx_clients portal access
-- Portal staff can SELECT all clients. Operators can UPDATE their assigned clients.
-- Admin can UPDATE all clients. INSERT requires staff role.
--
-- Depends on: 20260427_028_audit_log_staff_user

-- Enable RLS on noxx_clients (noxx_staff already has RLS from migration 026)
ALTER TABLE facturas.noxx_clients ENABLE ROW LEVEL SECURITY;

-- Policy: staff (any role) can SELECT any client
CREATE POLICY clients_select_staff ON facturas.noxx_clients
  FOR SELECT TO authenticated
  USING (facturas.get_staff_role(auth.uid()) IS NOT NULL);

-- Policy: staff (any role) can INSERT clients
CREATE POLICY clients_insert_staff ON facturas.noxx_clients
  FOR INSERT TO authenticated
  WITH CHECK (facturas.get_staff_role(auth.uid()) IS NOT NULL);

-- Policy: admin can UPDATE any client
CREATE POLICY clients_update_admin ON facturas.noxx_clients
  FOR UPDATE TO authenticated
  USING (facturas.get_staff_role(auth.uid()) = 'admin')
  WITH CHECK (facturas.get_staff_role(auth.uid()) = 'admin');

-- Policy: operator can UPDATE only their assigned clients (account_manager = auth.uid())
CREATE POLICY clients_update_operator_own ON facturas.noxx_clients
  FOR UPDATE TO authenticated
  USING (
    facturas.get_staff_role(auth.uid()) = 'operator'
    AND account_manager = auth.uid()
  )
  WITH CHECK (
    facturas.get_staff_role(auth.uid()) = 'operator'
    AND account_manager = auth.uid()
  );
