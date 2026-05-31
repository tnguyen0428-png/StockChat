-- =========================================================================
-- DIAGNOSE: "Failed to delete user: Database error deleting user"
-- =========================================================================
-- Paste these one block at a time into Supabase → SQL Editor.
-- FIRST: find-and-replace the placeholder stuck-user@example.com (appears in
-- Blocks 1 and 3) with the actual email of the stuck user before running.
-- Block 1 reproduces the error and prints the exact constraint name.
-- Block 2 lists every FK that points at auth.users OR public.profiles,
-- so you can spot any FK missing ON DELETE CASCADE / SET NULL.
-- Block 3 is the workaround that actually deletes the stuck user.
-- =========================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- BLOCK 1 — reproduce the delete in a savepoint and capture the real error.
-- Replace the email below if you want to test a different stuck user.
-- This rolls back, so it never actually deletes.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'stuck-user@example.com';

  IF v_uid IS NULL THEN
    RAISE NOTICE 'No auth.users row for that email.';
    RETURN;
  END IF;

  BEGIN
    DELETE FROM auth.users WHERE id = v_uid;
    RAISE NOTICE 'Delete would have succeeded. Rolling back.';
    RAISE EXCEPTION 'rollback_probe';            -- forces rollback
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- TG_TABLE_NAME / TG_TABLE_SCHEMA are trigger-only special variables and
      -- are NOT defined inside a plain DO block (referencing them fails to
      -- compile). SQLERRM already names the violated constraint; the context
      -- string carries the table/schema.
      RAISE NOTICE 'FK VIOLATION → %', SQLERRM;
      RAISE NOTICE 'CONTEXT → %', COALESCE(current_setting('pg_exception_context', true), '<none>');
    WHEN OTHERS THEN
      RAISE NOTICE 'OTHER ERROR → %  [SQLSTATE %]', SQLERRM, SQLSTATE;
      RAISE NOTICE 'CONTEXT → %', COALESCE(current_setting('pg_exception_context', true), '<none>');
  END;
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- BLOCK 2 — full FK map. Any row where delete_rule = 'NO ACTION' or
-- 'RESTRICT' for a constraint pointing at auth.users OR public.profiles is
-- a potential blocker (profiles cascades from auth.users, so a NO ACTION
-- FK to profiles is functionally the same problem).
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  n_src.nspname    AS source_schema,
  c_src.relname    AS source_table,
  a_src.attname    AS source_column,
  n_tgt.nspname    AS target_schema,
  c_tgt.relname    AS target_table,
  con.conname      AS constraint_name,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END              AS on_delete
FROM pg_constraint con
JOIN pg_class      c_src  ON c_src.oid = con.conrelid
JOIN pg_namespace  n_src  ON n_src.oid = c_src.relnamespace
JOIN pg_class      c_tgt  ON c_tgt.oid = con.confrelid
JOIN pg_namespace  n_tgt  ON n_tgt.oid = c_tgt.relnamespace
JOIN pg_attribute  a_src  ON a_src.attrelid = c_src.oid
                          AND a_src.attnum   = ANY(con.conkey)
WHERE con.contype = 'f'
  AND (
        (n_tgt.nspname = 'auth'   AND c_tgt.relname = 'users')
     OR (n_tgt.nspname = 'public' AND c_tgt.relname = 'profiles')
  )
ORDER BY
  CASE con.confdeltype WHEN 'a' THEN 0 WHEN 'r' THEN 1 ELSE 2 END,
  n_src.nspname, c_src.relname;


-- ──────────────────────────────────────────────────────────────────────────
-- BLOCK 3 — one-time manual cleanup so you can delete stuck-user@example.com
-- right now without waiting on a schema fix.
--
-- Strategy: clear every row the user owns across known tables, then delete
-- the auth.users row. Wrapped in a transaction so it's all-or-nothing.
--
-- Read the table list once and add any project-specific tables you remember
-- holding user_id before running.
-- ──────────────────────────────────────────────────────────────────────────
BEGIN;

WITH target AS (
  SELECT id FROM auth.users WHERE email = 'stuck-user@example.com'
)
-- Drop user-owned rows. Use IF EXISTS-style DELETEs that no-op when the
-- table or column doesn't exist; in psql you can't conditional-DELETE,
-- so just comment out any table that doesn't exist in your DB.
, d_profiles            AS (DELETE FROM public.profiles            WHERE id      IN (SELECT id FROM target) RETURNING 1)
, d_paper_trades        AS (DELETE FROM public.paper_trades        WHERE user_id IN (SELECT id FROM target) RETURNING 1)
, d_paper_portfolios    AS (DELETE FROM public.paper_portfolios    WHERE user_id IN (SELECT id FROM target) RETURNING 1)
, d_challenge_chat      AS (DELETE FROM public.challenge_chat      WHERE user_id IN (SELECT id FROM target) RETURNING 1)
, d_ai_feedback         AS (DELETE FROM public.ai_feedback         WHERE user_id IN (SELECT id FROM target) RETURNING 1)
, d_ai_user_memory      AS (DELETE FROM public.ai_user_memory      WHERE user_id IN (SELECT id FROM target) RETURNING 1)
, d_group_members       AS (DELETE FROM public.group_members       WHERE user_id IN (SELECT id FROM target) RETURNING 1)
, d_user_watchlist      AS (DELETE FROM public.user_watchlist      WHERE user_id IN (SELECT id FROM target) RETURNING 1)
SELECT 'rows cleared' AS step;

DELETE FROM auth.users WHERE email = 'stuck-user@example.com';

-- Inspect the FK map (Block 2) before COMMIT. If anything still references
-- the user, COMMIT will fail and you can ROLLBACK and add the missing table.
COMMIT;
-- ROLLBACK;  -- swap if the COMMIT errored
