-- ============================================
-- UPTIKALERTS — Private DM System
-- Reuses groups + chat_messages tables
-- DMs are just 2-person private groups with is_dm = true
-- ============================================

-- 1. Add is_dm flag to groups table
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_dm boolean DEFAULT false;

-- 2. DM metadata: tracks the two participants for fast lookup
CREATE TABLE IF NOT EXISTS dm_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  other_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- 3. Index for fast "get my DMs" queries
CREATE INDEX IF NOT EXISTS idx_dm_participants_user ON dm_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants_pair ON dm_participants(user_id, other_user_id);
CREATE INDEX IF NOT EXISTS idx_groups_is_dm ON groups(is_dm) WHERE is_dm = true;

-- 4. Shared ticker context: tickers both users watch (materialized per DM)
CREATE TABLE IF NOT EXISTS dm_shared_tickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(group_id, symbol)
);

-- 5. Whisper alerts: per-DM ticker notifications
CREATE TABLE IF NOT EXISTS dm_whisper_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  set_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, symbol)
);

-- 6. RLS policies for dm_participants
ALTER TABLE dm_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own DM participants"
  ON dm_participants FOR SELECT
  USING (auth.uid() = user_id);

-- Direct INSERT blocked — DMs should only be created via find_or_create_dm() which is SECURITY DEFINER
CREATE POLICY "Users cannot directly insert DM participants"
  ON dm_participants FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Users can update their own DM last_read_at"
  ON dm_participants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own DM participants"
  ON dm_participants FOR DELETE
  USING (auth.uid() = user_id);

-- 7. RLS for dm_shared_tickers (readable by DM members)
ALTER TABLE dm_shared_tickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DM members can read shared tickers"
  ON dm_shared_tickers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dm_participants dp
      WHERE dp.group_id = dm_shared_tickers.group_id
      AND dp.user_id = auth.uid()
    )
  );

-- 8. RLS for dm_whisper_alerts
ALTER TABLE dm_whisper_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DM members can read whisper alerts"
  ON dm_whisper_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dm_participants dp
      WHERE dp.group_id = dm_whisper_alerts.group_id
      AND dp.user_id = auth.uid()
    )
  );

CREATE POLICY "DM members can insert whisper alerts"
  ON dm_whisper_alerts FOR INSERT
  WITH CHECK (auth.uid() = set_by);

-- 9. Message reactions (used by DM chat; also reusable for group chat)
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select_all" ON message_reactions
  FOR SELECT USING (true);

CREATE POLICY "reactions_insert_own" ON message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_delete_own" ON message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- 10. Enable realtime for DM tables + reactions
ALTER PUBLICATION supabase_realtime ADD TABLE dm_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE dm_whisper_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;

-- 11. Function to find or create a DM between two users
-- Caller must be one of the participants. SECURITY DEFINER so it can bypass RLS on dm_participants INSERT.
CREATE OR REPLACE FUNCTION public.find_or_create_dm(user_a uuid, user_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_group_id uuid;
  new_group_id uuid;
BEGIN
  -- Look for an existing DM between these two users
  SELECT dp.group_id INTO existing_group_id
  FROM dm_participants dp
  WHERE dp.user_id = user_a AND dp.other_user_id = user_b
  LIMIT 1;

  IF existing_group_id IS NOT NULL THEN
    RETURN existing_group_id;
  END IF;

  -- Create new DM group
  INSERT INTO groups (name, is_dm, created_by)
  VALUES ('DM', true, user_a)
  RETURNING id INTO new_group_id;

  -- Insert both participants
  INSERT INTO dm_participants (group_id, user_id, other_user_id)
  VALUES (new_group_id, user_a, user_b);

  INSERT INTO dm_participants (group_id, user_id, other_user_id)
  VALUES (new_group_id, user_b, user_a);

  -- Also insert group_members so RLS policies on chat_messages work.
  -- Without these, users can't SELECT/INSERT messages in the DM group.
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (new_group_id, user_a, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (new_group_id, user_b, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN new_group_id;
END;
$$;