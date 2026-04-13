// ============================================
// UPTIKALERTS — ChatInbox.jsx
// Unified inbox: group chats + DMs in one list
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { safeGet, safeSet } from '../../lib/safeStorage';
import { styles } from './chatInboxStyles';

// ── Helpers ──────────────────────────────────

function formatTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncate(text, max = 38) {
  if (!text) return 'No messages yet';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ── Group Row ─────────────────────────────────

function GroupRow({ group, preview, isUnread, isActive, onOpen }) {
  const color = group.color || '#7B68EE';
  return (
    <div
      style={{
        ...styles.row,
        ...(isUnread ? styles.rowUnread : {}),
        ...(isActive ? styles.rowActive : {}),
      }}
      onClick={() => onOpen(group)}
    >
      <div style={{ ...styles.groupAvatar, background: color }}>
        {group.name[0].toUpperCase()}
      </div>

      <div style={styles.rowContent}>
        <div style={styles.nameRow}>
          <span style={{ ...styles.name, ...(isUnread ? { fontWeight: 700 } : {}) }}>
            {group.name}
          </span>
          <div style={styles.timeLockRow}>
            {group.is_public
              ? <span style={styles.publicBadge}>PUBLIC</span>
              : <span style={styles.lockIcon}>🔒</span>
            }
            <span style={styles.time}>{formatTime(preview?.created_at)}</span>
          </div>
        </div>
        <div style={{ ...styles.preview, ...(isUnread ? styles.previewUnread : {}) }}>
          {preview
            ? `${preview.username}: ${truncate(preview.text)}`
            : 'No messages yet'}
        </div>
      </div>

      {isUnread && <div style={styles.unreadDot} />}
    </div>
  );
}

// ── DM Row ────────────────────────────────────

function DMRow({ convo, profile, onlineUsers, onOpenDM }) {
  const other = convo.otherUser;
  const hasUnread = convo.unreadCount > 0;
  const isOnline = onlineUsers.has(other?.id);
  const initial = (other?.username || '?')[0].toUpperCase();

  return (
    <div
      style={{
        ...styles.row,
        ...(hasUnread ? styles.rowUnread : {}),
      }}
      onClick={() => onOpenDM(convo)}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ ...styles.avatar, background: other?.color || '#5eed8a' }}>
          {initial}
        </div>
        {isOnline && <div style={styles.onlineDot} />}
      </div>

      <div style={styles.rowContent}>
        <div style={styles.nameRow}>
          <span style={{ ...styles.name, ...(hasUnread ? { fontWeight: 700 } : {}) }}>
            {other?.username || 'User'}
          </span>
          <span style={styles.time}>{formatTime(convo.lastMessage?.created_at)}</span>
        </div>
        <div style={{ ...styles.preview, ...(hasUnread ? styles.previewUnread : {}) }}>
          {convo.lastMessage?.username === profile?.username ? 'You: ' : ''}
          {truncate(convo.lastMessage?.text)}
        </div>
      </div>

      {hasUnread && (
        <div style={styles.badge}>
          {convo.unreadCount > 9 ? '9+' : convo.unreadCount}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────

export default function ChatInbox({ session, onOpenGroup, onOpenDM, onCreateGroup, onJoinGroup }) {
  const {
    sectorGroups, customGroups, allGroups, activeGroup,
    dmConversations, profile, onlineUsers,
  } = useGroup();

  const [groupPreviews, setGroupPreviews] = useState({});
  const [showStaleGroups, setShowStaleGroups] = useState(false);
  const [showAllDMs, setShowAllDMs] = useState(false);

  // Batch-fetch latest message per group
  useEffect(() => {
    const ids = allGroups.map(g => g.id);
    if (!ids.length) return;

    supabase
      .from('chat_messages')
      .select('group_id, text, username, created_at')
      .in('group_id', ids)
      .order('created_at', { ascending: false })
      .limit(400)
      .then(({ data }) => {
        const map = {};
        for (const msg of (data || [])) {
          if (!map[msg.group_id]) map[msg.group_id] = msg;
        }
        setGroupPreviews(map);
      });
  }, [allGroups]);

  const isGroupUnread = useCallback((groupId) => {
    const lastMsg = groupPreviews[groupId];
    if (!lastMsg) return false;
    const lastVisited = safeGet(`uptik_last_visited_${groupId}`);
    if (!lastVisited) return true;
    return new Date(lastMsg.created_at) > new Date(lastVisited);
  }, [groupPreviews]);

  const isGroupStale = useCallback((groupId) => {
    const lastMsg = groupPreviews[groupId];
    if (!lastMsg) return true;
    return Date.now() - new Date(lastMsg.created_at).getTime() > WEEK_MS;
  }, [groupPreviews]);

  const sortGroups = useCallback((groups) => {
    return [...groups].sort((a, b) => {
      const aU = isGroupUnread(a.id), bU = isGroupUnread(b.id);
      if (aU !== bU) return aU ? -1 : 1;
      const aT = groupPreviews[a.id]?.created_at
        ? new Date(groupPreviews[a.id].created_at).getTime() : 0;
      const bT = groupPreviews[b.id]?.created_at
        ? new Date(groupPreviews[b.id].created_at).getTime() : 0;
      return bT - aT;
    });
  }, [isGroupUnread, groupPreviews]);

  // Split into active vs stale, public vs custom
  const sortedSector = sortGroups(sectorGroups);
  const sortedCustom = sortGroups(customGroups);
  const activeSector = sortedSector.filter(g => !isGroupStale(g.id));
  const staleSector  = sortedSector.filter(g => isGroupStale(g.id));
  const activeCustom = sortedCustom.filter(g => !isGroupStale(g.id));
  const staleCustom  = sortedCustom.filter(g => isGroupStale(g.id));
  const staleCount   = staleSector.length + staleCustom.length;

  // DMs: unread first, then top 2 recent, rest hidden
  const unreadDMs  = dmConversations.filter(c => c.unreadCount > 0);
  const readDMs    = dmConversations.filter(c => c.unreadCount === 0);
  const visibleDMs = [...unreadDMs, ...readDMs.slice(0, 2)];
  const hiddenDMs  = readDMs.slice(2);

  const handleOpenGroup = (group) => {
    safeSet(`uptik_last_visited_${group.id}`, new Date().toISOString());
    onOpenGroup(group);
  };

  const hasAnyGroups = sectorGroups.length > 0 || customGroups.length > 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Chats</span>
      </div>

      <div style={styles.scrollArea}>

        {/* ── GROUP CHATS ── */}
        {hasAnyGroups && (
          <>
            <div style={styles.sectionLabel}>Group Chats</div>

            {/* Active public (sector) groups */}
            {activeSector.map(g => (
              <GroupRow
                key={g.id}
                group={g}
                preview={groupPreviews[g.id]}
                isUnread={isGroupUnread(g.id)}
                isActive={activeGroup?.id === g.id}
                onOpen={handleOpenGroup}
              />
            ))}

            {/* Active custom/private groups */}
            {activeCustom.map(g => (
              <GroupRow
                key={g.id}
                group={g}
                preview={groupPreviews[g.id]}
                isUnread={isGroupUnread(g.id)}
                isActive={activeGroup?.id === g.id}
                onOpen={handleOpenGroup}
              />
            ))}

            {/* Stale groups toggle */}
            {staleCount > 0 && (
              <>
                <div style={styles.toggleRow} onClick={() => setShowStaleGroups(v => !v)}>
                  <span style={styles.toggleText}>
                    {showStaleGroups ? '▲' : '▼'} {staleCount} more group{staleCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {showStaleGroups && (
                  <>
                    {staleSector.map(g => (
                      <GroupRow
                        key={g.id}
                        group={g}
                        preview={groupPreviews[g.id]}
                        isUnread={isGroupUnread(g.id)}
                        isActive={activeGroup?.id === g.id}
                        onOpen={handleOpenGroup}
                      />
                    ))}
                    {staleCustom.map(g => (
                      <GroupRow
                        key={g.id}
                        group={g}
                        preview={groupPreviews[g.id]}
                        isUnread={isGroupUnread(g.id)}
                        isActive={activeGroup?.id === g.id}
                        onOpen={handleOpenGroup}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── MESSAGES (DMs) ── */}
        {dmConversations.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Messages</div>

            {visibleDMs.map(c => (
              <DMRow
                key={c.groupId}
                convo={c}
                profile={profile}
                onlineUsers={onlineUsers}
                onOpenDM={onOpenDM}
              />
            ))}

            {hiddenDMs.length > 0 && !showAllDMs && (
              <div style={styles.toggleRow} onClick={() => setShowAllDMs(true)}>
                <span style={styles.toggleText}>
                  See all messages ({hiddenDMs.length} more)
                </span>
              </div>
            )}
            {showAllDMs && hiddenDMs.map(c => (
              <DMRow
                key={c.groupId}
                convo={c}
                profile={profile}
                onlineUsers={onlineUsers}
                onOpenDM={onOpenDM}
              />
            ))}
          </>
        )}

        {/* Empty state */}
        {!hasAnyGroups && dmConversations.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>💬</div>
            <div style={styles.emptyTitle}>No chats yet</div>
            <div style={styles.emptyHint}>Create or join a group to get started</div>
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>

      {/* Bottom action buttons */}
      <div style={styles.bottomBar}>
        <button style={styles.actionBtn} onClick={onCreateGroup}>
          + Create Group
        </button>
        <button style={styles.actionBtnSecondary} onClick={onJoinGroup}>
          Join Group
        </button>
      </div>
    </div>
  );
}
