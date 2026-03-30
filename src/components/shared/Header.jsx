// ============================================
// UPTIKALERTS — Header.jsx
// Top header bar — context-aware per tab
// ============================================

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function Header({ group, profile, isAdmin, isModerator, activeTab, allGroups, onGroupSwitch, onGroupNameUpdate, onSignOut }) {
  const [editing, setEditing]         = useState(false);
  const [editName, setEditName]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const canEdit        = isAdmin || isModerator;
  const hasMultiGroup  = (allGroups || []).length > 1;

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showDropdown]);

  const handleSave = async () => {
    const name = editName.trim();
    if (!name || saving) return;
    setSaving(true);
    const { error } = await supabase.from('groups').update({ name }).eq('id', group.id);
    setSaving(false);
    if (error) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 2000);
      setEditName(group?.name || '');
      setEditing(false);
      return;
    }
    setEditing(false);
    onGroupNameUpdate?.(name);
  };

  const handleGroupSwitch = (g) => {
    setShowDropdown(false);
    onGroupSwitch?.(g);
  };

  if (activeTab === 'chat') {
    return (
      <div style={styles.header}>
        <div style={styles.chatRow}>
          <span style={styles.chatLabel}>GroupChat</span>
          <span style={styles.chatSep}> · </span>

          {editing ? (
            <>
              <input
                style={{ ...styles.editInput, borderColor: saveError ? '#EF4444' : 'var(--border)' }}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                autoFocus
              />
              <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? '…' : saveError ? 'Error' : 'Save'}
              </button>
              <button style={styles.cancelBtn} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <div ref={dropdownRef} style={styles.groupNameWrap}>
              <span
                style={{
                  ...styles.chatGroupName,
                  cursor: canEdit ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (!canEdit) return;
                  setEditName(group?.name || '');
                  setEditing(true);
                }}
              >
                {group?.name || 'Group'}
              </span>

              {hasMultiGroup && (
                <>
                  <button
                    style={styles.dropdownToggle}
                    onClick={() => setShowDropdown(prev => !prev)}
                  >
                    ▼
                  </button>

                  {showDropdown && (
                    <div style={styles.dropdown}>
                      {(allGroups || []).map(g => (
                        <button
                          key={g.id}
                          style={{
                            ...styles.dropdownItem,
                            background: g.id === group?.id ? 'var(--green-bg)' : 'transparent',
                            color: g.id === group?.id ? 'var(--green)' : 'var(--text1)',
                          }}
                          onClick={() => handleGroupSwitch(g)}
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.header}>
      <div>
        <div style={styles.logoRow}>
          <span style={styles.logoUp}>UpTik</span>
          <span style={styles.logoAlerts}>Alerts</span>
        </div>
        <div style={styles.slogan}>Trade smarter, together</div>
      </div>
      <div style={styles.avatar}>
        {profile?.username?.[0]?.toUpperCase() || 'U'}
      </div>
    </div>
  );
}

const styles = {
  header: {
    background: '#354030',
    borderBottom: '2px solid #5a9a35',
    padding: '13px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  // ── Chat tab header ──
  chatRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  chatLabel: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text1)',
  },
  chatSep: {
    fontSize: 16,
    color: 'var(--text3)',
    fontWeight: 400,
  },
  groupNameWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  chatGroupName: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--green)',
  },
  dropdownToggle: {
    background: 'none',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 9,
    cursor: 'pointer',
    padding: '2px 4px',
    lineHeight: 1,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    zIndex: 100,
    minWidth: 140,
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '10px 14px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'left',
    fontFamily: 'var(--font)',
  },
  editInput: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text1)',
    background: 'var(--card2)',
    border: '1.5px solid var(--border)',
    borderRadius: 6,
    padding: '3px 8px',
    fontFamily: 'var(--font)',
    outline: 'none',
    width: 130,
  },
  saveBtn: {
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    background: 'var(--green)',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    marginLeft: 6,
  },
  cancelBtn: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text2)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginLeft: 2,
  },
  // ── Default header ──
  logoRow:    { display: 'flex', alignItems: 'center' },
  logoUp:     { fontSize: 18, fontWeight: 700, color: '#a0e070' },
  logoAlerts: { fontSize: 18, fontWeight: 700, color: '#f0f0f0' },
  slogan:     { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 500, color: '#fff',
  },
};
