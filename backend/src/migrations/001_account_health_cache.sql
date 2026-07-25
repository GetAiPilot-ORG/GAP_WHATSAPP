-- Phase 1 Production Migration: 001_account_health_cache.sql
-- Table: w_wa_accounts
-- Purpose: Persistent Meta Graph API Synchronized Cache (Zero DB-invented defaults)
-- Policy: All health fields default to NULL ("never synchronized"). AccountHealthService populates verified data.

ALTER TABLE w_wa_accounts
  ADD COLUMN IF NOT EXISTS has_access_token BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS token_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_verification_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quality_rating TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS messaging_limit TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS template_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_sync_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS health_cache JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_version BIGINT DEFAULT 1;

-- Add CHECK constraints for status field validation (Allows NULL for unsynchronized state)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_w_wa_accounts_connection_status') THEN
    ALTER TABLE w_wa_accounts 
      ADD CONSTRAINT chk_w_wa_accounts_connection_status 
      CHECK (connection_status IS NULL OR connection_status IN ('CONNECTED', 'CHECKING', 'WARNING', 'DISCONNECTED', 'TOKEN_INVALID', 'VERIFICATION_PENDING', 'REVOKED', 'UNKNOWN'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_w_wa_accounts_token_status') THEN
    ALTER TABLE w_wa_accounts 
      ADD CONSTRAINT chk_w_wa_accounts_token_status 
      CHECK (token_status IS NULL OR token_status IN ('VALID', 'EXPIRED', 'MISSING', 'INVALID', 'UNKNOWN'));
  END IF;
END $$;

-- Comments for architectural documentation
COMMENT ON COLUMN w_wa_accounts.connection_status IS 'Meta-verified status: CONNECTED, CHECKING, WARNING, DISCONNECTED, TOKEN_INVALID, VERIFICATION_PENDING, REVOKED, or NULL (unsynchronized)';
COMMENT ON COLUMN w_wa_accounts.data_source IS 'Source of authority (always meta)';
COMMENT ON COLUMN w_wa_accounts.health_version IS 'Atomic counter incremented on every verified Meta update';

-- Enable Supabase Realtime CDC stream for w_wa_accounts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE w_wa_accounts;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
