-- Migration: 20260422_010_organizations
-- Description: Add organizations table and link noxx_clients to organizations
-- Schema: facturas
-- Depends on: 20260421_009_rename_and_complete
--
-- Purpose: Support multi-tenant grouping of noxx_clients under a parent organization.
--          organization_id is nullable — existing clients remain unaffected.
--
-- Rollback:
--   drop index if exists facturas.idx_noxx_clients_organization_id;
--   alter table facturas.noxx_clients drop column if exists organization_id;
--   drop table if exists facturas.organizations;

-- ============================================================
-- TABLE: facturas.organizations
-- One row per organization (parent entity grouping noxx_clients)
-- ============================================================
create table if not exists facturas.organizations (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  nif         text        unique,
  country     text        not null default 'PT',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ALTER: facturas.noxx_clients
-- Add organization_id — nullable for backward compatibility
-- ============================================================
alter table facturas.noxx_clients
  add column if not exists organization_id uuid references facturas.organizations(id);

create index if not exists idx_noxx_clients_organization_id
  on facturas.noxx_clients (organization_id);

-- ============================================================
-- RLS: enable row level security on organizations
-- REQ-1.1: RLS must be enabled on all tables in exposed schemas.
-- service_role_select policy grants full read access to the service role.
-- ============================================================
alter table facturas.organizations enable row level security;

create policy "service_role_select" on facturas.organizations
  for select to service_role using (true);
