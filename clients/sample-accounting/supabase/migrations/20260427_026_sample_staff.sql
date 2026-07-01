-- Migration 026: noxx_staff table — staff roster for portal access
-- Creates the noxx_staff table, staff_role ENUM, and a SECURITY DEFINER helper
-- function to expose staff role to RLS policies.

-- Staff role enum
CREATE TYPE facturas.staff_role AS ENUM ('admin', 'operator', 'viewer');

-- Staff table (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS facturas.noxx_staff (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          text NOT NULL UNIQUE,
  full_name      text NOT NULL,
  role           facturas.staff_role NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES facturas.noxx_staff(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

-- Enable RLS
ALTER TABLE facturas.noxx_staff ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY staff_insert_admin ON facturas.noxx_staff
  FOR INSERT TO authenticated
  WITH CHECK (facturas.get_staff_role(auth.uid()) = 'admin');

CREATE POLICY staff_select_admin ON facturas.noxx_staff
  FOR SELECT TO authenticated
  USING (facturas.get_staff_role(auth.uid()) = 'admin');

CREATE POLICY staff_select_own ON facturas.noxx_staff
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY staff_update_admin ON facturas.noxx_staff
  FOR UPDATE TO authenticated
  USING (facturas.get_staff_role(auth.uid()) = 'admin')
  WITH CHECK (facturas.get_staff_role(auth.uid()) = 'admin');

-- SECURITY DEFINER helper to expose staff role to RLS policies
-- Runs with elevated privileges so policies can call it without RLS recursion.
CREATE OR REPLACE FUNCTION facturas.get_staff_role(user_id uuid)
RETURNS facturas.staff_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = facturas
AS $$
  SELECT role FROM facturas.noxx_staff WHERE id = user_id AND active = true;
$$;
