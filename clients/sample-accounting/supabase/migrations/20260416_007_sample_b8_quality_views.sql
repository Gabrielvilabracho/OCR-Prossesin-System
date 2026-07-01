-- Migration: 20260416_007_noxx_b8_quality_views
-- Description: B8 — 5 quality/observability views for NOXX extraction pipeline
-- Schema: facturas
-- Depends on: 20260416_006_noxx_b1_fields (for math_validation_result column)
--
-- KPI targets:
--   ok_rate      >= 85%
--   review_rate  <  10%
--   math_errors  =  0 in production
--
-- Rollback:
--   drop view if exists facturas.v_vat_mismatches;
--   drop view if exists facturas.v_missing_fields;
--   drop view if exists facturas.v_supplier_quality;
--   drop view if exists facturas.v_math_validation;
--   drop view if exists facturas.v_extraction_quality;

-- ============================================================
-- VIEW: v_extraction_quality
-- KPIs: ok_rate, review_rate, fail_rate per period
-- ============================================================
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
from facturas.prototype_invoices
group by date_trunc('day', created_at)
order by day desc;

-- ============================================================
-- VIEW: v_math_validation
-- Count of math errors by rule code (parsed from JSONB errors array)
-- ============================================================
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
from facturas.prototype_invoices i
cross join lateral jsonb_array_elements_text(
  coalesce(i.math_validation_result->'errors', '[]'::jsonb)
) as mv(error)
where (i.math_validation_result->>'valid') = 'false'
group by date_trunc('day', i.created_at)
order by day desc;

-- ============================================================
-- VIEW: v_supplier_quality
-- Error rate per supplier (requires_review + failed / total)
-- ============================================================
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
left join facturas.prototype_invoices i on i.supplier_id = s.id
group by s.nif, s.name, sc.name
having count(*) > 0
order by error_rate_pct desc nulls last;

-- ============================================================
-- VIEW: v_missing_fields
-- Frequency of NULL values per header column
-- ============================================================
create or replace view facturas.v_missing_fields as
with totals as (
  select count(*) as total from facturas.prototype_invoices
)
select
  field_name,
  null_count,
  totals.total,
  round(null_count::numeric / nullif(totals.total, 0) * 100, 2) as missing_pct
from (
  select 'receiver_name'  as field_name, count(*) filter (where receiver_name  is null) as null_count from facturas.prototype_invoices
  union all
  select 'receiver_nif',  count(*) filter (where receiver_nif   is null) from facturas.prototype_invoices
  union all
  select 'issuer_nif',    count(*) filter (where issuer_nif     is null) from facturas.prototype_invoices
  union all
  select 'issuer_name',   count(*) filter (where issuer_name    is null) from facturas.prototype_invoices
  union all
  select 'invoice_number',count(*) filter (where invoice_number is null) from facturas.prototype_invoices
  union all
  select 'issue_date',    count(*) filter (where issue_date     is null) from facturas.prototype_invoices
  union all
  select 'due_date',      count(*) filter (where due_date       is null) from facturas.prototype_invoices
  union all
  select 'currency',      count(*) filter (where currency       is null) from facturas.prototype_invoices
  union all
  select 'document_type', count(*) filter (where document_type  is null) from facturas.prototype_invoices
  union all
  select 'atcud',         count(*) filter (where atcud          is null) from facturas.prototype_invoices
) counts
cross join totals
order by missing_pct desc;

-- ============================================================
-- VIEW: v_vat_mismatches
-- Invoices with R5 or R6 math validation errors
-- ============================================================
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
from facturas.prototype_invoices i
left join facturas.suppliers s on s.id = i.supplier_id
cross join lateral jsonb_array_elements_text(
  coalesce(i.math_validation_result->'errors', '[]'::jsonb)
) as mv(error)
where mv.error like 'R5%' or mv.error like 'R6%'
order by i.created_at desc;
