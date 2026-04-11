// ============================================
// UPTIKALERTS — DMInbox.jsx
// DM conversation list with inline delete + confirm
// ============================================

import { useState, useCallback } from 'react';
import { useGroup } from '../../context/GroupContext';

// ── Trash icon SVG ──
function TrashIcon({ size = 15, color = '#b0b8c4' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ── Single DM row with inline confirm delete ──
function DMRow({ convo, onOpenDM, onDelete, profile, isOnline }) {
  const [confirming, setConfirming] = useState(false);

  const other = convo.otherUser;
  const hasUnread = convo.unreadCount > 0;
  const initial = (other?.username || '?')[0].toUpperCase();
  const username = other?.username || 'User';

  const formatTime = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const truncate = (text, max = 36) => {
    if (!text) return 'No messages yet';
    return text.length > max ? text.slice(0, max) + '...' : text;
  };

  const handleTrashClick = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirming(true);
  }, []);

  const handleConfirmDelete = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete();
  }, [onDelete]);

  const handleCancel = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirming(false);
  }, []);

  // ── Confirm state: inline bar replaces row content ──
  if (confirming) {
    return (
      <div style={styles.rowWrapper}>
        <div style={styles.confirmBar}>
          <span style={styles.confirmLabel}>Delete chat with <b>{username}</b>?</span>
          <div style={styles.confirmActions}>
            <button type="button" style={styles.cancelBtn} onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" style={styles.confirmDeleteBtn} onClick={handleConfirmDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal row ──
  return (
    <div style={styles.rowWrapper}>
      <div
        style={{ ...styles.row, ...(hasUnread ? styles.rowUnread : {}) }}
        onClick={() => onOpenDM(convo)}
      >
        <div style={{ position: 'relative' }}>
          <div style={{ ...styles.avatar, background: other?.color || '#5eed8a' }}>
            {initial}
          </div>
          {isOnline && <div style={styles.onlineDot} />}
        </div>

        <div style={styles.content}>
          <div style={styles.nameRow}>
            <span style={{ ...styles.name, ...(hasUnread ? { fontWeight: 700 } : {}) }}>
              {username}
            </span>
            <span style={styles.time}>
              {formatTime(convo.lastMessage?.created_at)}
            </span>
          </div>
          <div style={{ ...styles.preview, ...(hasUnread ? { color: 'var(--text1)', fontWeight: 500 } : {}) }}>
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

      <button
        type="button"
        style={styles.deleteBtn}
        onClick={handleTrashClick}
        title="Delete conversation"
      >
        <TrashIcon size={14} color="#b0b8c4" />
      </button>
    </div>
  );
}

// ── Main inbox ──
export default function DMInbox({ onOpenDM }) {
  const { dmConversations, profile, deleteDM, onlineUsers } = useGroup();

  if (dmConversations.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>💬</div>
        <div style={styles.emptyTitle}>No conversations yet</div>
        <div style={styles.emptyHint}>
          Tap a username in group chat to start a private conversation
        </div>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {dmConversations.map(convo => (
        <DMRow
          key={convo.groupId}
          convo={convo}
          onOpenDM={onOpenDM}
          onDelete={() => deleteDM(convo.groupId)}
          profile={profile}
          isOnline={onlineUsers.has(convo.otherUser?.id)}
        />
      ))}
    </div>
  );
}

const styles = {
  list: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  rowWrapper: {
    position: 'relative',
    borderBottom: '1px solid var(--border)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 52px 14px 16px',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  rowUnread: {
    background: 'rgba(94, 237, 138, 0.04)',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#22c55e',
    border: '2px solid var(--card, #f8fafc)',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 3,
  },
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text1)',
  },
  time: {
    fontSize: 11,
    color: 'var(--text3)',
    flexShrink: 0,
  },
  preview: {
    fontSize: 13,
    color: 'var(--text3)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  badge: {
    background: '#5eed8a',
    color: '#0a1628',
    fontSize: 11,
    fontWeight: 700,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
    flexShrink: 0,
  },
  // Always-visible trash icon
  deleteBtn: {
    position: 'absolute',
    top: '50%',
    right: 8,
    transform: 'translateY(-50%)',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
    opacity: 0.45,
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
  // Inline confirmation bar
  confirmBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'rgba(231, 76, 60, 0.06)',
    gap: 12,
  },
  confirmLabel: {
    fontSize: 13,
    color: 'var(--text1, #1a2d4a)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  confirmActions: {
    display: 'flex',
    gap: 8,
    flexShrink: 0,
  },
  cancelBtn: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text3, #7a8ea3)',
    background: 'transparent',
    border: '1px solid var(--border, #d8e2ed)',
    borderRadius: 8,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmDeleteBtn: {
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: '#e74c3c',
    border: 'none',
    borderRadius: 8,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text1)',
  },
  emptyHint: {
    fontSize: 13,
    color: 'var(--text3)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
};
