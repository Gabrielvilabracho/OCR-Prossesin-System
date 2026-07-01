-- Migration: 20260421_009_rename_and_complete
-- Description: Rename prototype_ tables to production names, complete invoice schema
-- Schema: facturas
-- Depends on: 20260421_008_noxx_clients
--
-- Decision: payment_due_date (mig 004) and due_date (mig 006) are the same field
--           semantically (data de vencimento/pagamento). TypeScript code uses due_date only.
--           payment_due_date is dropped here — consolidation to due_date.
--
-- Order:
--   1. RENAME TABLE prototype_invoices → invoices (FK targets update automatically in Postgres)
--   2. RENAME TABLE prototype_invoice_reviews → invoice_reviews
--   3. RENAME COLUMN efactura_mock_result → efactura_result
--   4. DROP redundant column payment_due_date (consolidated into due_date)
--   5. ADD new observability columns
--   6. CREATE performance indexes
--   7. DROP + recreate the 7 views pointing to facturas.invoices
--
-- Rollback:
--   -- NOTE: Rollback requires restoring views pointing to prototype_invoices,
--   -- re-adding payment_due_date, and renaming tables back. Full rollback:
--   drop view if exists facturas.v_items_by_category;
--   drop view if exists facturas.v_supplier_totals;
--   drop view if exists facturas.v_vat_mismatches;
--   drop view if exists facturas.v_missing_fields;
--   drop view if exists facturas.v_supplier_quality;
--   drop view if exists facturas.v_math_validation;
--   drop view if exists facturas.v_extraction_quality;
--   alter table facturas.invoices rename column efactura_result to efactura_mock_result;
--   alter table facturas.invoices
--     drop column if exists storage_path,
--     drop column if exists field_confidence,
--     drop column if exists extractor_version,
--     drop column if exists prompt_hash,
--     drop column if exists processing_time_ms,
--     drop column if exists raw_ocr_text,
--     add column if not exists payment_due_date date;
--   alter table facturas.invoice_reviews rename to prototype_invoice_reviews;
--   alter table facturas.invoices rename to prototype_invoices;
--   -- Then recreate views pointing to prototype_invoices.

-- ============================================================
-- 1. RENAME TABLES
-- Postgres automatically updates all FK references on rename.
-- ============================================================
alter table facturas.prototype_invoices       rename to invoices;
alter table facturas.prototype_invoice_reviews rename to invoice_reviews;

-- ============================================================
-- 2. RENAME COLUMN
-- ============================================================
alter table facturas.invoices rename column efactura_mock_result to efactura_result;

-- ============================================================
-- 3. DROP redundant column (consolidated into due_date from mig 006)
-- ============================================================
alter table facturas.invoices drop column if exists payment_due_date;

-- ============================================================
-- 4. ADD new observability columns (all nullable)
-- ============================================================
alter table facturas.invoices
  add column if not exists storage_path        text,
  add column if not exists field_confidence    jsonb,
  add column if not exists extractor_version   text,
  add column if not exists prompt_hash         text,
  add column if not exists processing_time_ms  bigint,
  add column if not exists raw_ocr_text        text;

-- ============================================================
-- 5. CREATE performance indexes
-- ============================================================
create index if not exists idx_invoices_processing_status
  on facturas.invoices (processing_status);

create index if not exists idx_invoices_issue_date
  on facturas.invoices (issue_date);

create index if not exists idx_invoices_created_at
  on facturas.invoices (created_at);

-- ============================================================
-- 6. RECREATE views — DROP first, then CREATE OR REPLACE
--    All 7 views now point to facturas.invoices
-- ============================================================

-- v_extraction_quality
create or replace view facturas.v_extraction_quality as
select
  date_trunc('day', created_at)                                      as day,
  count(*)                                                           as total,
  count(*) filter (where processing_status = 'ok')                   as ok_count,
  count(*) filter (where processing_status = 'requires_review')      as review_count,
  count(*) filter (where processing_status = 'failed')               as fail_count,
  count(*) filter (where processing_status = 'duplicado')            as duplicate_count,
  round(
    count(*) filter (where processing_status = 'ok')::numeric
    / nullif(count(*), 0) * 100, 2
  )                                                                   as ok_rate,
  round(
    count(*) filter (where processing_status = 'requires_review')::numeric
    / nullif(count(*), 0) * 100, 2
  )                                                                   as review_rate,
  round(
    count(*) filter (where processing_status = 'failed')::numeric
    / nullif(count(*), 0) * 100, 2
  )                                                                   as fail_rate
