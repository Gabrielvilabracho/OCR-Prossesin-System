-- Migration 027: noxx_clients redesign — client registry Level 1/2/3 fields
-- FROM: {id, name, nif, email, notes, created_at, updated_at}
-- TO:   {id, legal_name, nif, email, notes, created_at, updated_at,
--         legal_form, status, drive_folder_id, allows_manual_upload,
--         created_by, account_manager, incorporation_date, registration_number,
--         trade_name, capital_social, shareholders, phone}
--
-- Also: DROP organization_id (count=0, safe), ADD indexes
--
-- Depends on: 20260427_026_noxx_staff (staff_role enum, noxx_staff table, get_staff_role())

-- Level 1 enums
CREATE TYPE IF NOT EXISTS facturas.client_status AS ENUM ('draft', 'active', 'inactive', 'archived');
CREATE TYPE IF NOT EXISTS facturas.client_legal_form AS ENUM ('LDA', 'SA', 'ENI', 'UNIPESSOAL', 'OUTRO');

-- Rename name -> legal_name
ALTER TABLE facturas.noxx_clients RENAME COLUMN name TO legal_name;

-- Drop organization_id if it exists (count was confirmed = 0 before apply)
ALTER TABLE facturas.noxx_clients DROP COLUMN IF EXISTS organization_id;

-- Add Level 1 required fields (nullable initially — NOT NULL added in migration 030)
ALTER TABLE facturas.noxx_clients
  ADD COLUMN IF NOT EXISTS legal_form        facturas.client_legal_form,
  ADD COLUMN IF NOT EXISTS status            facturas.client_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS drive_folder_id   text,
  ADD COLUMN IF NOT EXISTS allows_manual_upload boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by        uuid REFERENCES facturas.noxx_staff(id),
  ADD COLUMN IF NOT EXISTS account_manager   uuid REFERENCES facturas.noxx_staff(id);

-- Add Level 2 fields
ALTER TABLE facturas.noxx_clients
  ADD COLUMN IF NOT EXISTS incorporation_date   date,
  ADD COLUMN IF NOT EXISTS registration_number  text,
  ADD COLUMN IF NOT EXISTS trade_name           text,
  ADD COLUMN IF NOT EXISTS capital_social       numeric;

-- Add Level 3 fields
ALTER TABLE facturas.noxx_clients
  ADD COLUMN IF NOT EXISTS shareholders  jsonb,
  ADD COLUMN IF NOT EXISTS phone         text;

-- Ingestion channel constraint: must have Drive folder OR manual upload enabled
ALTER TABLE facturas.noxx_clients
  ADD CONSTRAINT noxx_clients_ingestion_channel_check
  CHECK (drive_folder_id IS NOT NULL OR allows_manual_upload = true) NOT VALID;

-- Capital social must be non-negative
ALTER TABLE facturas.noxx_clients
  ADD CONSTRAINT noxx_clients_capital_social_check
  CHECK (capital_social >= 0) NOT VALID;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_noxx_clients_status
  ON facturas.noxx_clients (status);

CREATE INDEX IF NOT EXISTS idx_noxx_clients_created_by
  ON facturas.noxx_clients (created_by);

CREATE INDEX IF NOT EXISTS idx_noxx_clients_account_manager
  ON facturas.noxx_clients (account_manager);

CREATE INDEX IF NOT EXISTS idx_noxx_clients_active_drive
  ON facturas.noxx_clients (drive_folder_id)
  WHERE status = 'active' AND drive_folder_id IS NOT NULL;
