// ============================================
// UPTIKALERTS — CreateGroupModal.jsx
// Replaces window.prompt() — a proper in-app sheet for naming a new
// private group. On submit the parent runs createCustomGroup and the
// ShareInviteModal takes over. Visual grammar matches JoinGroupModal.
// ============================================

import { useEffect, useRef, useState } from 'react';

export default function CreateGroupModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Reset + autofocus whenever the modal (re)opens. Autofocus is wrapped in
  // a rAF so it lands after the browser finishes painting the sheet — iOS
  // Safari otherwise drops the focus call silently.
  useEffect(() => {
    if (open) {
      setName('');
      setError('');
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError('');
    try {
      const result = await onCreate(trimmed);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      // Parent closes us + opens ShareInviteModal on success.
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[CreateGroupModal] onCreate threw:', err?.message || err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.title}>Create a Group</h3>
        <p style={styles.hint}>Private — invite anyone with a link. You can rename it later.</p>

        <input
          ref={inputRef}
          style={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name your group"
          maxLength={40}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          // Chat-style input hints — keep iOS from showing the password/login
          // autofill chip above the keyboard, matching the rest of the app.
          type="text"
          name="group-name"
          inputMode="text"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="words"
          spellCheck={true}
          data-1p-ignore="true"
          data-lpignore="true"
        />

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            style={{ ...styles.createBtn, opacity: !name.trim() || loading ? 0.5 : 1 }}
            onClick={handleSubmit}
            disabled={!name.trim() || loading}
          >
            {loading ? 'Creating…' : 'Create'}
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
    fontWeight: 500,
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
  createBtn: {
    flex: 2,
    padding: '11px 0',
    background: '#1AAD5E',
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