from facturas.invoices
group by date_trunc('day', created_at)
order by day desc;

-- v_math_validation
create or replace view facturas.v_math_validation as
select
  date_trunc('day', i.created_at)                          as day,
  count(*)                                                  as invoices_with_math_errors,
  count(*) filter (where mv.error like 'R1%')              as r1_total_integrity,
  count(*) filter (where mv.error like 'R2%')              as r2_items_sum,
  count(*) filter (where mv.error like 'R3%')              as r3_vat_sum,
  count(*) filter (where mv.error like 'R4%')              as r4_line_coherence,
  count(*) filter (where mv.error like 'R5%')              as r5_breakdown_mismatch,
  count(*) filter (where mv.error like 'R6%')              as r6_invalid_vat_rate,
  count(*) filter (where mv.error like 'R7%')              as r7_credit_note
from facturas.invoices i
cross join lateral jsonb_array_elements_text(
  coalesce(i.math_validation_result->'errors', '[]'::jsonb)
) as mv(error)
where (i.math_validation_result->>'valid') = 'false'
group by date_trunc('day', i.created_at)
order by day desc;

-- v_supplier_quality
create or replace view facturas.v_supplier_quality as
select
  s.nif                                                         as supplier_nif,
  s.name                                                        as supplier_name,
  sc.name                                                       as category,
  count(*)                                                      as total_invoices,
  count(*) filter (where i.processing_status = 'ok')           as ok_count,
  count(*) filter (where i.processing_status = 'requires_review') as review_count,
  count(*) filter (where i.processing_status = 'failed')        as fail_count,
  round(
    (count(*) filter (where i.processing_status in ('requires_review', 'failed')))::numeric
    / nullif(count(*), 0) * 100, 2
  )                                                             as error_rate_pct
from facturas.suppliers s
left join facturas.supplier_categories sc on sc.id = s.category_id
left join facturas.invoices i on i.supplier_id = s.id
group by s.nif, s.name, sc.name
having count(*) > 0
order by error_rate_pct desc nulls last;

-- v_missing_fields
create or replace view facturas.v_missing_fields as
with totals as (
  select count(*) as total from facturas.invoices
)
select
  field_name,
  null_count,
  totals.total,
  round(null_count::numeric / nullif(totals.total, 0) * 100, 2) as missing_pct
from (
  select 'receiver_name'  as field_name, count(*) filter (where receiver_name  is null) as null_count from facturas.invoices
  union all
  select 'receiver_nif',  count(*) filter (where receiver_nif   is null) from facturas.invoices
  union all
  select 'issuer_nif',    count(*) filter (where issuer_nif     is null) from facturas.invoices
  union all
  select 'issuer_name',   count(*) filter (where issuer_name    is null) from facturas.invoices
  union all
  select 'invoice_number',count(*) filter (where invoice_number is null) from facturas.invoices
  union all
  select 'issue_date',    count(*) filter (where issue_date     is null) from facturas.invoices
  union all
  select 'due_date',      count(*) filter (where due_date       is null) from facturas.invoices
  union all
  select 'currency',      count(*) filter (where currency       is null) from facturas.invoices
  union all
  select 'document_type', count(*) filter (where document_type  is null) from facturas.invoices
  union all
  select 'atcud',         count(*) filter (where atcud          is null) from facturas.invoices
) counts
cross join totals
order by missing_pct desc;

-- v_vat_mismatches
create or replace view facturas.v_vat_mismatches as
select
  i.id,
  i.invoice_number,
  s.nif                                        as supplier_nif,
  s.name                                       as supplier_name,
  i.vat_total,
  i.processing_status,
  i.created_at,
  mv.error                                     as mismatch_detail
from facturas.invoices i
left join facturas.suppliers s on s.id = i.supplier_id
cross join lateral jsonb_array_elements_text(
  coalesce(i.math_validation_result->'errors', '[]'::jsonb)
) as mv(error)
where mv.error like 'R5%' or mv.error like 'R6%'
order by i.created_at desc;

-- v_supplier_totals
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
left join facturas.invoices i
  on i.supplier_id = s.id
  and i.processing_status = 'ok'
group by s.id, s.nif, s.name, sc.name, sc.slug, s.subcategory, s.country;

-- v_items_by_category
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
