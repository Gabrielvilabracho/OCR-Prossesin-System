-- Migration: 038_update_staff_role_enum
-- Motivo: Reemplazar enum staff_role ('admin','operator','viewer') por ('admin','operator','developer')
-- Precondición verificada: no hay usuarios con rol 'viewer'
-- Estrategia: DROP policies + función dependientes → swap enum → recrear función → recrear policies

-- Step 1: Drop all policies that depend on staff_role type
DROP POLICY IF EXISTS audit_log_portal_select ON facturas.audit_log;
DROP POLICY IF EXISTS invoice_approvals_insert ON facturas.invoice_approvals;
DROP POLICY IF EXISTS invoice_items_staff_update ON facturas.invoice_items;
DROP POLICY IF EXISTS invoice_reviews_staff_insert ON facturas.invoice_reviews;
DROP POLICY IF EXISTS invoices_portal_update ON facturas.invoices;
DROP POLICY IF EXISTS clients_insert_staff ON facturas.noxx_clients;
DROP POLICY IF EXISTS clients_select_staff ON facturas.noxx_clients;
DROP POLICY IF EXISTS clients_update_admin ON facturas.noxx_clients;
DROP POLICY IF EXISTS clients_update_operator_own ON facturas.noxx_clients;
DROP POLICY IF EXISTS staff_insert_admin ON facturas.noxx_staff;
DROP POLICY IF EXISTS staff_select_admin ON facturas.noxx_staff;
DROP POLICY IF EXISTS staff_update_admin ON facturas.noxx_staff;
DROP POLICY IF EXISTS storage_noxx_invoices_insert ON storage.objects;
DROP POLICY IF EXISTS product_catalog_operator_write ON facturas.product_catalog;
DROP POLICY IF EXISTS review_queue_portal_update ON facturas.review_queue;
DROP POLICY IF EXISTS source_client_map_admin_all ON facturas.source_client_map;
DROP POLICY IF EXISTS suppliers_admin_write ON facturas.suppliers;
DROP POLICY IF EXISTS upload_batches_insert ON facturas.upload_batches;
DROP POLICY IF EXISTS upload_batches_update ON facturas.upload_batches;

-- Step 2: Drop the function that depends on the type
DROP FUNCTION IF EXISTS facturas.get_staff_role(uuid);

-- Step 3: Swap the enum type
ALTER TYPE facturas.staff_role RENAME TO staff_role_old;
CREATE TYPE facturas.staff_role AS ENUM ('admin', 'operator', 'developer');
ALTER TABLE facturas.noxx_staff
  ALTER COLUMN role TYPE facturas.staff_role
  USING role::text::facturas.staff_role;
DROP TYPE facturas.staff_role_old;

-- Step 4: Recreate the function with the new type
CREATE OR REPLACE FUNCTION facturas.get_staff_role(user_id uuid)
RETURNS facturas.staff_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT role FROM facturas.noxx_staff WHERE id = user_id AND active = true LIMIT 1;
$$;

-- Step 5: Recreate all policies
CREATE POLICY audit_log_portal_select ON facturas.audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = 'admin'::facturas.staff_role
    )
  );

CREATE POLICY invoice_approvals_insert ON facturas.invoice_approvals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );

CREATE POLICY invoice_items_staff_update ON facturas.invoice_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );

CREATE POLICY invoice_reviews_staff_insert ON facturas.invoice_reviews
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );

CREATE POLICY invoices_portal_update ON facturas.invoices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );

CREATE POLICY clients_insert_staff ON facturas.noxx_clients
  FOR INSERT WITH CHECK (
    facturas.get_staff_role(auth.uid()) = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
  );

CREATE POLICY clients_select_staff ON facturas.noxx_clients
  FOR SELECT USING (
    facturas.get_staff_role(auth.uid()) IS NOT NULL
  );

CREATE POLICY clients_update_admin ON facturas.noxx_clients
  FOR UPDATE USING (
    facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role
  );

CREATE POLICY clients_update_operator_own ON facturas.noxx_clients
  FOR UPDATE USING (
    facturas.get_staff_role(auth.uid()) = 'operator'::facturas.staff_role
    AND created_by = auth.uid()
  );

CREATE POLICY staff_insert_admin ON facturas.noxx_staff
  FOR INSERT WITH CHECK (
    facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role
  );

CREATE POLICY staff_select_admin ON facturas.noxx_staff
  FOR SELECT USING (
    facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role
  );

CREATE POLICY staff_update_admin ON facturas.noxx_staff
  FOR UPDATE USING (
    facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role
  );

CREATE POLICY storage_noxx_invoices_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'noxx-invoices'
    AND EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );

CREATE POLICY product_catalog_operator_write ON facturas.product_catalog
  FOR ALL
  USING (facturas.get_staff_role(auth.uid()) = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role]))
  WITH CHECK (facturas.get_staff_role(auth.uid()) = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role]));

CREATE POLICY review_queue_portal_update ON facturas.review_queue
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );

CREATE POLICY source_client_map_admin_all ON facturas.source_client_map
  FOR ALL
  USING (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role)
  WITH CHECK (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role);

CREATE POLICY suppliers_admin_write ON facturas.suppliers
  FOR ALL
  USING (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role)
  WITH CHECK (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role);

CREATE POLICY upload_batches_insert ON facturas.upload_batches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );

CREATE POLICY upload_batches_update ON facturas.upload_batches
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM facturas.noxx_staff
      WHERE noxx_staff.id = auth.uid()
        AND noxx_staff.active = true
        AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
    )
  );
