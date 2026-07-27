-- Migration: Add timing columns for Agent Presence Tracking
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS last_online_at timestamptz,
ADD COLUMN IF NOT EXISTS online_time_today int DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_date text;
