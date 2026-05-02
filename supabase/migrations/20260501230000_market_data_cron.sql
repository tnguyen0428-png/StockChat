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
-- Prerequisites (enable once in Supabase dashboard):
--   Extensions > pg_cron   (enable)
--   Extensions > pg_net    (enable)
--   Database setting: app.service_role_key = '<service role jwt>'
--     (set once via: ALTER DATABASE postgres SET app.service_role_key = '...')
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
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);
