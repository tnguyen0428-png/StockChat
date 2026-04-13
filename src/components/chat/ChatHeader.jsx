// ============================================
// UPTIKALERTS — ChatHeader.jsx
// Header shown inside a group conversation
// Layout: ← Back | Group Name 🔒/PUBLIC | [Invite]
// ============================================

export default function ChatHeader({ convo, onBack, onInvite, isAdmin, isModerator }) {
  const name = convo?.name || 'Chat';
  const isPublic = convo?.is_public;

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
        <span>Back</span>
      </button>

      <div style={styles.titleWrap}>
        <span style={styles.name} title={name}>{name}</span>
        {isPublic
          ? <span style={styles.publicBadge}>PUBLIC</span>
          : <span style={styles.lockIcon}>🔒</span>
        }
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
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    minHeight: 46,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    background: 'none',
    border: 'none',
    color: 'var(--text1)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 6px 4px 0',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  titleWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  publicBadge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: '#22c55e',
    background: 'rgba(34, 197, 94, 0.12)',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  lockIcon: {
    fontSize: 12,
    flexShrink: 0,
  },
  inviteBtn: {
    padding: '5px 14px',
    background: '#132d52',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: 'inherit',
  },
  // Keeps the title centered when there's no invite button
  invitePlaceholder: {
    width: 60,
    flexShrink: 0,
  },
};
