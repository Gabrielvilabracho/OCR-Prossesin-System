-- Migration: 20260507_033_product_catalog
-- Catálogo de productos canónicos + mapeo en invoice_items
-- Applied: 2026-05-07

-- Tabla de productos canónicos
CREATE TABLE facturas.product_catalog (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text        NOT NULL,
    unit           text,
    category       text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_catalog_canonical_name_idx
    ON facturas.product_catalog (canonical_name);

CREATE TRIGGER set_product_catalog_updated_at
    BEFORE UPDATE ON facturas.product_catalog
    FOR EACH ROW EXECUTE FUNCTION facturas.set_updated_at();

-- RLS
ALTER TABLE facturas.product_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_catalog_service_role_all"
    ON facturas.product_catalog FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "product_catalog_staff_select"
    ON facturas.product_catalog FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM facturas.noxx_staff
        WHERE noxx_staff.id = auth.uid() AND noxx_staff.active = true
    ));

CREATE POLICY "product_catalog_operator_write"
    ON facturas.product_catalog FOR ALL TO authenticated
    USING (facturas.get_staff_role(auth.uid()) = ANY (
        ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role]
    ))
    WITH CHECK (facturas.get_staff_role(auth.uid()) = ANY (
        ARRAY['admin'::facturas.staff_role, 'operator'::facturas.staff_role]
    ));

-- Mapeo en invoice_items
ALTER TABLE facturas.invoice_items
    ADD COLUMN product_catalog_id uuid
        REFERENCES facturas.product_catalog(id)
        ON DELETE SET NULL;

CREATE INDEX invoice_items_product_catalog_id_idx
    ON facturas.invoice_items (product_catalog_id)
    WHERE product_catalog_id IS NOT NULL;
