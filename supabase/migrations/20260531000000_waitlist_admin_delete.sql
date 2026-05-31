-- ============================================
-- UPTIKALERTS — Admin delete from waitlist
-- The waitlist table (created in 20260410100000_schema_drift_catchup.sql)
-- has only two policies:
--   • "Anyone can join waitlist"  — INSERT, WITH CHECK (true)
--   • "Admin can read waitlist"   — SELECT, admins only
-- There is NO DELETE policy, so the AdminPanel "Remove" control would be
-- silently blocked by RLS and delete 0 rows with no error surfaced.
--
-- This migration adds a DELETE policy that mirrors the working admin SELECT
-- check (admin_can_read_waitlist: auth.uid() is a profile with is_admin = true),
-- so only admins can remove waitlist signups. Idempotent: safe to re-run.
-- NOTE: profiles uses an is_admin boolean column, NOT a role column.
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waitlist' AND policyname = 'Admin can delete waitlist') THEN
    CREATE POLICY "Admin can delete waitlist"
      ON waitlist FOR DELETE
      USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
      ));
  END IF;
END $$;
