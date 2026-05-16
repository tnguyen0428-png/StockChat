-- ============================================
-- UPTIKALERTS — handle_new_user does full new-user setup
-- ============================================
-- Two production bugs, same root cause: handle_new_user() only created
-- the profiles row, leaving everything else to client useEffects that
-- log-and-swallow on failure (CLAUDE.md rule #22).
--
--   1. CHALLENGE TAB (Challenge crash, partially fixed in commit 639f4c6
--      on 2026-05-14): new users saw $0 cash / -100% return because the
--      paper_portfolios row was created lazily by the
--      ensure_paper_portfolio() RPC from
--      20260407100000_portfolio_challenge_tables.sql. That RPC was
--      hardened in 20260514000000_fix_ensure_paper_portfolio_search_path.sql
--      and the JS gained a fallback insert, but the primary path is still
--      client-side.
--
--   2. CHAT TAB (backfilled manually on 2026-05-14 for 4 stuck users):
--      no group_members row tying the user to UpTik Public, so
--      chat_messages RLS rejected SELECT + INSERT and the user saw a
--      blank chat with no input. Auto-join lived in DashboardPage's
--      useEffect and silently swallowed failures.
--
-- Move all of this into the trigger so signup is atomic. The client-side
-- paths (usePortfolio.loadPortfolio's RPC+fallback,
-- GroupContext.enterGroup's auto-join, DashboardPage's auto-join
-- useEffect) stay in place as safety nets but are no longer the primary
-- path for the happy case.
--
-- Why a trigger instead of more client logic:
--   - Atomic with the auth.users insert. If any required step fails, we
--     surface it in postgres logs immediately instead of accumulating
--     orphan users.
--   - One round trip. No race between signup and the first dashboard
--     render where the user is partially set up.
--   - Avoids the CLAUDE.md rule #22 trap entirely — there is no client
--     fallback-with-silent-sentinel to misbehave for the happy path.
--
-- Supersedes/consolidates the user-setup portions of:
--   - 20260416000000_unique_username.sql (profile insert + collision retry)
--   - 20260514000000_fix_ensure_paper_portfolio_search_path.sql (portfolio insert)
--
-- Required hardening (same pattern as both predecessors):
--   - LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public, pg_temp
--   - Schema-qualify every table reference (public.profiles,
--     public.paper_portfolios, public.groups, public.group_members)
--
-- Resilience:
--   - Portfolio + group_members inserts are wrapped in their own
--     BEGIN/EXCEPTION blocks. A failure there RAISEs a WARNING and
--     returns NEW so auth.users isn't rolled back — losing a new signup
--     because UpTik Public was renamed or the portfolio table briefly
--     locked would be far worse than a missing safety-net row that the
--     client paths can heal on the user's first visit.
--   - Profile insert is NOT wrapped — a user with no profiles row is
--     an unrecoverable orphan, so we'd rather abort signup and surface
--     the error than create one silently.
--   - ON CONFLICT clauses make every insert safe if the trigger fires
--     twice (which it shouldn't, but cheap insurance).
--   - cash_balance is NOT specified — let the column DEFAULT 50000 fill
--     it so the literal lives in exactly one place (the schema).
--
-- Idempotent: CREATE OR REPLACE.
--
-- DEPLOYMENT: This migration must be pushed via `supabase db push` (or
-- pasted into the SQL Editor) before the new code ships. Without the
-- trigger update, new signups still hit the broken client-only path.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_username text;
  v_candidate text;
  v_attempt int := 0;
  v_group_id uuid;
BEGIN
  -- (a) Profile row. Username collision-retry loop preserved from
  -- 20260416000000_unique_username.sql. Profile failures propagate so
  -- the auth.users row rolls back instead of leaving an orphan.
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    'Trader'
  );
  v_candidate := v_username;

  WHILE EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
  ) AND v_attempt < 5 LOOP
    v_candidate := v_username || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    v_attempt := v_attempt + 1;
  END LOOP;

  INSERT INTO public.profiles (id, username, color)
  VALUES (new.id, v_candidate, '#1AAD5E');

  -- (b) Paper-trading portfolio. cash_balance intentionally omitted so
  -- the column DEFAULT (50000) fills it — keeps the starting cash literal
  -- in one place. Errors here are logged but do not abort signup; the
  -- client RPC+fallback in usePortfolio.loadPortfolio will heal it.
  BEGIN
    INSERT INTO public.paper_portfolios (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] paper_portfolios insert failed for user_id=% : % (%)',
      new.id, SQLERRM, SQLSTATE;
  END;

  -- (c) Auto-join UpTik Public so chat_messages RLS accepts the user's
  -- first SELECT/INSERT. Wrapped in its own EXCEPTION block AND guarded
  -- by an IF v_group_id IS NOT NULL — if UpTik Public is renamed or
  -- deleted, signup must NOT abort. GroupContext.enterGroup will still
  -- auto-join on first chat tab visit as the safety net.
  BEGIN
    SELECT id INTO v_group_id
    FROM public.groups
    WHERE name = 'UpTik Public'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_group_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES (v_group_id, new.id, 'member')
      ON CONFLICT (group_id, user_id) DO NOTHING;
    ELSE
      RAISE WARNING '[handle_new_user] UpTik Public group not found, skipping auto-join for user_id=%', new.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] group_members insert failed for user_id=% : % (%)',
      new.id, SQLERRM, SQLSTATE;
  END;

  RETURN new;
END;
$$;

-- Trigger itself (on_auth_user_created) is unchanged — CREATE OR REPLACE
-- FUNCTION swaps in the new body while the trigger keeps pointing at it.
