-- ============================================
-- UPTIKALERTS — Schema Drift Catchup Migration
-- Captures tables, columns, functions, and policies
-- that were created directly in the Supabase dashboard
-- but never recorded in migration files.
-- All statements use IF NOT EXISTS / IF EXISTS guards
-- so this migration is safe to run on both fresh and existing DBs.
-- ============================================

-- ─────────────────────────────────────────────
-- 1. groups table — drifted columns
-- ─────────────────────────────────────────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_code text DEFAULT substr(md5((random())::text), 1, 8);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS color text DEFAULT '#7B68EE';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);

-- ─────────────────────────────────────────────
-- 2. group_members table (used by join_custom_group RPC)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_members' AND policyname = 'Members can read their own groups') THEN
    CREATE POLICY "Members can read their own groups"
      ON group_members FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_members' AND policyname = 'Users can join groups') THEN
    CREATE POLICY "Users can join groups"
      ON group_members FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_members' AND policyname = 'Users can leave groups') THEN
    CREATE POLICY "Users can leave groups"
      ON group_members FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 3. waitlist table (used by LandingPage)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waitlist' AND policyname = 'Anyone can join waitlist') THEN
    CREATE POLICY "Anyone can join waitlist"
      ON waitlist FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waitlist' AND policyname = 'Admin can read waitlist') THEN
    CREATE POLICY "Admin can read waitlist"
      ON waitlist FOR SELECT
      USING (auth.uid() IN (
        SELECT id FROM profiles WHERE role = 'admin'
      ));
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 4. market_data table (key-value store for cached market data)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_data (
  key text PRIMARY KEY NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'market_data' AND policyname = 'Anyone can read market data') THEN
    CREATE POLICY "Anyone can read market data"
      ON market_data FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'market_data' AND policyname = 'Only admins insert market data') THEN
    CREATE POLICY "Only admins insert market data"
      ON market_data FOR INSERT
      WITH CHECK (auth.uid() IN (
        SELECT id FROM profiles WHERE role = 'admin'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'market_data' AND policyname = 'Only admins update market data') THEN
    CREATE POLICY "Only admins update market data"
      ON market_data FOR UPDATE
      USING (auth.uid() IN (
        SELECT id FROM profiles WHERE role = 'admin'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'market_data' AND policyname = 'Only admins delete market data') THEN
    CREATE POLICY "Only admins delete market data"
      ON market_data FOR DELETE
      USING (auth.uid() IN (
        SELECT id FROM profiles WHERE role = 'admin'
      ));
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 5. join_custom_group RPC function
-- Used by JoinGroupPage.jsx and App.jsx for invite-link joining
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_custom_group(p_invite_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
  v_group_name TEXT;
  v_user_id UUID;
  v_existing UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Look up the group by invite code
  SELECT id, name INTO v_group_id, v_group_name
  FROM groups
  WHERE invite_code = p_invite_code;

  IF v_group_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid invite code');
  END IF;

  -- Check if user is already a member
  SELECT id INTO v_existing
  FROM group_members
  WHERE group_id = v_group_id AND user_id = v_user_id;

  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success', true, 'group_id', v_group_id, 'group_name', v_group_name, 'already_member', true);
  END IF;

  -- Insert the user as a member
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'member');

  RETURN json_build_object('success', true, 'group_id', v_group_id, 'group_name', v_group_name, 'already_member', false);
END;
$$;
