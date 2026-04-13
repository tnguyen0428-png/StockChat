// ============================================
// UPTIKALERTS — ChatInbox.jsx
// Single-card inbox: public group + collapsible private chats
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import { safeSet } from '../../lib/safeStorage';
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
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function sanitizePreview(text) {
  if (!text) return 'No messages yet';
  // Strip ```uptik ... ``` AI response blocks
  let s = text.replace(/```uptik[\s\S]*?```/gi, '[AI response]');
  // If it collapsed to just [AI response], return early
  if (s.trim() === '[AI response]') return '[AI response]';
  // Strip remaining code blocks
  s = s.replace(/```[\s\S]*?```/g, '[code]');
  // Strip markdown syntax chars
  s = s.replace(/[*_~`>#]/g, '');
  // Collapse whitespace/newlines
  s = s.replace(/\s+/g, ' ').trim();
  return s || 'No messages yet';
}

// ── SVG Icons ────────────────────────────────

function GlobeSVG({ size = 20, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LockSVG({ size = 16, color = '#7B68EE' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ChevronSVG({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

// ── Group Row ─────────────────────────────────

function GroupRow({ group, preview, isActive, onOpen, icon }) {
  const sanitized = sanitizePreview(preview?.text);
  const previewText = preview
    ? `${preview.username}: ${truncate(sanitized)}`
    : 'No messages yet';

  return (
    <div
      style={{ ...styles.row, ...(isActive ? styles.rowActive : {}) }}
      onClick={() => onOpen(group)}
    >
      <div style={styles.iconWrap}>{icon}</div>
      <div style={styles.rowContent}>
        <div style={styles.nameRow}>
          <span style={styles.name}>
            {group.is_public ? 'Public Chat' : group.name}
          </span>
          <span style={styles.time}>{formatTime(preview?.created_at)}</span>
        </div>
        <div style={styles.preview}>{previewText}</div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────

export default function ChatInbox({ session, onOpenGroup, onCreateGroup, onJoinGroup }) {
  const { publicGroups, customGroups, allGroups, activeGroup } = useGroup();

  const [groupPreviews, setGroupPreviews] = useState({});
  const [memberCounts, setMemberCounts] = useState({});
  const [privateExpanded, setPrivateExpanded] = useState(false);

  // Batch-fetch latest message per group
  useEffect(() => {
    const idSet = new Set([...allGroups.map(g => g.id), ...publicGroups.map(g => g.id)]);
    const ids = [...idSet];
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
  }, [allGroups, publicGroups]);

  // Batch-fetch member counts per group
  useEffect(() => {
    const idSet = new Set([...allGroups.map(g => g.id), ...publicGroups.map(g => g.id)]);
    const ids = [...idSet];
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
  }, [allGroups, publicGroups]);

  const handleOpenGroup = (group) => {
    safeSet(`uptik_last_visited_${group.id}`, new Date().toISOString());
    onOpenGroup(group);
  };

  const showNewGroupBtn = privateExpanded || customGroups.length === 0;

  return (
    <div style={styles.container}>
      {/* Navy Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Chats</span>
      </div>

      <div style={styles.scrollArea}>
        {/* Single card */}
        <div style={styles.card}>

          {/* Public group rows */}
          {publicGroups.map(g => (
            <GroupRow
              key={g.id}
              group={g}
              preview={groupPreviews[g.id]}
              isActive={activeGroup?.id === g.id}
              onOpen={handleOpenGroup}
              icon={<GlobeSVG size={20} color="#4a90d9" />}
            />
          ))}

          {/* Private Chats divider */}
          <div
            style={styles.privateDivider}
            onClick={() => setPrivateExpanded(v => !v)}
          >
            <LockSVG size={14} color="#64748b" />
            <span style={styles.privateDividerText}>
              Private Chats ({customGroups.length})
            </span>
            <span style={styles.chevron}>
              <ChevronSVG open={privateExpanded} />
            </span>
          </div>

          {/* Private group rows */}
          {privateExpanded && customGroups.map(g => {
            const color = g.color || '#7B68EE';
            return (
              <GroupRow
                key={g.id}
                group={g}
                preview={groupPreviews[g.id]}
                isActive={activeGroup?.id === g.id}
                onOpen={handleOpenGroup}
                icon={<LockSVG size={18} color={color} />}
              />
            );
          })}

          {/* + New Group button */}
          {showNewGroupBtn && (
            <div style={styles.newGroupRow}>
              <button style={styles.newGroupBtn} onClick={onCreateGroup}>
                + New Group
              </button>
            </div>
          )}
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
