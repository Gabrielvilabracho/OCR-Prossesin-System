-- Migration 023: org_members table
-- Multi-tenant membership: authenticated users can only see their own rows
-- service_role has full access (pipeline continues working)

CREATE TABLE IF NOT EXISTS facturas.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES facturas.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON facturas.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON facturas.org_members(org_id);

ALTER TABLE facturas.org_members ENABLE ROW LEVEL SECURITY;

-- service_role: full access (pipeline continues working)
CREATE POLICY org_members_service_role ON facturas.org_members
  TO service_role USING (true) WITH CHECK (true);

-- authenticated: select own rows only
CREATE POLICY org_members_select_own ON facturas.org_members
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
