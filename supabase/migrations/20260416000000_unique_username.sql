-- ============================================
-- UPTIKALERTS — Case-insensitive unique username
-- ============================================
-- Adds a case-insensitive unique index on profiles.username so two users
-- can't both pick "TonyT" / "tonyt". Also updates the auto-create-profile
-- trigger to suffix duplicates with a short random token instead of
-- failing the auth signup (which would silently lose the user).

-- 1. Before we can enforce uniqueness, de-duplicate any existing rows.
--    Keep the oldest profile per lower(username); rename newer duplicates
--    by appending a short id-suffix.
WITH ranked AS (
  SELECT id,
         username,
         ROW_NUMBER() OVER (
           PARTITION BY lower(username)
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM profiles
)
UPDATE profiles p
SET username = p.username || '_' || substr(p.id::text, 1, 4)
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2. Enforce case-insensitive uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON profiles (lower(username));

-- 3. Replace handle_new_user() so a collision appends a random suffix
--    instead of raising and aborting the auth.users insert.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_username text;
  v_candidate text;
  v_attempt int := 0;
BEGIN
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    'Trader'
  );
  v_candidate := v_username;

  -- Try up to 5 times with a random suffix to resolve collisions.
  WHILE EXISTS (
    SELECT 1 FROM profiles WHERE lower(username) = lower(v_candidate)
  ) AND v_attempt < 5 LOOP
    v_candidate := v_username || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    v_attempt := v_attempt + 1;
  END LOOP;

  INSERT INTO profiles (id, username, color)
  VALUES (new.id, v_candidate, '#1AAD5E');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger itself (on_auth_user_created) was created in supabase_tables.sql
-- and doesn't need to be re-created — CREATE OR REPLACE FUNCTION swaps in
-- the new body while the trigger keeps pointing at it.
