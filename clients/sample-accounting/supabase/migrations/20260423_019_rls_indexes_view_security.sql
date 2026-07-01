-- =============================================================================
-- Migration 019: RLS, FK Indexes, View Security Patch
-- Fixes gaps from migrations 011-018:
--   - RLS + service_role policies on 14 tables that lacked them
--   - FK indexes missing from accounting_classifications and document_profiles
--   - Recreate v_aging_report and v_cash_flow with security_invoker = true
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RLS: ocr_documents (RLS was commented out in 011)
-- ---------------------------------------------------------------------------
alter table facturas.ocr_documents enable row level security;

create policy "service_role_select" on facturas.ocr_documents
  for select to service_role using (true);
create policy "service_role_all" on facturas.ocr_documents
  for all to service_role using (true);

-- ---------------------------------------------------------------------------
-- RLS: extraction_runs (RLS was commented out in 012)
-- ---------------------------------------------------------------------------
alter table facturas.extraction_runs enable row level security;

create policy "service_role_select" on facturas.extraction_runs
  for select to service_role using (true);
create policy "service_role_all" on facturas.extraction_runs
  for all to service_role using (true);

-- ---------------------------------------------------------------------------
-- RLS: supplier_aliases, supplier_resolution_log (014 — no RLS)
-- ---------------------------------------------------------------------------
alter table facturas.supplier_aliases enable row level security;

create policy "service_role_select" on facturas.supplier_aliases
  for select to service_role using (true);
create policy "service_role_all" on facturas.supplier_aliases
  for all to service_role using (true);

alter table facturas.supplier_resolution_log enable row level security;

create policy "service_role_select" on facturas.supplier_resolution_log
  for select to service_role using (true);
create policy "service_role_all" on facturas.supplier_resolution_log
  for all to service_role using (true);

-- ---------------------------------------------------------------------------
-- RLS: tax_code_patterns, invoice_taxes (015 — no RLS)
-- ---------------------------------------------------------------------------
alter table facturas.tax_code_patterns enable row level security;

create policy "service_role_select" on facturas.tax_code_patterns
  for select to service_role using (true);
create policy "service_role_all" on facturas.tax_code_patterns
  for all to service_role using (true);

alter table facturas.invoice_taxes enable row level security;

create policy "service_role_select" on facturas.invoice_taxes
  for select to service_role using (true);
create policy "service_role_all" on facturas.invoice_taxes
  for all to service_role using (true);

-- ---------------------------------------------------------------------------
-- RLS: validation_results, review_queue, normalization_rules (016 — no RLS)
-- ---------------------------------------------------------------------------
alter table facturas.validation_results enable row level security;

create policy "service_role_select" on facturas.validation_results
  for select to service_role using (true);
create policy "service_role_all" on facturas.validation_results
  for all to service_role using (true);

alter table facturas.review_queue enable row level security;

create policy "service_role_select" on facturas.review_queue
  for select to service_role using (true);
create policy "service_role_all" on facturas.review_queue
  for all to service_role using (true);

alter table facturas.normalization_rules enable row level security;

create policy "service_role_select" on facturas.normalization_rules
  for select to service_role using (true);
create policy "service_role_all" on facturas.normalization_rules
  for all to service_role using (true);

-- ---------------------------------------------------------------------------
-- RLS: gl_accounts, categories, accounting_classifications, document_profiles (017 — no RLS)
-- ---------------------------------------------------------------------------
alter table facturas.gl_accounts enable row level security;

create policy "service_role_select" on facturas.gl_accounts
  for select to service_role using (true);
create policy "service_role_all" on facturas.gl_accounts
  for all to service_role using (true);

alter table facturas.categories enable row level security;

create policy "service_role_select" on facturas.categories
  for select to service_role using (true);
create policy "service_role_all" on facturas.categories
  for all to service_role using (true);

alter table facturas.accounting_classifications enable row level security;

create policy "service_role_select" on facturas.accounting_classifications
  for select to service_role using (true);
create policy "service_role_all" on facturas.accounting_classifications
  for all to service_role using (true);

alter table facturas.document_profiles enable row level security;

create policy "service_role_select" on facturas.document_profiles
  for select to service_role using (true);
create policy "service_role_all" on facturas.document_profiles
  for all to service_role using (true);

-- ---------------------------------------------------------------------------
-- RLS: payments (018 — no RLS)
-- ---------------------------------------------------------------------------
alter table facturas.payments enable row level security;

create policy "service_role_select" on facturas.payments
  for select to service_role using (true);
create policy "service_role_all" on facturas.payments
  for all to service_role using (true);

-- ---------------------------------------------------------------------------
-- FK Indexes: accounting_classifications (missing gl_account_id, category_id)
-- ---------------------------------------------------------------------------
create index if not exists idx_accounting_classifications_gl_account_id
  on facturas.accounting_classifications (gl_account_id);

create index if not exists idx_accounting_classifications_category_id
  on facturas.accounting_classifications (category_id);

-- ---------------------------------------------------------------------------
-- FK Indexes: document_profiles (missing gl_account_id, category_id)
-- ---------------------------------------------------------------------------
create index if not exists idx_document_profiles_gl_account_id
  on facturas.document_profiles (gl_account_id);

create index if not exists idx_document_profiles_category_id
  on facturas.document_profiles (category_id);

-- ---------------------------------------------------------------------------
-- Views: recrear con security_invoker = true
-- ---------------------------------------------------------------------------
-- NOTE: aging bucket uses due_date (not issue_date) — correct for AR aging
create or replace view facturas.v_aging_report
  with (security_invoker = true) as
select
  case
    when now()::date - i.due_date <= 30 then 'current'
    when now()::date - i.due_date <= 60 then 'overdue-30'
    when now()::date - i.due_date <= 90 then 'overdue-60'
    else 'overdue-90'
  end                              as bucket,
  count(*)                         as invoice_count,
  coalesce(sum(i.amount_due), 0)   as total_amount_due
from facturas.invoices i
where i.payment_status in ('unpaid', 'partial')
  and i.processing_status = 'ok'
  and i.due_date is not null
group by 1
order by 1;

create or replace view facturas.v_cash_flow
  with (security_invoker = true) as
select
  date_trunc('month', i.issue_date)::date as month,
  count(*)                                as invoice_count,
  coalesce(sum(i.total_with_vat), 0)      as total_outflow
from facturas.invoices i
where i.processing_status = 'ok'
group by 1
order by 1 desc;
