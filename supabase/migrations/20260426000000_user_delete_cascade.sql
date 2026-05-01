-- ============================================
-- UPTIKALERTS — User-delete FK cleanup (full scope)
-- ============================================
-- PROBLEM
-- Deleting a row from auth.users fails today because:
--   (a) Four FK columns reference profiles(id) without an ON DELETE clause
--       (default NO ACTION), so the auth.users → profiles cascade aborts when
--       it tries to remove a profile row that's still referenced.
--   (b) Two tables (paper_portfolios, paper_trades) accumulated DUPLICATE FKs
--       via dashboard drift — one to auth.users (CASCADE, from the original
--       migration) and a second, name-suffixed FK to profiles (no ON DELETE)
--       added later. The duplicate blocks deletes; only the original should
--       remain.
--   (c) Three tables (ai_feedback, ai_user_memory, challenge_chat) drifted to
--       reference profiles(id) when the original migration intent was to
--       reference auth.users(id) ON DELETE CASCADE. Restoring auth.users as
--       the target keeps the cascade chain anchored at the auth system of
--       record instead of fanning through profiles.
--
-- WHY ON DELETE SET NULL FOR (1)–(4)
-- These columns attribute community/admin actions to a user (group moderator,
-- group creator, alert-override admin, whisper-alert author). Deleting the
-- user shouldn't destroy the group, the performance record, or the DM
-- whisper. Mirrors Reddit's [deleted] pattern: content stays, attribution
-- clears.
--
-- WHY ON DELETE CASCADE FOR (5)–(7)
-- These tables hold per-user data (AI memory/feedback, challenge chat) that
-- has no value to anyone else once the account is gone. Cascading from
-- auth.users (not profiles) keeps a single source of truth for identity.
--
-- WHY DROP-ONLY FOR (8)–(9)
-- The _fkey_profiles constraints are duplicates introduced by dashboard
-- drift; the originally-defined _fkey constraints (→ auth.users CASCADE)
-- already handle user delete correctly. Re-adding either would re-introduce
-- the bug. Drop them by EXACT constraint name — the column-lookup pattern
-- used elsewhere in this file is unsafe here because TWO FKs share the
-- column and we want to keep the auth.users one.
--
-- AFFECTED OBJECTS:
--   1.  groups.moderator_id            → profiles(id)        SET NULL
--   2.  groups.created_by              → profiles(id)        SET NULL
--   3.  alert_performance.admin_id     → profiles(id)        SET NULL
--       (Note: the column lives on alert_performance, not "dynamic_alerts" —
--       the source migration *file* is named 20260406000000_dynamic_alerts.sql
--       but the table it creates is alert_performance.)
--   4.  dm_whisper_alerts.set_by       → profiles(id)        SET NULL
--   5.  ai_feedback.user_id            → auth.users(id)      CASCADE
--   6.  ai_user_memory.user_id         → auth.users(id)      CASCADE
--   7.  challenge_chat.user_id         → auth.users(id)      CASCADE
--                                          (was drifted to → profiles)
--   8.  paper_portfolios — DROP duplicate paper_portfolios_user_id_fkey_profiles
--   9.  paper_trades     — DROP duplicate paper_trades_user_id_fkey_profiles
--
-- IDEMPOTENCY
-- (1)–(7): each block looks up the existing FK on the column (not by name),
-- drops it, then re-adds with the canonical <table>_<column>_fkey name guarded
-- by a NOT EXISTS check. For SET NULL columns, the block also queries
-- information_schema.columns and DROP NOT NULL defensively before re-adding,
-- so the migration works regardless of current nullability.
-- (8)–(9): DROP CONSTRAINT IF EXISTS by exact name. Re-running is a no-op.
-- ============================================

