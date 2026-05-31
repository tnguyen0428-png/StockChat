/*
 * get_signal_email_recipients(p_ticker)
 *
 * Joins user_watchlist + auth.users for the signal-alert fanout.
 * Returns DISTINCT (user_id, email) — a user can have multiple
 * watchlist rows for the same ticker (different group_id) and we
 * want only one email per user per signal.
 *
 * Filters: confirmed email addresses only (SendGrid sender
 * reputation). The email_alerts_enabled opt-in column referenced
 * in earlier designs does NOT exist in this DB and is intentionally
 * omitted per design decision 2026-05-22.
 *
 * SECURITY DEFINER so the auth.users read is allowed regardless of
 * the caller's grants. EXECUTE is granted only to service_role.
 *
 * History: this file was rewritten 2026-05-22 after a botched first
 * attempt that referenced uw.email_alerts_enabled (a column that
 * was never added to prod because the prior migration
 * 20260501000000_user_watchlist_email_alerts_enabled.sql was never
 * applied). The file in this repo now matches what is actually
 * deployed in zviplxkwqpvloljkrysx so future db push reproduces it.
 */
CREATE OR REPLACE FUNCTION public.get_signal_email_recipients(p_ticker text)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT uw.user_id, u.email
  FROM public.user_watchlist uw
  JOIN auth.users u ON u.id = uw.user_id
  WHERE uw.symbol = p_ticker
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_signal_email_recipients(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_signal_email_recipients(text) TO service_role;
