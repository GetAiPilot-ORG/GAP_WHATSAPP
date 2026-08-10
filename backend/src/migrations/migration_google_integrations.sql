-- Table for storing third-party OAuth integrations (such as Google Calendar)
CREATE TABLE IF NOT EXISTS w_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google_calendar'
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expiry TIMESTAMPTZ,
  connected_email VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_w_integrations_org_provider ON w_integrations(organization_id, provider);
