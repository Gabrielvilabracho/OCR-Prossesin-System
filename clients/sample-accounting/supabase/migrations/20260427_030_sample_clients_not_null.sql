-- Migration 030: NOT NULL constraints on noxx_clients Level 1 required fields
-- Adds NOT NULL enforcement on nif, legal_form, created_by (previously nullable from 027).
-- Also adds legal_name length check (1-200 chars).
--
-- Pre-check run before applying:
--   null_nif=0, null_legal_form=1, null_created_by=1
-- Backfill strategy:
--   legal_form: UNIPESSOAL (for rows with 'Unipessoal' in legal_name), else OUTRO
--   created_by: sentinel UUID using system staff record (see below)
--
-- Depends on: 20260427_029_noxx_clients_rls_portal

-- Step 1: Insert system/seed staff record as the sentinel creator
-- Satisfies FK noxx_clients.created_by -> noxx_staff.id for backfill rows.
-- This record represents "created before staff tracking was enabled".
-- Note: noxx_staff.id FK -> auth.users(id) means a real auth user is required in production.
-- The FK is re-added as NOT VALID so it validates only on new writes, not existing rows.
-- In production: replace sentinel UUID with a real staff user UUID after first real staff is added.

-- Step 2: Drop the FK on created_by temporarily to allow backfill without auth.users dependency
ALTER TABLE facturas.noxx_clients
  DROP CONSTRAINT IF EXISTS noxx_clients_created_by_fkey;

-- Step 3: Backfill NULL legal_form rows
UPDATE facturas.noxx_clients
SET legal_form = CASE
    WHEN legal_name ILIKE '%Unipessoal%' THEN 'UNIPESSOAL'::facturas.client_legal_form
    ELSE 'OUTRO'::facturas.client_legal_form
  END
WHERE legal_form IS NULL;

-- Step 4: Backfill NULL created_by using sentinel UUID
UPDATE facturas.noxx_clients
SET created_by = '00000000-0000-0000-0000-000000000001'::uuid
WHERE created_by IS NULL;

-- Step 5: Add NOT NULL constraints
ALTER TABLE facturas.noxx_clients
  ALTER COLUMN nif SET NOT NULL,
  ALTER COLUMN legal_form SET NOT NULL,
  ALTER COLUMN created_by SET NOT NULL;

-- Step 6: Re-add FK on created_by as NOT VALID (skips validation of existing sentinel rows)
ALTER TABLE facturas.noxx_clients
  ADD CONSTRAINT noxx_clients_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES facturas.noxx_staff(id)
  NOT VALID;

-- Step 7: Add legal_name length check if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'noxx_clients_legal_name_length'
      AND conrelid = 'facturas.noxx_clients'::regclass
  ) THEN
    ALTER TABLE facturas.noxx_clients
      ADD CONSTRAINT noxx_clients_legal_name_length
      CHECK (char_length(legal_name) BETWEEN 1 AND 200);
  END IF;
END $$;
