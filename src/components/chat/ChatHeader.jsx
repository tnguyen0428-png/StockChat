// ============================================
// UPTIKALERTS — ChatHeader.jsx
// Header shown inside a group conversation
// Layout: ← | Icon + Group Name / member count | [Invite]
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

function GlobeSVG() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="#b0c4d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LockSVG({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function ChatHeader({ convo, onBack, onInvite, isAdmin, isModerator }) {
  const isPublic = convo?.is_public;
  const displayName = isPublic ? 'Public Chat' : (convo?.name || 'Chat');
  const groupColor = convo?.color || '#7B68EE';
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
          width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="#fff"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div style={styles.iconWrap}>
        {isPublic ? <GlobeSVG /> : <LockSVG color={groupColor} />}
      </div>

      <div style={styles.titleWrap}>
        <span style={styles.name} title={displayName}>{displayName}</span>
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
    gap: 10,
    padding: '8px 12px',
    background: '#132d52',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    minHeight: 56,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    padding: 4,
    flexShrink: 0,
  },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  memberCount: {
    fontSize: 11,
    color: '#b0c4d8',
    marginTop: 1,
  },
  inviteBtn: {
    padding: '6px 14px',
    background: '#22c55e',
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
