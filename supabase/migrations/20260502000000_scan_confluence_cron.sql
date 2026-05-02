-- ============================================
-- UPTIKALERTS — Schedule scan-confluence on pg_cron
--
-- Why this exists: confluence scoring lived only in the client-side
-- runConfluenceScan (src/lib/breakoutScanner.js) and ran exclusively when
-- an admin clicked the button in AdminPanel.jsx. Most days nobody clicked
-- it, so the confluence cohort accumulated rows sporadically — sometimes
-- none for several days — and the alerts page's confluence stats became
-- noisy and untrustworthy.
--
-- The companion edge function (supabase/functions/scan-confluence) ports
-- the same 4-stage pipeline (52w_high / vol_surge / gap_up / ma_cross
-- merged + RSI/ADX/VWAP enhancement + tiered scoring) to a Deno function
-- so this cron can drive it.
--
-- Schedule: every hour on the hour, 14:00–21:00 UTC, weekdays. That's
-- 7am–2pm PT during PDT (one fire at the open, one at close, six in
-- between). 8 fires per market day. Cadence is intentionally identical
-- to the flow-scan cron (set in 20260502010000_flow_scan_hourly.sql)
-- so confluence and flow alerts correlate to the same market-state
-- snapshot — a user looking at the alerts page sees one coherent view,
-- not two phase-shifted feeds.
--
-- Idempotent: the unschedule-if-exists block lets this migration be
-- re-applied without producing duplicate cron entries.
--
-- Prerequisites (enable once in Supabase dashboard):
--   Extensions > pg_cron   (enable)
--   Extensions > pg_net    (enable)
--   Database setting: app.service_role_key = '<service role jwt>'
--     (set once via: ALTER DATABASE postgres SET app.service_role_key = '...')
-- ============================================

SELECT cron.unschedule('scan-confluence')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'scan-confluence'
  );

SELECT cron.schedule(
  'scan-confluence',
  '0 14-21 * * 1-5',
  $$
    SELECT net.http_post(
      url     := 'https://zviplxkwqpvloljkrysx.supabase.co/functions/v1/scan-confluence',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);
