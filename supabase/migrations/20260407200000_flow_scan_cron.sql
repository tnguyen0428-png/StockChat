-- ============================================
-- Migration: Disable vol-surge auto-cron + Schedule Auto (UW flow) scanner
--
-- 1) Removes the vol-surge-scan cron job so Manual scanners
--    (52W High, Vol Surge, Gap Up, MA Cross) are admin on-demand only.
--
-- 2) Schedules fetch-flow-data (Auto) 3x daily Mon–Fri:
--      8:00 AM PT  →  15:00 UTC (PDT) / 16:00 UTC (PST)
--     10:00 AM PT  →  17:00 UTC (PDT) / 18:00 UTC (PST)
--      1:00 PM PT  →  20:00 UTC (PDT) / 21:00 UTC (PST)
--
--    Using PDT offsets (UTC-7) for now.
--    Adjust by +1 hour after DST ends in November.
--
-- Prerequisites (enable once in Supabase dashboard):
--   Extensions > pg_cron   (enable)
--   Extensions > pg_net    (enable)
-- ============================================

-- ── 1. Remove the old vol-surge-scan cron ──
SELECT cron.unschedule('vol-surge-scan')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'vol-surge-scan'
  );

-- ── 2. Schedule Auto (flow) scanner 3x/day ──
SELECT cron.unschedule('flow-scan')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'flow-scan'
  );

SELECT cron.schedule(
  'flow-scan',
  '0 15,17,20 * * 1-5',
  $$
    SELECT net.http_post(
      url     := 'https://zviplxkwqpvloljkrysx.supabase.co/functions/v1/fetch-flow-data',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);
