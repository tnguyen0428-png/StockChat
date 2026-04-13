// ============================================
// UPTIKALERTS — JoinGroupModal.jsx
// Modal for entering an invite code to join a custom group
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function JoinGroupModal({ open, onClose, onJoined }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setCode('');
      setError('');
      setLoading(false);
    }
  }, [open]);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('join_custom_group', {
        p_invite_code: trimmed,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      if (!data?.success) {
        setError(data?.error || 'Invalid invite code. Please try again.');
        return;
      }

      onJoined({ id: data.group_id, name: data.group_name });
      onClose();
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.title}>Join a Group</h3>
        <p style={styles.hint}>Enter the invite code shared by a group member</p>

        <input
          style={styles.input}
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="e.g. ABC123"
          maxLength={24}
          onKeyDown={e => e.key === 'Enter' && !loading && handleJoin()}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            style={{
              ...styles.joinBtn,
              opacity: !code.trim() || loading ? 0.5 : 1,
            }}
            onClick={handleJoin}
            disabled={!code.trim() || loading}
          >
            {loading ? 'Joining…' : 'Join Group'}
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
    margin: '0 0 6px',
  },
  hint: {
    fontSize: 13,
    color: 'var(--text3)',
    margin: '0 0 16px',
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'var(--text1)',
    background: 'var(--bg)',
    border: '1.5px solid var(--border)',
    borderRadius: 10,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  error: {
    marginTop: 8,
    fontSize: 12,
    color: '#e74c3c',
    fontWeight: 500,
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 20,
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
  joinBtn: {
    flex: 2,
    padding: '11px 0',
    background: '#132d52',
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
