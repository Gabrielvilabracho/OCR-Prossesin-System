-- =============================================================================
-- Migration 017: Accounting Layer (TASK-4-1)
-- gl_accounts, categories, accounting_classifications, document_profiles
-- SNC PT class 6 seed data included
-- =============================================================================

-- ---------------------------------------------------------------------------
-- gl_accounts (SNC PT — Sistema de Normalização Contabilística Portugal)
-- Self-referential: parent_code references gl_accounts(code)
-- ---------------------------------------------------------------------------

create table if not exists facturas.gl_accounts (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  description  text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  parent_code  text references facturas.gl_accounts(code),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists idx_gl_accounts_code         on facturas.gl_accounts (code);
create index if not exists idx_gl_accounts_account_type on facturas.gl_accounts (account_type);

-- ---------------------------------------------------------------------------
-- Seed: SNC PT class 6 — Gastos (Expenses)
-- Starting with parent nodes first to satisfy self-referential FK
-- ---------------------------------------------------------------------------

insert into facturas.gl_accounts (code, description, account_type, parent_code) values
  ('6',    'Gastos',                                          'expense', null),
  ('62',   'Fornecimentos e serviços externos',               'expense', '6'),
  ('621',  'Subcontratos',                                    'expense', '62'),
  ('622',  'Fornecimentos e serviços',                        'expense', '62'),
  ('6221', 'Trabalhos especializados',                        'expense', '622'),
  ('6222', 'Publicidade e propaganda',                        'expense', '622'),
  ('6223', 'Vigilância e segurança',                          'expense', '622'),
  ('6224', 'Honorários',                                      'expense', '622'),
  ('6225', 'Comissões',                                       'expense', '622'),
  ('6226', 'Conservação e reparação',                         'expense', '622'),
  ('6227', 'Limpeza, higiene e conforto',                     'expense', '622'),
  ('6228', 'Comunicação',                                     'expense', '622'),
  ('623',  'Materiais',                                       'expense', '62'),
  ('624',  'Energia e fluidos',                               'expense', '62'),
  ('625',  'Deslocações, estadas e transportes',              'expense', '62'),
  ('626',  'Serviços diversos',                               'expense', '62'),
  ('63',   'Gastos com pessoal',                              'expense', '6'),
  ('64',   'Gastos de depreciação e amortização',             'expense', '6'),
  ('65',   'Perdas por imparidade',                           'expense', '6'),
  ('66',   'Perdas por reduções de justo valor',              'expense', '6'),
  ('67',   'Provisões do período',                            'expense', '6'),
  ('68',   'Outros gastos e perdas',                          'expense', '6'),
  ('69',   'Gastos e perdas de financiamento',                'expense', '6')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- categories (hierarchical, self-referential)
-- ---------------------------------------------------------------------------

create table if not exists facturas.categories (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text unique not null,
  parent_category_id uuid references facturas.categories(id),
  created_at         timestamptz not null default now()
);

create index if not exists idx_categories_slug on facturas.categories (slug);

-- ---------------------------------------------------------------------------
-- accounting_classifications — one row per invoice GL assignment
-- ---------------------------------------------------------------------------

create table if not exists facturas.accounting_classifications (
  id                        uuid primary key default gen_random_uuid(),
  invoice_id                uuid not null references facturas.invoices(id) on delete cascade,
  gl_account_id             uuid not null references facturas.gl_accounts(id),
  category_id               uuid references facturas.categories(id),
  amount                    numeric(12,2) not null,
  classification_confidence numeric(5,4),
  classified_by             text not null check (classified_by in ('auto','human')) default 'auto',
  created_at                timestamptz not null default now()
);

create index if not exists idx_accounting_classifications_invoice_id on facturas.accounting_classifications (invoice_id);

-- ---------------------------------------------------------------------------
-- document_profiles — learning layer: supplier → preferred GL account
-- Unique on (supplier_id, gl_account_id) — one profile entry per pairing
-- ---------------------------------------------------------------------------

create table if not exists facturas.document_profiles (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references facturas.suppliers(id) on delete cascade,
  gl_account_id uuid not null references facturas.gl_accounts(id),
  category_id   uuid references facturas.categories(id),
  match_count   integer not null default 1,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (supplier_id, gl_account_id)
);

create index if not exists idx_document_profiles_supplier_id on facturas.document_profiles (supplier_id);
