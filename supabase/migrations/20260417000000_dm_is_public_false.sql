-- ============================================
-- UPTIKALERTS — Mark DM groups as private
-- Fix: find_or_create_dm() didn't explicitly set is_public, so new DM
-- groups inherited the groups.is_public DEFAULT true and landed in the
-- public/sector rail instead of under Private Chats. Patch the RPC and
-- backfill existing DM rows.
-- ============================================

-- 1. Backfill: any existing DM row that's marked public should be flipped
UPDATE groups
SET is_public = false
WHERE is_dm = true
  AND is_public = true;

-- 2. Re-create find_or_create_dm with the correct is_public default
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

  -- Create new DM group. is_public = false keeps DMs out of the
  -- public/sector rail; they're rendered under Private Chats with the
  -- peer's display info.
  INSERT INTO groups (name, is_dm, is_public, created_by)
  VALUES ('DM', true, false, user_a)
  RETURNING id INTO new_group_id;

  -- Insert both participants
  INSERT INTO dm_participants (group_id, user_id, other_user_id)
  VALUES (new_group_id, user_a, user_b);

  INSERT INTO dm_participants (group_id, user_id, other_user_id)
  VALUES (new_group_id, user_b, user_a);

  -- Also insert group_members so RLS policies on chat_messages work.
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (new_group_id, user_a, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (new_group_id, user_b, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN new_group_id;
END;
$$;