-- ─────────────────────────────────────────────
-- 1. groups.moderator_id → profiles(id) ON DELETE SET NULL
-- ─────────────────────────────────────────────
DO $$
DECLARE
  c_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'groups'
      AND column_name  = 'moderator_id'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.groups ALTER COLUMN moderator_id DROP NOT NULL;
  END IF;

  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum   = ANY(con.conkey)
  WHERE con.conrelid = 'public.groups'::regclass
    AND con.contype  = 'f'
    AND att.attname  = 'moderator_id';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.groups DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'groups_moderator_id_fkey'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_moderator_id_fkey
      FOREIGN KEY (moderator_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. groups.created_by → profiles(id) ON DELETE SET NULL
-- ─────────────────────────────────────────────
DO $$
DECLARE
  c_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'groups'
      AND column_name  = 'created_by'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.groups ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum   = ANY(con.conkey)
  WHERE con.conrelid = 'public.groups'::regclass
    AND con.contype  = 'f'
    AND att.attname  = 'created_by';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.groups DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'groups_created_by_fkey'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 3. alert_performance.admin_id → profiles(id) ON DELETE SET NULL
-- ─────────────────────────────────────────────
DO $$
DECLARE
  c_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'alert_performance'
      AND column_name  = 'admin_id'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.alert_performance ALTER COLUMN admin_id DROP NOT NULL;
  END IF;

  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum   = ANY(con.conkey)
  WHERE con.conrelid = 'public.alert_performance'::regclass
    AND con.contype  = 'f'
    AND att.attname  = 'admin_id';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.alert_performance DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'alert_performance_admin_id_fkey'
      AND conrelid = 'public.alert_performance'::regclass
  ) THEN
    ALTER TABLE public.alert_performance
      ADD CONSTRAINT alert_performance_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 4. dm_whisper_alerts.set_by → profiles(id) ON DELETE SET NULL
-- ─────────────────────────────────────────────
DO $$
DECLARE
  c_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'dm_whisper_alerts'
      AND column_name  = 'set_by'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.dm_whisper_alerts ALTER COLUMN set_by DROP NOT NULL;
  END IF;

  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum   = ANY(con.conkey)
  WHERE con.conrelid = 'public.dm_whisper_alerts'::regclass
    AND con.contype  = 'f'
    AND att.attname  = 'set_by';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dm_whisper_alerts DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'dm_whisper_alerts_set_by_fkey'
      AND conrelid = 'public.dm_whisper_alerts'::regclass
  ) THEN
    ALTER TABLE public.dm_whisper_alerts
      ADD CONSTRAINT dm_whisper_alerts_set_by_fkey
      FOREIGN KEY (set_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 5. ai_feedback.user_id → auth.users(id) ON DELETE CASCADE
-- ─────────────────────────────────────────────
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum   = ANY(con.conkey)
  WHERE con.conrelid = 'public.ai_feedback'::regclass
    AND con.contype  = 'f'
    AND att.attname  = 'user_id';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_feedback DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'ai_feedback_user_id_fkey'
      AND conrelid = 'public.ai_feedback'::regclass
  ) THEN
    ALTER TABLE public.ai_feedback
      ADD CONSTRAINT ai_feedback_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 6. ai_user_memory.user_id → auth.users(id) ON DELETE CASCADE
-- ─────────────────────────────────────────────
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum   = ANY(con.conkey)
  WHERE con.conrelid = 'public.ai_user_memory'::regclass
    AND con.contype  = 'f'
    AND att.attname  = 'user_id';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_user_memory DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'ai_user_memory_user_id_fkey'
      AND conrelid = 'public.ai_user_memory'::regclass
  ) THEN
    ALTER TABLE public.ai_user_memory
      ADD CONSTRAINT ai_user_memory_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 7. challenge_chat.user_id → auth.users(id) ON DELETE CASCADE
--    Restores the original migration intent (20260407100000) — the live
--    constraint had drifted to point at profiles(id).
-- ─────────────────────────────────────────────
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum   = ANY(con.conkey)
  WHERE con.conrelid = 'public.challenge_chat'::regclass
    AND con.contype  = 'f'
    AND att.attname  = 'user_id';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.challenge_chat DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'challenge_chat_user_id_fkey'
      AND conrelid = 'public.challenge_chat'::regclass
  ) THEN
    ALTER TABLE public.challenge_chat
      ADD CONSTRAINT challenge_chat_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 8. paper_portfolios — drop duplicate FK to profiles
--    (the original paper_portfolios_user_id_fkey → auth.users CASCADE stays)
--    DROP-ONLY by exact name; column-lookup is unsafe with two FKs on user_id.
-- ─────────────────────────────────────────────
ALTER TABLE public.paper_portfolios
  DROP CONSTRAINT IF EXISTS paper_portfolios_user_id_fkey_profiles;

-- ─────────────────────────────────────────────
-- 9. paper_trades — drop duplicate FK to profiles
--    (the original paper_trades_user_id_fkey → auth.users CASCADE stays)
--    DROP-ONLY by exact name; column-lookup is unsafe with two FKs on user_id.
-- ─────────────────────────────────────────────
ALTER TABLE public.paper_trades
  DROP CONSTRAINT IF EXISTS paper_trades_user_id_fkey_profiles;
