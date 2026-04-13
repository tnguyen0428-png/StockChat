// ============================================
// UPTIKALERTS — ChatHeader.jsx
// Header shown inside a group conversation
// Layout: ← | Group Name / member count | [Invite]
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function ChatHeader({ convo, onBack, onInvite, isAdmin, isModerator }) {
  const name = convo?.name || 'Chat';
  const isPublic = convo?.is_public;
  const [memberCount, setMemberCount] = useState(null);

  useEffect(() => {
    if (!convo?.id) return;
    supabase
      .from('group_members')
      .select('group_id', { count: 'exact', head: true })
      .eq('group_id', convo.id)
      .then(({ count }) => { if (count != null) setMemberCount(count); });
  }, [convo?.id]);

  return (
    <div style={styles.header}>
      <button style={styles.backBtn} onClick={onBack}>
        <svg
          width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ display: 'block' }}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div style={styles.titleWrap}>
        <div style={styles.nameRow}>
          <span style={styles.name} title={name}>{name}</span>
          {isPublic
            ? <span style={styles.publicBadge}>PUBLIC</span>
            : <span style={styles.lockIcon}>🔒</span>
          }
        </div>
        {memberCount != null && (
          <div style={styles.memberCount}>{memberCount} members</div>
        )}
      </div>

      {onInvite ? (
        <button style={styles.inviteBtn} onClick={onInvite}>
          Invite
        </button>
      ) : (
        <div style={styles.invitePlaceholder} />
      )}
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    background: '#132d52',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    minHeight: 52,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    padding: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  titleWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  publicBadge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: '#5eed8a',
    background: 'rgba(94,237,138,0.15)',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  lockIcon: {
    fontSize: 12,
    flexShrink: 0,
  },
  memberCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  inviteBtn: {
    padding: '5px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: 'inherit',
  },
  invitePlaceholder: {
    width: 56,
    flexShrink: 0,
  },
};
