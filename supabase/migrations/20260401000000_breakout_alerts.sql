-- ============================================
-- Migration: vol_surge unique daily constraint + cron schedule
-- Inserts into existing `alerts` table
-- ============================================
-- Idempotency note (added 2026-05-02): every DDL statement uses
-- IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE so this migration
-- can be safely re-applied against a populated database. The CREATE
-- INDEX with the AT TIME ZONE cast also gets an extra layer of parens
-- around the cast expression — required by PostgreSQL inside CREATE
-- INDEX even though the same expression parses fine in SELECT.
-- ============================================

-- 1. Unique index: one vol_surge alert per ticker per ET calendar day.
--    Prevents duplicate scanner inserts when the cron fires multiple times.
--    Uses GIN index on tickers array + partial filter on alert_type.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_vol_surge_daily_uniq
  ON alerts (alert_type, ((created_at AT TIME ZONE 'America/New_York')::date))
  WHERE alert_type = 'vol_surge' AND array_length(tickers, 1) = 1;

-- Note: this index covers single-ticker vol_surge alerts (all scanner inserts).
-- Multi-ticker alerts from other sources are not affected.

-- ============================================
-- Cron schedule via pg_cron + pg_net
--
-- Prerequisites (enable once in Supabase dashboard):
--   Extensions > pg_cron   (enable)
--   Extensions > pg_net    (enable)
--
-- Fires every 15 min between 13:00–20:45 UTC Mon–Fri (9:00 AM–4:45 PM ET).
-- The edge function itself enforces the exact 9:30–16:00 ET window.
-- ============================================

SELECT cron.unschedule('vol-surge-scan')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'vol-surge-scan'
  );

SELECT cron.schedule(
  'vol-surge-scan',
  '*/15 13-20 * * 1-5',
  $$
    SELECT net.http_post(
      url     := 'https://zviplxkwqpvloljkrysx.supabase.co/functions/v1/scan-vol-surge',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- The service_role JWT is read from Supabase Vault. See the
-- "pg_cron auth uses Supabase Vault" rule in .claude/CLAUDE.md and the
-- one-time Vault setup documented in 20260415000000_track_alert_performance_cron.sql.
