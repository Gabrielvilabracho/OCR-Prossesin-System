-- =============================================================================
-- Migration 018: Payments + Reporting Views (TASK-4-2)
-- payments table, invoices payment columns, v_aging_report, v_cash_flow
-- =============================================================================

-- ---------------------------------------------------------------------------
-- payments — one row per payment event against an invoice
-- ---------------------------------------------------------------------------

create table if not exists facturas.payments (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references facturas.invoices(id) on delete cascade,
  amount_paid    numeric(12,2) not null,
  payment_date   date not null,
  payment_method text,
  reference      text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_payments_invoice_id on facturas.payments (invoice_id);

-- ---------------------------------------------------------------------------
-- Extend invoices: payment_status, amount_paid, amount_due
-- ---------------------------------------------------------------------------

alter table facturas.invoices
  add column if not exists payment_status text
    check (payment_status in ('unpaid','partial','paid')) default 'unpaid',
  add column if not exists amount_paid    numeric(12,2) default 0,
  add column if not exists amount_due     numeric(12,2);

-- ---------------------------------------------------------------------------
-- v_aging_report — AR aging buckets for unpaid/partial invoices
-- Buckets: current (0-30d), overdue-30 (31-60d), overdue-60 (61-90d), overdue-90 (90+d)
--
-- NOTE (REQ-4.4): The spec called for a document_status='approved' filter,
-- but document_status column is not implemented in this change scope.
-- document approval workflow is deferred. Filter uses processing_status='ok'
-- as the practical equivalent for this phase.
-- ---------------------------------------------------------------------------

create or replace view facturas.v_aging_report as
select
  case
    when now()::date - i.issue_date <= 30 then 'current'
    when now()::date - i.issue_date <= 60 then 'overdue-30'
    when now()::date - i.issue_date <= 90 then 'overdue-60'
    else 'overdue-90'
  end                              as bucket,
  count(*)                         as invoice_count,
  coalesce(sum(i.amount_due), 0)   as total_amount_due
from facturas.invoices i
where i.payment_status in ('unpaid', 'partial')
  and i.processing_status = 'ok'
  -- DEFERRED: and i.document_status = 'approved' (document approval workflow not yet implemented)
group by 1
order by 1;

-- ---------------------------------------------------------------------------
-- v_cash_flow — monthly outflow summary for approved invoices
--
-- NOTE (REQ-4.5): The spec called for a document_status='approved' filter,
-- but document_status column is not implemented in this change scope.
-- document approval workflow is deferred. Filter uses processing_status='ok'
-- as the practical equivalent for this phase.
-- ---------------------------------------------------------------------------

create or replace view facturas.v_cash_flow as
select
  date_trunc('month', i.issue_date)::date as month,
  count(*)                                as invoice_count,
  coalesce(sum(i.total_with_vat), 0)      as total_outflow
from facturas.invoices i
where i.processing_status = 'ok'
  -- DEFERRED: and i.document_status = 'approved' (document approval workflow not yet implemented)
group by 1
order by 1 desc;
