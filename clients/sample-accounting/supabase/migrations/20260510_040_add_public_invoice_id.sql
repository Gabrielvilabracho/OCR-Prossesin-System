-- Migration: 040_add_public_invoice_id
-- Motivo: Identificador público estable para permalinks de facturas.
--         Hoy las rutas usan el UUID interno — si una factura se reprocesa o mueve,
--         el link se rompe. public_invoice_id nunca cambia y es seguro de exponer en URLs.
-- Formato: INV-{YYYY}-{NNNNN} — secuencia global no reinicia por año (evita duplicados)
-- Impacto: 129 filas existentes reciben backfill automático basado en created_at

-- Secuencia global (no reinicia por año — evita duplicados)
CREATE SEQUENCE IF NOT EXISTS facturas.invoice_public_id_seq START 1;

-- Agregar columna nullable primero para poder hacer backfill
ALTER TABLE facturas.invoices
  ADD COLUMN public_invoice_id text;

-- Backfill de filas existentes (usa created_at para preservar el año correcto)
UPDATE facturas.invoices
SET public_invoice_id = 'INV-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('facturas.invoice_public_id_seq')::text, 5, '0')
WHERE public_invoice_id IS NULL;

-- Aplicar NOT NULL + UNIQUE + DEFAULT para futuros inserts
ALTER TABLE facturas.invoices
  ALTER COLUMN public_invoice_id SET NOT NULL,
  ALTER COLUMN public_invoice_id SET DEFAULT 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('facturas.invoice_public_id_seq')::text, 5, '0'),
  ADD CONSTRAINT invoices_public_invoice_id_unique UNIQUE (public_invoice_id);

-- Índice para búsquedas por permalink
CREATE INDEX ON facturas.invoices (public_invoice_id);
