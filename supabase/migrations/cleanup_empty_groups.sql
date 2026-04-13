-- ============================================
-- cleanup_empty_groups.sql
-- Removes stale private groups that were never
-- meaningfully used. Public groups are NEVER deleted.
-- ============================================

-- 1. Delete private groups created more than 48h ago with zero messages
DELETE FROM chat_messages
WHERE group_id IN (
  SELECT g.id FROM groups g
  WHERE g.is_public = false
    AND g.created_at < NOW() - INTERVAL '48 hours'
    AND NOT EXISTS (
      SELECT 1 FROM chat_messages m WHERE m.group_id = g.id
    )
);

DELETE FROM group_members
WHERE group_id IN (
  SELECT g.id FROM groups g
  WHERE g.is_public = false
    AND g.created_at < NOW() - INTERVAL '48 hours'
    AND NOT EXISTS (
      SELECT 1 FROM chat_messages m WHERE m.group_id = g.id
    )
);

DELETE FROM groups
WHERE is_public = false
  AND created_at < NOW() - INTERVAL '48 hours'
  AND NOT EXISTS (
    SELECT 1 FROM chat_messages m WHERE m.group_id = groups.id
  );


-- 2. Delete private groups with no messages in the last 30 days
DELETE FROM chat_messages
WHERE group_id IN (
  SELECT g.id FROM groups g
  WHERE g.is_public = false
    AND NOT EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.group_id = g.id
        AND m.created_at > NOW() - INTERVAL '30 days'
    )
);

DELETE FROM group_members
WHERE group_id IN (
  SELECT g.id FROM groups g
  WHERE g.is_public = false
    AND NOT EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.group_id = g.id
        AND m.created_at > NOW() - INTERVAL '30 days'
    )
);

DELETE FROM groups
WHERE is_public = false
  AND NOT EXISTS (
    SELECT 1 FROM chat_messages m
    WHERE m.group_id = groups.id
      AND m.created_at > NOW() - INTERVAL '30 days'
  );


-- 3. Delete solo private groups (only 1 member) older than 7 days
DELETE FROM chat_messages
WHERE group_id IN (
  SELECT g.id FROM groups g
  WHERE g.is_public = false
    AND g.created_at < NOW() - INTERVAL '7 days'
    AND (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) <= 1
);

DELETE FROM group_members
WHERE group_id IN (
  SELECT g.id FROM groups g
  WHERE g.is_public = false
    AND g.created_at < NOW() - INTERVAL '7 days'
    AND (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) <= 1
);

DELETE FROM groups
WHERE is_public = false
  AND created_at < NOW() - INTERVAL '7 days'
  AND (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = groups.id) <= 1;
