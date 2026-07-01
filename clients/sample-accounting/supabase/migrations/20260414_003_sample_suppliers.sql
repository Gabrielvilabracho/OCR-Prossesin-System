-- Migration: 20260414_003_noxx_suppliers
-- Description: Supplier entity with categorization for NOXX prototype
-- Schema: facturas
-- Tables: facturas.supplier_categories, facturas.suppliers

-- ============================================================
-- TABLE: facturas.supplier_categories
-- ============================================================
create table if not exists facturas.supplier_categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  slug        text        not null unique,
  description text,
  created_at  timestamptz not null default now()
);

-- Seed: 10 base categories (PT-focused)
insert into facturas.supplier_categories (name, slug) values
  ('Utilities',       'utilities'),
  ('Rent',            'rent'),
  ('Software / SaaS', 'software-saas'),
  ('Food Supplier',   'food-supplier'),
  ('Maintenance',     'maintenance'),
  ('Legal',           'legal'),
  ('Accounting',      'accounting'),
  ('Logistics',       'logistics'),
  ('Marketing',       'marketing'),
  ('Other',           'other')
on conflict (slug) do nothing;

-- ============================================================
-- TABLE: facturas.suppliers
-- NIF is the natural key for Portuguese suppliers (9 digits)
-- ============================================================
create table if not exists facturas.suppliers (
  id           uuid        primary key default gen_random_uuid(),
  nif          text        not null unique,
  name         text        not null,
  category_id  uuid        references facturas.supplier_categories(id),
  subcategory  text,
  country      text        not null default 'PT',
  email        text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_suppliers_nif
  on facturas.suppliers (nif);

create index if not exists idx_suppliers_category_id
  on facturas.suppliers (category_id);

-- Reuse existing set_updated_at function
create or replace trigger trg_suppliers_updated_at
  before update on facturas.suppliers
  for each row execute function facturas.set_updated_at();
