-- ============================================
-- UPTIKALERTS — user_watchlist email opt-out flag
-- ============================================
-- PROBLEM
-- The scan-vol-surge edge function fans out signal-alert emails to every
-- row in user_watchlist matching the triggered ticker. Right now there's
-- no way for a user to mute alerts on a specific ticker without removing
-- it from their watchlist entirely. That's the wrong trade-off — users
-- want to *track* a ticker's price/news in-app but not necessarily get
-- pinged in their inbox every time a signal fires.
--
-- Without per-ticker opt-out the email volume balloons as the watchlist
-- grows, which drives unsubscribes, which trip SendGrid sender-reputation
-- thresholds, which then degrade delivery for the auth emails sharing
-- the same SMTP relay. Bad spiral.
--
-- WHY default true
-- Existing watchlist rows pre-date this column. Setting them to true
-- preserves current behaviour (everyone watching a ticker still gets the
-- email) so this migration is non-breaking. Users who don't want emails
-- can flip it off via the UI or via the email's "Mute alerts" link.
--
-- WHY a column on user_watchlist (vs. a separate prefs table)
-- The opt-out is per (user_id, ticker), which is the natural primary key
-- of user_watchlist already. A separate table would force a left-join on
-- every email-fanout query and need its own RLS rules. One column is
-- simpler, faster, and keeps the policy story trivial.
--
-- IDEMPOTENCY
-- ADD COLUMN IF NOT EXISTS handles re-runs natively. The DEFAULT clause
-- backfills existing rows in one statement (safe at current row counts;
-- revisit if user_watchlist ever grows past ~1M rows where a non-volatile
-- default + manual UPDATE batches would be safer).
-- ============================================

ALTER TABLE public.user_watchlist
  ADD COLUMN IF NOT EXISTS email_alerts_enabled boolean NOT NULL DEFAULT true;

-- Helpful index for the email-fanout query in scan-vol-surge:
--   SELECT user_id FROM user_watchlist
--   WHERE symbol = $1 AND email_alerts_enabled = true;
-- The (symbol, email_alerts_enabled) composite scopes the scan to opted-in
-- watchers for the triggered ticker without a sequential scan.
CREATE INDEX IF NOT EXISTS user_watchlist_symbol_email_idx
  ON public.user_watchlist (symbol)
  WHERE email_alerts_enabled = true;
