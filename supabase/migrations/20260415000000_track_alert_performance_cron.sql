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
-- Prerequisites (enable once in Supabase dashboard):
--   Extensions > pg_cron   (enable)
--   Extensions > pg_net    (enable)
--   Database setting: app.service_role_key = '<service role jwt>'
--     (set once via: ALTER DATABASE postgres SET app.service_role_key = '...')
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
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);
