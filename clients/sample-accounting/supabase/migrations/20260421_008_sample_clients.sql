-- Migration: 20260421_008_noxx_clients
-- Description: Client model — noxx_clients + source_client_map + client_id on prototype_invoices
-- Schema: facturas
-- Depends on: 20260416_007_noxx_b8_quality_views
--
-- Purpose: Associate invoices to NOXX clients dynamically via a source mapping table.
-- No backfill — existing prototype data keeps client_id = null. New data will always have it.
--
-- Rollback (run in reverse order):
--   drop index if exists facturas.idx_invoices_client_id;
--   alter table facturas.prototype_invoices drop column if exists client_id;
--   drop index if exists facturas.uix_source_client_map;
--   drop table if exists facturas.source_client_map;
--   drop trigger if exists trg_noxx_clients_updated_at on facturas.noxx_clients;
--   drop table if exists facturas.noxx_clients;

-- ============================================================
-- TABLE: facturas.noxx_clients
-- One row per NOXX client (company using the accounting platform)
-- ============================================================
create table if not exists facturas.noxx_clients (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  nif         text        unique,
  email       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- TRIGGER: auto-update updated_at on noxx_clients
-- Reuses the existing facturas.set_updated_at() function
-- ============================================================
create or replace trigger trg_noxx_clients_updated_at
  before update on facturas.noxx_clients
  for each row
  execute function facturas.set_updated_at();

-- ============================================================
-- TABLE: facturas.source_client_map
-- Maps a (source_type, source_ref) tuple to a client_id.
-- source_type: "drive" (folder ID) or "gmail" (user or label)
-- source_ref:  the specific Drive folder ID or Gmail identifier
-- ============================================================
create table if not exists facturas.source_client_map (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references facturas.noxx_clients(id) on delete cascade,
  source_type text        not null check (source_type in ('drive', 'gmail')),
  source_ref  text        not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists uix_source_client_map
  on facturas.source_client_map (source_type, source_ref);

-- ============================================================
-- ALTER: facturas.prototype_invoices
-- Add client_id — nullable so existing records are unaffected
-- ============================================================
alter table facturas.prototype_invoices
  add column if not exists client_id uuid references facturas.noxx_clients(id);

create index if not exists idx_invoices_client_id
  on facturas.prototype_invoices (client_id);
