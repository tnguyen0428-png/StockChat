// ============================================
// UPTIKALERTS — Header.jsx
// Top header bar — context-aware per tab
// Now with custom group creation + invite sharing
// ============================================

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useGroup } from '../../context/GroupContext';
import CreateGroupModal from './CreateGroupModal';
import InviteModal from './InviteModal';
import { DarkModeToggle, useTheme } from '../tabs/alertsCasinoComponents';
import { isMarketOpen, isAfterHours } from '../../utils/marketUtils';


export default function Header({ group, profile, isAdmin, isModerator, activeTab, allGroups, onGroupSwitch, onGroupNameUpdate, onSignOut, onHomePress, onProfilePress, darkMode, setDarkMode }) {
  const { sectorGroups, customGroups } = useGroup();
  const t = useTheme(darkMode);

  const [editing, setEditing]           = useState(false);
  const [editName, setEditName]         = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);

  // Create/invite group modals
  const [showCreate, setShowCreate]     = useState(false);
  const [showInvite, setShowInvite]     = useState(null);

  const dropdownRef  = useRef(null);
  const avatarRef    = useRef(null);

  const canEdit        = isAdmin || isModerator;

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showDropdown && !showCreate && !showInvite) return;
    const handler = (e) => {
      if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showDropdown, showCreate, showInvite]);

  // Close avatar menu on outside click
  useEffect(() => {
    if (!showAvatarMenu) return;
    const handler = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) {
        setShowAvatarMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showAvatarMenu]);

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
      <>
        <div style={{ ...styles.header, borderBottom: '2px solid #2a7d4b' }}>
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

                {/* Custom group color dot */}
                {group && !group.is_public && group.color && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                )}

                {/* Invite button for custom groups */}
                {group && !group.is_public && group.invite_code && (
                  <button
                    style={styles.inviteBtn}
                    onClick={() => setShowInvite(group)}
                  >
                    Invite
                  </button>
                )}

                <button
                  style={styles.dropdownToggle}
                  onClick={() => setShowDropdown(prev => !prev)}
                >
                  ▼
                </button>

                {showDropdown && (
                  <div style={styles.dropdown}>
                    {/* Sector Groups */}
                    {sectorGroups.length > 0 && (
                      <>
                        <div style={styles.dropdownSection}>Sector groups</div>
                        {sectorGroups.map(g => (
                          <button
                            key={g.id}
                            style={{
                              ...styles.dropdownItem,
                              background: g.id === group?.id ? 'var(--green-bg)' : 'transparent',
                              color: g.id === group?.id ? 'var(--green)' : 'var(--text1)',
                            }}
                            onClick={() => handleGroupSwitch(g)}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{g.name}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Custom Groups */}
                    {customGroups.length > 0 && (
                      <>
                        <div style={{ ...styles.dropdownSection, borderTop: sectorGroups.length > 0 ? '1px solid var(--border)' : 'none' }}>
                          My groups
                        </div>
                        {customGroups.map(g => (
                          <button
                            key={g.id}
                            style={{
                              ...styles.dropdownItem,
                              background: g.id === group?.id ? 'var(--green-bg)' : 'transparent',
                              color: g.id === group?.id ? 'var(--green)' : 'var(--text1)',
                            }}
                            onClick={() => handleGroupSwitch(g)}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color || '#7B68EE', flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{g.name}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Create New Group */}
                    <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
                      <button
                        style={styles.createBtn}
                        onClick={() => { setShowDropdown(false); setShowCreate(true); }}
                      >
                        <div style={styles.createIcon}>+</div>
                        <span>Create new group</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Shared Modals ── */}
        <CreateGroupModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(group) => {
            setShowCreate(false);
            setShowDropdown(false);
            onGroupSwitch?.(group);
            setShowInvite(group);
          }}
        />
        <InviteModal
          group={showInvite}
          onClose={() => setShowInvite(null)}
        />
      </>
    );
  }

  const mktOpen = isMarketOpen();
  const mktAH = !mktOpen && isAfterHours();
  const mktLabel = mktOpen ? 'LIVE' : mktAH ? 'AH' : 'CLOSED';
  const mktColor = mktOpen ? '#8cd9a0' : '#ef5350';

  return (
    <div style={styles.header}>
      <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0 }} onClick={() => onHomePress?.()}>
        <div>
          <div style={styles.logoRow}>
            <svg width="30" height="30" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -5, verticalAlign: 'bottom', position: 'relative', top: 6 }}>
              <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
              <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
              <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
              <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
            </svg>
            <span style={styles.logoUp}>p</span><span style={styles.logoTik}>tik</span>
          </div>
          <div style={styles.logoAlerts}>a l e r t s</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={styles.statusPill}>
            <div style={{ ...styles.statusDot, background: mktColor }} />
            <span style={{ ...styles.statusText, color: mktColor }}>{mktLabel}</span>
          </div>
          <DarkModeToggle darkMode={darkMode} onToggle={() => setDarkMode(d => !d)} t={t} />
          {/* Bell icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <div ref={avatarRef} style={{ position: 'relative' }}>
            <div style={styles.avatar} onClick={() => setShowAvatarMenu(prev => !prev)}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#f0ede8' }}>
                {(profile?.username || 'U')[0].toUpperCase()}
              </span>
            </div>
        {showAvatarMenu && (
          <div style={styles.avatarMenu}>
            <div style={styles.avatarMenuName}>{profile?.username || 'User'}</div>
            {profile?.email && <div style={styles.avatarMenuEmail}>{profile.email}</div>}
            <div style={styles.avatarMenuDivider} />
            <button style={styles.avatarMenuItem} onClick={() => { setShowAvatarMenu(false); onProfilePress?.(); }}>
              Profile Settings
            </button>
            <button style={{ ...styles.avatarMenuItem, color: '#EF4444' }} onClick={() => { setShowAvatarMenu(false); onSignOut?.(); }}>
              Sign Out
            </button>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    background: '#132d52',
    borderBottom: 'none',
    padding: '10px 16px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    color: '#f0f0f0',
  },
  chatSep: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 400,
  },
  groupNameWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  chatGroupName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#8cd9a0',
  },
  inviteBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  dropdownToggle: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
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
    borderRadius: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    zIndex: 100,
    minWidth: 200,
    overflow: 'hidden',
  },
  dropdownSection: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: 'var(--text3)',
    padding: '10px 14px 4px',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 14px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'left',
    fontFamily: 'var(--font)',
  },
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 14px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--green)',
    background: 'transparent',
    textAlign: 'left',
    fontFamily: 'var(--font)',
  },
  createIcon: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--green)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
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
  // ── Modals ──
  modalOverlay: {
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
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text1)',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text3)',
    marginBottom: 6,
  },
  modalInput: {
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
  modalSendBtn: {
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
  // ── Invite modal ──
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    gap: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 12,
    color: 'var(--text3)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  copyBtn: {
    border: 'none',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
  },
  shareOption: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 8px',
    cursor: 'pointer',
    fontSize: 11,
    color: 'var(--text2)',
    fontFamily: 'var(--font)',
  },
  skipBtn: {
    width: '100%',
    background: 'var(--card2)',
    color: 'var(--text3)',
    border: 'none',
    borderRadius: 12,
    padding: '13px 0',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  // ── Default header ──
  statusPill: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'rgba(255,255,255,0.1)', padding: '2px 7px', borderRadius: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: '50%' },
  statusText: { fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' },
  logoRow:    { display: 'flex', alignItems: 'baseline' },
  logoUp:     { fontSize: 20, fontWeight: 500, color: '#8cd9a0' },
  logoTik:    { fontSize: 20, fontWeight: 500, color: '#f0ede8' },
  logoAlerts: {
    fontSize: 11, fontWeight: 400, color: '#d4e4f2', letterSpacing: 1.5,
    fontFamily: "'Outfit', sans-serif",
    marginTop: -3, paddingLeft: 26,
  },
  avatar: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  avatarMenu: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
    zIndex: 200, minWidth: 180, overflow: 'hidden',
  },
  avatarMenuName: {
    fontSize: 13, fontWeight: 600, color: 'var(--text1)',
    padding: '12px 14px 2px',
  },
  avatarMenuEmail: {
    fontSize: 11, color: 'var(--text3)',
    padding: '0 14px 10px',
  },
  avatarMenuDivider: {
    height: 1, background: 'var(--border)', margin: '0',
  },
  avatarMenuItem: {
    display: 'block', width: '100%', padding: '11px 14px',
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 13, fontWeight: 500, color: 'var(--text1)',
    textAlign: 'left', fontFamily: 'var(--font)',
  },
};
