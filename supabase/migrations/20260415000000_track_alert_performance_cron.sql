-- ============================================
-- UPTIKALERTS — Schedule track-alert-performance on pg_cron
--
-- Why this exists: the tracker edge function was never wired to pg_cron.
-- Pending alert_performance_snapshots rows were getting created by the
-- trg_auto_create_perf_snapshots trigger on every breakout_alerts insert,
-- but nothing was closing them out on schedule. The only reason
-- v_signal_cohort_stats had any rows at all was manual one-off runs, and
-- those runs all used the CURRENT Polygon price (see the edge function's
-- pre-2026-04-15 implementation), which produced identical return_pct
-- across 1d/3d/7d horizons and contaminated the cohort stats.
--
-- The rewritten edge function (2026-04-15) uses historical hourly aggregates
-- for overdue snapshots, so a scheduled cron run will now produce correct
-- horizon-specific data. This migration is the schedule that goes with it.
--
-- Schedule: every 3 hours, UTC. Weekday/market-hours filtering lives inside
-- the edge function (it short-circuits on Sat/Sun unless ?force=true), so the
-- cron stays simple and just fires the HTTP call.
--
-- Prerequisites (one-time setup, manual via SQL Editor):
--   1. Enable Vault if not already enabled
--      (Settings → Integrations → Vault, or check `\dx vault`)
--   2. Insert the service_role JWT as a Vault secret:
--      SELECT vault.create_secret(
--        '<paste service_role JWT from Settings → API Keys → Legacy>',
--        'service_role_key',
--        'JWT for pg_cron HTTP auth to edge functions'
--      );
--   3. To rotate later, use vault.update_secret(<secret_id>, '<new jwt>', ...)
--
-- Why Vault and not `current_setting('app.service_role_key', true)`:
--   The latter requires ALTER DATABASE which Supabase blocks for the
--   postgres role (only true superuser can set it, and Supabase doesn't
--   expose superuser via SQL Editor). Without it, current_setting returns
--   NULL, the Authorization header is malformed, and edge functions 401.
--   Discovered 2026-05-02 while wiring scan-confluence and flow-scan crons.
-- ============================================

-- Drop any prior schedule with the same name so this migration is idempotent
-- (re-running it won't create duplicate cron entries).
SELECT cron.unschedule('track-alert-performance')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'track-alert-performance'
  );

SELECT cron.schedule(
  'track-alert-performance',
  '0 */3 * * *',  -- every 3 hours, on the hour, UTC
  $$
    SELECT net.http_post(
      url     := 'https://zviplxkwqpvloljkrysx.supabase.co/functions/v1/track-alert-performance',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
