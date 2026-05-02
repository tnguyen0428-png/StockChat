-- ============================================
-- UPTIKALERTS — Re-schedule flow-scan from 3x/day to hourly
--
-- Why this exists: the existing flow-scan cron (set in
-- 20260407200000_flow_scan_cron.sql) fired at 15:00, 17:00, and 20:00 UTC
-- on weekdays — 8am, 10am, and 1pm PT during PDT. That left a 3-hour
-- gap between the 10am and 1pm runs that consistently missed the
-- lunch-hour window when a lot of institutional options flow lands.
-- Hourly fills the gap.
--
-- Cadence: '0 14-21 * * 1-5' — every hour on the hour, 14:00–21:00 UTC,
-- weekdays. This is INTENTIONALLY identical to the scan-confluence cron
-- in 20260502000000_scan_confluence_cron.sql. Both scanners fire at the
-- same moment so a user opening the alerts page sees one coherent
-- market-state snapshot rather than two phase-shifted feeds. If you
-- change one cadence, change the other to match.
--
-- No code changes to the edge function itself (fetch-flow-data) — same
-- function, just called more often.
--
-- Idempotent: the unschedule-if-exists block lets this migration be
-- re-applied without producing duplicate cron entries.
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

SELECT cron.unschedule('flow-scan')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'flow-scan'
  );

SELECT cron.schedule(
  'flow-scan',
  '0 14-21 * * 1-5',
  $$
    SELECT net.http_post(
      url     := 'https://zviplxkwqpvloljkrysx.supabase.co/functions/v1/fetch-flow-data',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
