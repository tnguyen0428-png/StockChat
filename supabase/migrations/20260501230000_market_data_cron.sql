-- ============================================
-- UPTIKALERTS — Schedule market-data on pg_cron
--
-- Why this exists: the market-data edge function (VIX, SPY, sectors,
-- fear_greed) was deployed but never wired to pg_cron. As a result:
--   - vix_score / spy_price / sector_performance only refreshed when
--     someone manually hit the function URL (~once a day at market close).
--   - market_data.fear_greed never got written at all, because the CNN
--     fetch silently failed without a User-Agent header (since fixed in
--     the edge function on 2026-05-01).
--
-- The Alerts page reads from these rows on every load; without scheduled
-- refreshes the gauge stays frozen at whatever value was last manually
-- written. This cron fixes that.
--
-- Schedule: every hour, on the hour, UTC. CNN's fear_greed only updates
-- daily, but VIX and SPY move intraday and the function is cheap, so an
-- hourly cron keeps every row reasonably fresh without overrunning rate
-- limits. Shorter intervals (15 min) gain little since the underlying
-- data sources don't change faster than that for our purposes.
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

-- Drop any prior schedule with the same name so this migration is
-- idempotent (re-running it won't create duplicate cron entries).
SELECT cron.unschedule('market-data')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'market-data'
  );

SELECT cron.schedule(
  'market-data',
  '0 * * * *',  -- every hour, on the hour, UTC
  $$
    SELECT net.http_post(
      url     := 'https://zviplxkwqpvloljkrysx.supabase.co/functions/v1/market-data',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
