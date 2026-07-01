-- Migration: 20260414_004_noxx_invoice_items
-- Description: Invoice line items + supplier_id on prototype_invoices
-- Schema: facturas
-- Depends on: 20260414_003_noxx_suppliers.sql

-- ============================================================
-- ALTER: facturas.prototype_invoices
-- supplier_id is nullable for backwards compatibility with v2 data
-- ============================================================
alter table facturas.prototype_invoices
  add column if not exists supplier_id      uuid references facturas.suppliers(id),
  add column if not exists payment_due_date date;

create index if not exists idx_invoices_supplier_id
  on facturas.prototype_invoices (supplier_id);

-- ============================================================
-- TABLE: facturas.invoice_items
-- ON DELETE CASCADE: items are meaningless without their invoice
-- supplier_id is denormalized for efficient analytics joins
-- vat_rate: PT valid values: 0, 6, 13, 23 (%)
-- ============================================================
create table if not exists facturas.invoice_items (
  id           uuid          primary key default gen_random_uuid(),
  invoice_id   uuid          not null references facturas.prototype_invoices(id) on delete cascade,
  supplier_id  uuid          not null references facturas.suppliers(id),
  line_number  int           not null,
  description  text          not null,
  quantity     numeric(12,4),
  unit_price   numeric(12,4),
  net_amount   numeric(12,2) not null,
  vat_rate     numeric(5,2),
  vat_amount   numeric(12,2),
  gross_amount numeric(12,2) not null,
  created_at   timestamptz   not null default now()
);

create index if not exists idx_invoice_items_invoice_id
  on facturas.invoice_items (invoice_id);

create index if not exists idx_invoice_items_supplier_id
  on facturas.invoice_items (supplier_id);

create index if not exists idx_invoice_items_vat_rate
  on facturas.invoice_items (vat_rate);

-- ============================================================
-- VIEW: facturas.v_supplier_totals
-- Aggregates invoice totals per supplier (only 'ok' invoices)
-- ============================================================
create or replace view facturas.v_supplier_totals as
select
  s.id                          as supplier_id,
  s.nif,
  s.name                        as supplier_name,
  sc.name                       as category,
  sc.slug                       as category_slug,
  s.subcategory,
  s.country,
  count(distinct i.id)          as invoice_count,
  coalesce(sum(i.total_without_vat), 0) as total_net,
  coalesce(sum(i.vat_total), 0)         as total_vat,
  coalesce(sum(i.total_with_vat), 0)    as total_gross,
  min(i.issue_date)             as first_invoice_date,
  max(i.issue_date)             as last_invoice_date
from facturas.suppliers s
left join facturas.supplier_categories sc on sc.id = s.category_id
left join facturas.prototype_invoices i
  on i.supplier_id = s.id
  and i.processing_status = 'ok'
group by s.id, s.nif, s.name, sc.name, sc.slug, s.subcategory, s.country;

-- ============================================================
-- VIEW: facturas.v_items_by_category
-- Aggregates item spending per category/supplier/description
-- ============================================================
create or replace view facturas.v_items_by_category as
select
  sc.slug                       as category_slug,
  sc.name                       as category,
  s.nif                         as supplier_nif,
  s.name                        as supplier_name,
  ii.description,
  ii.vat_rate,
  count(*)                      as occurrences,
  sum(ii.net_amount)            as total_net,
  coalesce(sum(ii.vat_amount), 0) as total_vat,
  sum(ii.gross_amount)          as total_gross,
  round(avg(ii.gross_amount), 2) as avg_gross_per_occurrence
from facturas.invoice_items ii
join facturas.suppliers s         on s.id = ii.supplier_id
left join facturas.supplier_categories sc on sc.id = s.category_id
group by sc.slug, sc.name, s.nif, s.name, ii.description, ii.vat_rate
order by total_gross desc;
