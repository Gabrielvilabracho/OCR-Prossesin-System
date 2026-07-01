-- Migration: 20260507_032_fix_rls_missing_tables
-- Fix: Habilitar RLS en 5 tablas expuestas + políticas correctas
-- Applied: 2026-05-07

-- 1. invoice_reviews
ALTER TABLE facturas.invoice_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_reviews_service_role_all"
  ON facturas.invoice_reviews FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "invoice_reviews_staff_select"
  ON facturas.invoice_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM facturas.noxx_staff
    WHERE noxx_staff.id = auth.uid() AND noxx_staff.active = true
  ));

CREATE POLICY "invoice_reviews_staff_insert"
  ON facturas.invoice_reviews FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM facturas.noxx_staff
    WHERE noxx_staff.id = auth.uid()
      AND noxx_staff.active = true
      AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
  ));

-- 2. supplier_categories
ALTER TABLE facturas.supplier_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_categories_service_role_all"
  ON facturas.supplier_categories FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "supplier_categories_staff_select"
  ON facturas.supplier_categories FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM facturas.noxx_staff
    WHERE noxx_staff.id = auth.uid() AND noxx_staff.active = true
  ));

-- 3. suppliers
ALTER TABLE facturas.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_service_role_all"
  ON facturas.suppliers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "suppliers_staff_select"
  ON facturas.suppliers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM facturas.noxx_staff
    WHERE noxx_staff.id = auth.uid() AND noxx_staff.active = true
  ));

CREATE POLICY "suppliers_admin_write"
  ON facturas.suppliers FOR ALL TO authenticated
  USING (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role)
  WITH CHECK (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role);

-- 4. invoice_items
ALTER TABLE facturas.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_service_role_all"
  ON facturas.invoice_items FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "invoice_items_staff_select"
  ON facturas.invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM facturas.noxx_staff
    WHERE noxx_staff.id = auth.uid() AND noxx_staff.active = true
  ));

CREATE POLICY "invoice_items_staff_update"
  ON facturas.invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM facturas.noxx_staff
    WHERE noxx_staff.id = auth.uid()
      AND noxx_staff.active = true
      AND noxx_staff.role = ANY (ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role])
  ));

-- 5. source_client_map
ALTER TABLE facturas.source_client_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_client_map_service_role_all"
  ON facturas.source_client_map FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "source_client_map_admin_all"
  ON facturas.source_client_map FOR ALL TO authenticated
  USING (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role)
  WITH CHECK (facturas.get_staff_role(auth.uid()) = 'admin'::facturas.staff_role);
