// ============================================
// UPTIKALERTS — CreateGroupModal.jsx
// Shared modal for creating private group chats
// Used by Header.jsx and HomeTab.jsx
// ============================================

import { useState, useRef, useEffect } from 'react';
import { useGroup } from '../../context/GroupContext';

const GROUP_COLORS = ['#7B68EE', '#4CAF50', '#FF7043', '#42A5F5', '#FFB300'];

export default function CreateGroupModal({ open, onClose, onCreated }) {
  const { createCustomGroup } = useGroup();

  const [name, setName]       = useState('');
  const [color, setColor]     = useState('#7B68EE');
  const [creating, setCreating] = useState(false);
  const [error, setError]     = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName('');
      setColor('#7B68EE');
      setError('');
      setCreating(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError('');

    const result = await createCustomGroup(name, color);

    if (result.error) {
      setError(result.error);
      setCreating(false);
      return;
    }

    setCreating(false);
    onCreated?.(result.group);
  };

  return (
    <div style={S.overlay} onClick={() => { onClose(); setError(''); }}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.title}>Create group</div>

        <div style={S.label}>Group name</div>
        <input
          ref={inputRef}
          style={S.input}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="e.g. Options Gang"
          maxLength={40}
        />

        <div style={S.label}>Color</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {GROUP_COLORS.map(c => (
            <div
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer',
                border: color === c ? '2.5px solid var(--text1)' : '2.5px solid transparent',
                transition: 'border 0.15s',
              }}
            />
          ))}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{error}</div>
        )}

        <button
          style={{ ...S.btn, opacity: creating || !name.trim() ? 0.5 : 1 }}
          onClick={handleCreate}
          disabled={creating || !name.trim()}
        >
          {creating ? 'Creating...' : 'Create group'}
        </button>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 300,
    padding: '0 0 20px',
  },
  modal: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '20px 16px 16px',
    width: '100%',
    maxWidth: 360,
    margin: '0 12px',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text1)',
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text3)',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 15,
    color: 'var(--text1)',
    fontFamily: 'var(--font)',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 16,
  },
  btn: {
    width: '100%',
    background: 'var(--green)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px 0',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};
