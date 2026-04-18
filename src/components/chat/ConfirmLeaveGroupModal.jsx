// ============================================
// UPTIKALERTS — ConfirmLeaveGroupModal.jsx
// Safety net between a full-swipe on a private group row and the actual
// leaveCustomGroup call. Matches the visual grammar of CreateGroupModal
// and JoinGroupModal: centered sheet over a dimmed overlay, two-button
// footer, red destructive action.
// ============================================

import { useState } from 'react';

export default function ConfirmLeaveGroupModal({ open, group, onCancel, onConfirm }) {
  const [loading, setLoading] = useState(false);

  if (!open || !group) return null;

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm?.(group);
    } finally {
      // Parent typically unmounts us on success, but if it keeps us open on
      // failure we need to reset so the user can retry or cancel.
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={loading ? undefined : onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.title}>Leave "{group.name}"?</h3>
        <p style={styles.hint}>
          You'll stop receiving messages from this group. You can rejoin later if someone sends you a new invite link.
        </p>

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button style={styles.confirmBtn} onClick={handleConfirm} disabled={loading}>
            {loading ? 'Leaving…' : 'Leave'}
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
    padding: '24px 20px',
    width: '100%',
    maxWidth: 360,
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text1)',
    margin: '0 0 8px',
  },
  hint: {
    fontSize: 13,
    color: 'var(--text3)',
    margin: '0 0 20px',
    lineHeight: 1.5,
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
  confirmBtn: {
    flex: 2,
    padding: '11px 0',
    // iOS system red — matches the red reveal panel on the swipe itself so
    // the visual chain from gesture → confirmation is unbroken.
    background: '#FF3B30',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
};
