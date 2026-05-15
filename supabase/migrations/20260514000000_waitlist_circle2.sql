-- ============================================
-- UPTIKALERTS — Circle 2 waitlist
-- Circle 1 (50/50) is full. The existing landing page already inserts
-- into `waitlist`, but the table currently requires `name NOT NULL`
-- (created in 20260410100000_schema_drift_catchup.sql) while the
-- email-only form does not collect a name — so live inserts would fail.
--
-- This migration:
--   1. Drops NOT NULL on `name` so email-only inserts succeed.
--   2. Adds `source` (where the signup came from — e.g. 'landing',
--      'substack') and `referred_by` (email of the referring Circle 1
--      member) columns so we can prioritize Circle 2 invites later.
--   3. Idempotent: safe to re-run.
-- The "Anyone can join waitlist" INSERT policy already exists.
-- ============================================

ALTER TABLE waitlist
  ALTER COLUMN name DROP NOT NULL;

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS referred_by text;
