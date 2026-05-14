-- ============================================
-- UPTIKALERTS — Fix ensure_paper_portfolio() search_path
-- ============================================
-- Bug: new users were landing on the Challenge tab with $0 cash and a
-- -100% return because their paper_portfolios row was never created.
--
-- Root cause: ensure_paper_portfolio() in
-- 20260407100000_portfolio_challenge_tables.sql is SECURITY DEFINER but
-- did not pin search_path. Supabase runs SECURITY DEFINER functions with
-- an empty search_path by default (security hardening), so the
-- unqualified `paper_portfolios` reference fails with
-- 42P01 "relation paper_portfolios does not exist". The JS caller ignored
-- the RPC error, the follow-up SELECT returned no row, cash_balance fell
-- through to 0, and totalReturn computed to -100%.
--
-- Precedent: this is the same bug class fixed for handle_new_user() in
-- 20260416000000_unique_username.sql — the sibling RPC was missed at the
-- time of that audit. The fix mirrors that pattern:
--   - SET search_path = public, pg_temp on the function
--   - schema-qualify the table reference as public.paper_portfolios
--
-- Idempotent: CREATE OR REPLACE FUNCTION can be re-run safely.

CREATE OR REPLACE FUNCTION ensure_paper_portfolio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.paper_portfolios (user_id, cash_balance)
  VALUES (auth.uid(), 50000)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
