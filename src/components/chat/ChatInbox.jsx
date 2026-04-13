// ============================================
// UPTIKALERTS — ChatInbox.jsx
// Groups-only inbox with "+ New" dropdown
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
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

function GroupRow({ group, preview, isUnread, isActive, onOpen, memberCount }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ ...styles.preview, ...(isUnread ? styles.previewUnread : {}) }}>
            {preview
              ? `${preview.username}: ${truncate(preview.text)}`
              : 'No messages yet'}
          </div>
          {memberCount != null && (
            <span style={styles.memberCount}>{memberCount} members</span>
          )}
        </div>
      </div>

      {isUnread && <div style={styles.unreadDot} />}
    </div>
  );
}

// ── Main Component ────────────────────────────

export default function ChatInbox({ session, onOpenGroup, onCreateGroup, onJoinGroup }) {
  const { sectorGroups, customGroups, allGroups, activeGroup } = useGroup();

  const [groupPreviews, setGroupPreviews] = useState({});
  const [memberCounts, setMemberCounts] = useState({});
  const [showStaleGroups, setShowStaleGroups] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const menuRef = useRef(null);

  // Outside-click to close dropdown
  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showNewMenu]);

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

  // Batch-fetch member counts per group
  useEffect(() => {
    const ids = allGroups.map(g => g.id);
    if (!ids.length) return;

    supabase
      .from('group_members')
      .select('group_id')
      .in('group_id', ids)
      .then(({ data }) => {
        const counts = {};
        for (const row of (data || [])) {
          counts[row.group_id] = (counts[row.group_id] || 0) + 1;
        }
        setMemberCounts(counts);
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

  const sortedSector = sortGroups(sectorGroups);
  const sortedCustom = sortGroups(customGroups);
  const activeSector = sortedSector.filter(g => !isGroupStale(g.id));
  const staleSector  = sortedSector.filter(g => isGroupStale(g.id));
  const activeCustom = sortedCustom.filter(g => !isGroupStale(g.id));
  const staleCustom  = sortedCustom.filter(g => isGroupStale(g.id));
  const staleCount   = staleSector.length + staleCustom.length;

  const handleOpenGroup = (group) => {
    safeSet(`uptik_last_visited_${group.id}`, new Date().toISOString());
    onOpenGroup(group);
  };

  const hasAnyGroups = sectorGroups.length > 0 || customGroups.length > 0;
  const hasPrivateGroup = customGroups.length > 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Chats</span>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button style={styles.newBtn} onClick={() => setShowNewMenu(v => !v)}>
            + New
          </button>
          {showNewMenu && (
            <div style={styles.newDropdown}>
              <div style={styles.dropdownItem} onClick={() => { setShowNewMenu(false); onCreateGroup(); }}>
                Create Private Group
              </div>
              <div style={{ ...styles.dropdownItem, borderBottom: 'none' }} onClick={() => { setShowNewMenu(false); onJoinGroup(); }}>
                Join with Code
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={styles.scrollArea}>

        {/* Nudge card — shown when user has no private groups */}
        {!hasPrivateGroup && (
          <div style={styles.nudgeCard}>
            <div style={styles.nudgeIcon}>🔒</div>
            <div style={styles.nudgeTitle}>Start a private group</div>
            <div style={styles.nudgeHint}>Invite friends and trade ideas privately</div>
            <button style={styles.nudgeBtn} onClick={onCreateGroup}>Create Group</button>
          </div>
        )}

        {/* ── GROUP CHATS ── */}
        {hasAnyGroups && (
          <>
            <div style={styles.sectionLabel}>Group Chats</div>

            {activeSector.map(g => (
              <GroupRow
                key={g.id}
                group={g}
                preview={groupPreviews[g.id]}
                isUnread={isGroupUnread(g.id)}
                isActive={activeGroup?.id === g.id}
                onOpen={handleOpenGroup}
                memberCount={memberCounts[g.id]}
              />
            ))}

            {activeCustom.map(g => (
              <GroupRow
                key={g.id}
                group={g}
                preview={groupPreviews[g.id]}
                isUnread={isGroupUnread(g.id)}
                isActive={activeGroup?.id === g.id}
                onOpen={handleOpenGroup}
                memberCount={memberCounts[g.id]}
              />
            ))}

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
                        memberCount={memberCounts[g.id]}
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
                        memberCount={memberCounts[g.id]}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Empty state */}
        {!hasAnyGroups && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>💬</div>
            <div style={styles.emptyTitle}>No chats yet</div>
            <div style={styles.emptyHint}>Create or join a group to get started</div>
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
