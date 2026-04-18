-- ============================================
-- UPTIKALERTS — Allow users to create their own groups
-- Bug: users hit "new row violates row-level security policy for table
-- 'groups'" when calling createCustomGroup. Root cause: RLS is ON but
-- there is no INSERT policy on `groups` — with RLS enabled and no
-- matching policy, Postgres rejects every insert. DM groups escape
-- this because find_or_create_dm() is SECURITY DEFINER; the client-side
-- custom-group flow has no such escape hatch.
--
-- Fix:
--   1. INSERT policy: authenticated users may insert a group when
--      created_by = auth.uid() (or created_by is null, for the
--      legacy/unauth'd-path safety net — still gated by TO authenticated).
--   2. SELECT policy: the creator can read their own group. Required
--      because the client does .insert().select().single(), and the
--      existing "group_read" policy only matches via group_members —
--      which the creator isn't in yet at the moment of the RETURNING.
--   3. DELETE policy: the creator can delete their own group.
--      Required for the rollback path in createCustomGroup() when the
--      follow-up group_members insert fails.
--   4. UPDATE policy: the creator can update their own group (rename,
--      recolor, etc. — used by settings UI).
-- ============================================

-- 1. INSERT: user can create a group they own
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Users can create their own groups'
  ) THEN
    CREATE POLICY "Users can create their own groups"
      ON groups FOR INSERT
      TO authenticated
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- 2. SELECT: creator can always read their own groups (OR'd with the
--    existing "group_read" policy — Postgres combines permissive
--    policies with OR).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Creators can read their own groups'
  ) THEN
    CREATE POLICY "Creators can read their own groups"
      ON groups FOR SELECT
      TO authenticated
      USING (created_by = auth.uid());
  END IF;
END $$;

-- 3. DELETE: creator can delete groups they created (rollback + cleanup)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Creators can delete their own groups'
  ) THEN
    CREATE POLICY "Creators can delete their own groups"
      ON groups FOR DELETE
      TO authenticated
      USING (created_by = auth.uid());
  END IF;
END $$;

-- 4. UPDATE: creator can update groups they created (rename, color, etc.)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Creators can update their own groups'
  ) THEN
    CREATE POLICY "Creators can update their own groups"
      ON groups FOR UPDATE
      TO authenticated
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- 5. Admin bypass — admins can INSERT/SELECT/UPDATE/DELETE any group.
--    Mirrors the pattern used for broadcasts_insert_admin. Lets the
--    AdminPanel manage public/sector groups without hitting RLS.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Admins can insert any group'
  ) THEN
    CREATE POLICY "Admins can insert any group"
      ON groups FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Admins can read any group'
  ) THEN
    CREATE POLICY "Admins can read any group"
      ON groups FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Admins can update any group'
  ) THEN
    CREATE POLICY "Admins can update any group"
      ON groups FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groups'
      AND policyname = 'Admins can delete any group'
  ) THEN
    CREATE POLICY "Admins can delete any group"
      ON groups FOR DELETE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;
