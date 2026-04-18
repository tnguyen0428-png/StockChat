// ============================================
// UPTIKALERTS — UserProfilePopup.jsx
// Lightweight popup shown when you tap a username in a chat bubble or the
// smack-talk feed. Confirms the target, then routes the "Message" action
// through openDm() which creates (or reuses) a 2-person private group and
// jumps into it. Matches the visual grammar of ConfirmLeaveGroupModal —
// centered sheet over a dimmed overlay, tight footer, primary/secondary
// button pair — so we don't invent a second modal dialect.
// ============================================

import { useState } from 'react';

export default function UserProfilePopup({ open, user, onCancel, onMessage }) {
  const [loading, setLoading] = useState(false);

  if (!open || !user) return null;

  const handleMessage = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onMessage?.(user);
    } finally {
      // Parent typically unmounts us on success; if it keeps us open on
      // failure we need to reset so the user can retry.
      setLoading(false);
    }
  };

  // Fallback color if the profile didn't carry one through.
  const avatarColor = user.color || '#7B68EE';
  const initial = (user.username || 'U').charAt(0).toUpperCase();

  return (
    <div style={styles.overlay} onClick={loading ? undefined : onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ ...styles.avatar, background: avatarColor }}>{initial}</div>
          <div style={styles.nameWrap}>
            <div style={styles.name}>{user.username || 'User'}</div>
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button style={styles.messageBtn} onClick={handleMessage} disabled={loading}>
            {loading ? 'Opening…' : `Message @${user.username || 'user'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '0 20px',
  },
  modal: {
    background: 'var(--card)',
    borderRadius: 16,
    padding: '20px',
    width: '100%',
    maxWidth: 340,
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text1)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  actions: {
    display: 'flex',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    padding: '11px 0',
    background: 'transparent',
    color: 'var(--text3)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  messageBtn: {
    flex: 2,
    padding: '11px 0',
    // Saturated app green (var --green-button resolves to #2a7d4b light /
    // #16A34A dark) so the primary action reads as strong and clickable.
    // The earlier --green-bg token was a washed-out tint and made the
    // button look disabled.
    background: 'var(--green-button, #2A7D4B)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
