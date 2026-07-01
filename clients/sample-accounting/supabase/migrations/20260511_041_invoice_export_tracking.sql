-- Migration: invoice_export_tracking
-- Adds export metadata columns to facturas.invoices
-- and RLS UPDATE policy for admin/operator roles

ALTER TABLE facturas.invoices
  ADD COLUMN exported_at timestamptz NULL,
  ADD COLUMN export_format text NULL
    CHECK (export_format IN ('csv', 'xml', 'qr_pdf'));

-- RLS: export tracking columns are covered by existing invoices_portal_update policy
-- which already allows admin and operator to UPDATE invoices (noxx_staff.id = auth.uid())
-- No new policy needed.
