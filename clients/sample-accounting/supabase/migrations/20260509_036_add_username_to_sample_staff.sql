-- Migration: add username to noxx_staff
-- Date: 2026-05-09
-- Applied via: Supabase MCP (agencia-v1 session)
--
-- Adds username column to facturas.noxx_staff.
-- full_name already existed as NOT NULL — not touched.
-- username is nullable to allow existing users without this data.

ALTER TABLE facturas.noxx_staff
  ADD COLUMN username TEXT UNIQUE;
