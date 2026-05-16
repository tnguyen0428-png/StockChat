-- ============================================
-- UPTIKALERTS — handle_new_user race-free username retry
-- ============================================
-- WHAT RACES
-- The pre-check pattern landed in 20260514120000_handle_new_user_full_setup.sql
-- (and inherited from 20260416000000_unique_username.sql before it) does:
--
--   WHILE EXISTS (SELECT 1 FROM profiles WHERE lower(username) = lower(v_candidate))
--   LOOP
--     v_candidate := v_username || <random suffix>;
--   END LOOP;
--   INSERT INTO profiles (...) VALUES (..., v_candidate, ...);
--
-- Two signups picking the same base username can both pass the EXISTS
-- check in the same instant — there is no row to find yet — then both
-- attempt the INSERT. One wins, one trips the
-- profiles_username_lower_unique index and raises unique_violation. The
-- profile insert is deliberately NOT wrapped in EXCEPTION (rather lose
-- the signup than create an orphan auth.users row), so the losing signup
-- fails entirely.
--
-- WHY INSERT-THEN-CATCH IS RACE-FREE
-- Each INSERT is atomic at the DB tier — Postgres either commits it or
-- raises the unique violation, with no observable in-between state. By
-- wrapping each attempt in its own BEGIN/EXCEPTION block we let two
-- concurrent triggers race against the index itself rather than against
-- a non-atomic check-then-insert. Whichever signup loses bumps the
-- attempt counter, regenerates the candidate, and tries again.
--
-- The unique constraint is a functional index on lower(username)
-- (CREATE UNIQUE INDEX profiles_username_lower_unique ON profiles
-- (lower(username)) from 20260416000000), not on the username column
-- directly. That means ON CONFLICT (username) would NOT match — but
-- EXCEPTION WHEN unique_violation catches any unique violation
-- regardless of which index raised it, so we don't have to know.
--
-- SUPERSEDES the username-collision section of
-- supabase/migrations/20260514120000_handle_new_user_full_setup.sql.
-- The paper_portfolios block (b) and group_members block (c) are kept
-- byte-identical to 20260514120000 — only (a) changes.
--
-- Cap raised to 6 attempts (was 5) since each retry is now cheap and
-- a base username with thousands of taken variants should still
-- terminate. Past the cap we RAISE EXCEPTION so the auth.users insert
-- rolls back — orphan prevention same as before.
--
-- Hardening unchanged: LANGUAGE plpgsql, SECURITY DEFINER, SET
-- search_path = public, pg_temp, every table reference schema-qualified.
-- Idempotent via CREATE OR REPLACE; trigger on_auth_user_created keeps
-- pointing at the same function name.

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
  -- (a) Profile row. Insert-then-catch-and-retry against the
  -- profiles_username_lower_unique functional index so concurrent
  -- signups racing on the same base username can't both pass an
  -- EXISTS check and then both INSERT. Each attempt is atomic; a
  -- unique_violation bumps the candidate and retries.
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    'Trader'
  );
  v_candidate := v_username;

  WHILE v_attempt < 6 LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, color)
      VALUES (new.id, v_candidate, '#1AAD5E');
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      v_candidate := v_username || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    END;
  END LOOP;

  IF v_attempt >= 6 THEN
    RAISE EXCEPTION '[handle_new_user] could not allocate unique username after 6 attempts (base=%)', v_username;
  END IF;

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
