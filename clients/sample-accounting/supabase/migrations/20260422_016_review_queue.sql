-- Migration 016: validation_results + review_queue + normalization_rules
-- Phase 3 — Intelligence Layer

-- ============================================================
-- validation_results — per-rule traceability (replaces math_validation_result JSONB)
-- ============================================================
create table if not exists facturas.validation_results (
  id               uuid  primary key default gen_random_uuid(),
  invoice_id       uuid  not null references facturas.invoices(id) on delete cascade,
  rule_code        text  not null,
  rule_description text,
  passed           boolean not null,
  detail           text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_validation_results_invoice_id on facturas.validation_results (invoice_id);
create index if not exists idx_validation_results_rule_code  on facturas.validation_results (rule_code);

-- ============================================================
-- review_queue — structured review entries (replaces review_reason text)
-- ============================================================
create table if not exists facturas.review_queue (
  id               uuid  primary key default gen_random_uuid(),
  invoice_id       uuid  not null references facturas.invoices(id) on delete cascade,
  reason_code      text  not null check (reason_code in (
                     'vat_invalid','supplier_unresolved','math_mismatch',
                     'first_time_supplier','amount_above_threshold','low_confidence')),
  priority         integer not null check (priority in (1,2,3)),
  status           text  not null check (status in ('pending','in_review','resolved','auto_resolved'))
                         default 'pending',
  assigned_to      text,
  resolved_at      timestamptz,
  resolution_notes text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_review_queue_invoice_id on facturas.review_queue (invoice_id);
create index if not exists idx_review_queue_status     on facturas.review_queue (status);
create index if not exists idx_review_queue_priority   on facturas.review_queue (priority);

-- ============================================================
-- normalization_rules — configurable routing rules
-- ============================================================
create table if not exists facturas.normalization_rules (
  id             uuid  primary key default gen_random_uuid(),
  rule_type      text  not null,
  condition_json jsonb not null,
  action         text  not null check (action in ('auto_accept','review','reject')),
  priority       integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
