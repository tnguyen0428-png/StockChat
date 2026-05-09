-- ============================================
-- Admin RLS policies for curated_lists / curated_stocks
-- ============================================
-- Symptom: AdminPanel "Save Results" (Run Screener) failed with
--   "new row violates row-level security policy for table 'curated_stocks'"
--
-- Root cause: both tables had RLS enabled but the only policies covered
-- read (lists_read / stocks_read, gated on group membership) and a
-- moderator write path (also gated on group membership). The screener
-- writes lists for *sector* groups (e.g. "Tech") that admins generally
-- aren't members of, so neither read nor write was permitted.
--
-- Even adding admin INSERT alone wasn't enough: AdminPanel does
-- `.insert(...).select().single()` which sets `Prefer: return=representation`,
-- and PostgREST/Postgres requires the inserted row to also pass the SELECT
-- policy for the RETURNING clause. Without an admin SELECT policy the
-- INSERT was reported as an RLS violation.
--
-- Fix: admins (profiles.is_admin = true) get full SELECT/INSERT/UPDATE/
-- DELETE on both tables, regardless of group membership. Existing
-- read and moderator-write policies are untouched, so non-admin
-- behavior is unchanged.
--
-- Idempotent: drops any prior policy of the same name first so re-running
-- the migration is safe.

-- curated_lists ------------------------------------------------------------
drop policy if exists "lists_select_admin" on curated_lists;
drop policy if exists "lists_insert_admin" on curated_lists;
drop policy if exists "lists_update_admin" on curated_lists;
drop policy if exists "lists_delete_admin" on curated_lists;

create policy "lists_select_admin" on curated_lists for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "lists_insert_admin" on curated_lists for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "lists_update_admin" on curated_lists for update
  using      (exists (select 1 from profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "lists_delete_admin" on curated_lists for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- curated_stocks ----------------------------------------------------------
drop policy if exists "stocks_select_admin" on curated_stocks;
drop policy if exists "stocks_insert_admin" on curated_stocks;
drop policy if exists "stocks_update_admin" on curated_stocks;
drop policy if exists "stocks_delete_admin" on curated_stocks;

create policy "stocks_select_admin" on curated_stocks for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "stocks_insert_admin" on curated_stocks for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "stocks_update_admin" on curated_stocks for update
  using      (exists (select 1 from profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "stocks_delete_admin" on curated_stocks for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
